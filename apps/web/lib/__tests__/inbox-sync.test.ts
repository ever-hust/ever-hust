jest.mock("@ever-hust/db", () => ({
  db: {},
  emailAccounts: {},
  emailMessages: {},
  userJobs: {},
  jobs: {},
}));
jest.mock("../mail", () => ({ fetchRecent: jest.fn() }));
jest.mock("../inbox", () => ({ resolveMailConfig: jest.fn() }));
jest.mock("../application-pipeline", () => ({ advanceApplicationStage: jest.fn() }));

import { matchJob } from "../inbox-sync";

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
