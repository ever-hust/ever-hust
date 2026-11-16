// The user's applied/saved jobs that syncAccount's candidate query returns.
const mockJobRows: { id: number; name: string | null; url: string | null }[] = [];

jest.mock("@ever-hust/db", () => {
  // A drizzle query chain: every builder call returns the chain, awaiting it gives `value()`.
  const chain = (value: () => unknown): unknown => {
    const p: unknown = new Proxy(function () {}, {
      get: (_t, prop) =>
        prop === "then"
          ? (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
              Promise.resolve(value()).then(res, rej)
          : () => p,
    });
    return p;
  };
  return {
    db: {
      select: () => chain(() => mockJobRows),
      insert: () => chain(() => [{ id: 1 }]),
      update: () => chain(() => undefined),
    },
    emailAccounts: {},
    emailMessages: {},
    userJobs: {},
    jobs: {},
  };
});
jest.mock("drizzle-orm", () => ({ and: jest.fn(), eq: jest.fn(), inArray: jest.fn() }));
jest.mock("../mail", () => ({ fetchRecent: jest.fn() }));
jest.mock("../inbox", () => ({ resolveMailConfig: jest.fn() }));
jest.mock("../application-pipeline", () => ({ advanceApplicationStage: jest.fn() }));

import { matchJob, syncAccount } from "../inbox-sync";
import { fetchRecent } from "../mail";
import { resolveMailConfig, type EmailAccountRow } from "../inbox";
import { advanceApplicationStage } from "../application-pipeline";

const job = (id: number, name: string | null, domain: string | null) => ({ id, name, domain });

describe("matchJob domain matching", () => {
  const candidates = [job(1, "Box", "box.com")];

  it("does not match a sender whose domain merely ends with the company domain", () => {
    expect(matchJob(candidates, "x@dropbox.com", "Update", "Thanks")).toBeNull();
  });

  it("matches the exact domain", () => {
    expect(matchJob(candidates, "x@box.com", "Update", "Thanks")).toBe(1);
  });

  it("matches a subdomain of the company domain", () => {
    expect(matchJob(candidates, "x@mail.box.com", "Update", "Thanks")).toBe(1);
    expect(matchJob(candidates, "Recruiting <x@mail.box.com>", null, null)).toBe(1);
  });

  it("does not let a short domain match unrelated longer ones", () => {
    expect(matchJob([job(2, null, "x.com")], "a@netflix.com", null, null)).toBeNull();
  });
});

describe("matchJob name matching", () => {
  const candidates = [job(7, "Meta", null)];

  it("does not match a name inside a longer word", () => {
    expect(matchJob(candidates, null, "Your documents", "metadata attached")).toBeNull();
  });

  it("matches the name as a whole word", () => {
    expect(matchJob(candidates, null, "Interview at Meta", "See you soon")).toBe(7);
    expect(matchJob(candidates, null, null, "Thanks, Meta.")).toBe(7);
  });

  it("keeps the 4-character minimum", () => {
    expect(matchJob([job(8, "IBM", null)], null, "Interview at IBM", null)).toBeNull();
  });

  it("does not throw on names with regex characters", () => {
    const c = [job(9, "C++ Labs", null)];
    expect(() => matchJob(c, null, "Hello", "body")).not.toThrow();
    expect(matchJob(c, null, "Interview with C++ Labs", null)).toBe(9);
    expect(() => matchJob([job(10, "(Acme [", null)], null, "x", "y")).not.toThrow();
  });

  it("returns null when the company name is missing", () => {
    expect(matchJob([job(11, null, null)], "a@b.com", "s", "b")).toBeNull();
  });
});

describe("matchJob ambiguity", () => {
  it("links nothing when the sender domain fits two jobs", () => {
    const c = [job(1, "Google", "google.com"), job(2, "Google", "google.com")];
    expect(matchJob(c, "Recruiting <no-reply@google.com>", "Your application", "Unfortunately")).toBeNull();
  });

  it("does not fall back to the name when the domain fits two jobs", () => {
    const c = [job(1, "Google", "google.com"), job(2, "Google Cloud", "google.com")];
    expect(matchJob(c, "x@google.com", "Interview at Google Cloud", null)).toBeNull();
  });

  it("still links when the domain fits one job and another job is named in the text", () => {
    const c = [job(1, "Acme", "acme.com"), job(2, "Globex", "globex.com")];
    expect(matchJob(c, "x@acme.com", "Acme vs Globex", null)).toBe(1);
  });

  it("links nothing when two jobs share the company name", () => {
    const c = [job(1, "Acme", "acme.com"), job(2, "Acme", "acme.com")];
    expect(matchJob(c, "no-reply@ats.example", "Your application to Acme", "Unfortunately")).toBeNull();
  });

  it("links nothing when the email names two different companies", () => {
    const c = [job(1, "Acme", null), job(2, "Globex", null)];
    expect(matchJob(c, "digest@jobs.example", "Acme and Globex are hiring", null)).toBeNull();
  });

  it("links by name when exactly one company is named", () => {
    const c = [job(1, "Acme", null), job(2, "Globex", null)];
    expect(matchJob(c, "no-reply@ats.example", "Your application to Acme", null)).toBe(1);
  });
});

describe("matchJob sender identity", () => {
  it("reads the domain from the address, not from an @ in the display name", () => {
    const c = [job(1, "Box", "box.com")];
    expect(matchJob(c, '"talent@box.com" <noreply@other.example>', "Update", "Thanks")).toBeNull();
    expect(matchJob(c, '"talent@other.example" <x@box.com>', "Update", "Thanks")).toBe(1);
  });
});

describe("syncAccount status changes", () => {
  const account = { id: "acc-1" } as unknown as EmailAccountRow;
  const msg = (uid: number, fromAddr: string, subject: string, bodyText: string) => ({
    uid,
    messageId: `<m${uid}@mail>`,
    threadKey: `t${uid}`,
    fromAddr,
    toAddrs: "me@example.com",
    subject,
    snippet: bodyText.slice(0, 50),
    bodyText,
    bodyHtml: null,
    sentAt: new Date(),
  });
  const rejection = "Unfortunately, we will not be moving forward with your application.";

  beforeEach(() => {
    jest.clearAllMocks();
    mockJobRows.length = 0;
    mockJobRows.push(
      { id: 1, name: "Google", url: "https://google.com" },
      { id: 2, name: "Google", url: "https://google.com/careers" },
      { id: 3, name: "Box", url: "https://www.box.com" },
    );
    (resolveMailConfig as jest.Mock).mockResolvedValue({});
  });

  it("moves only the application the email clearly belongs to", async () => {
    (fetchRecent as jest.Mock).mockResolvedValue([
      msg(1, "Google <no-reply@google.com>", "Your application", rejection),
      msg(2, "Box Talent <talent@box.com>", "Your application", rejection),
      msg(3, "Dropbox <jobs@dropbox.com>", "Your application", rejection),
    ]);

    const res = await syncAccount("user-1", account);

    expect(res).toEqual({ fetched: 3, stored: 3 });
    expect(advanceApplicationStage).toHaveBeenCalledTimes(1);
    expect(advanceApplicationStage).toHaveBeenCalledWith("user-1", 3, "rejection");
  });
});
