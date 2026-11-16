/**
 * syncAccount stores lastError, which GET /api/inbox/account returns to the client:
 * it must never carry the driver's text (addresses, ports, server banners).
 */
const mockSet = jest.fn();
jest.mock("@ever-hust/db", () => ({
  db: {
    update: () => ({
      set: (values: Record<string, unknown>) => {
        mockSet(values);
        return { where: async () => undefined };
      },
    }),
  },
  emailAccounts: {},
  emailMessages: {},
  userJobs: {},
  jobs: {},
}));
jest.mock("drizzle-orm", () => ({ and: jest.fn(), eq: jest.fn(), inArray: jest.fn() }));
jest.mock("../application-pipeline", () => ({ advanceApplicationStage: jest.fn() }));
jest.mock("../inbox", () => ({ resolveMailConfig: async () => ({ imapHost: "imap.example.com" }) }));
const mockFetchRecent = jest.fn();
jest.mock("../mail", () => ({ fetchRecent: (...args: unknown[]) => mockFetchRecent(...args) }));

import { syncAccount } from "../inbox-sync";
import { MailHostRefusedError } from "../mail-host-guard";
import type { EmailAccountRow } from "../inbox";

const account = { id: 1, userId: "user-1" } as unknown as EmailAccountRow;

describe("syncAccount lastError", () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  afterAll(() => warn.mockRestore());
  beforeEach(() => mockSet.mockReset());

  it("stores a generic text for a driver error", async () => {
    mockFetchRecent.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:993"));
    const r = await syncAccount("user-1", account);
    expect(r.fetched).toBe(0);
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: "error" }));
    const stored = String(mockSet.mock.calls[0]?.[0]?.lastError);
    expect(stored).not.toMatch(/ECONNREFUSED|10\.0\.0\.5|993/);
  });

  it("stores the refusal text for a refused host", async () => {
    mockFetchRecent.mockRejectedValue(new MailHostRefusedError());
    await syncAccount("user-1", account);
    expect(mockSet.mock.calls[0]?.[0]?.lastError).toBe(new MailHostRefusedError().message);
  });
});
