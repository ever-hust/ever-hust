/**
 * POST /api/inbox/account: a user-supplied IMAP/SMTP host must be refused before
 * any connection is attempted, so the server can't probe its internal network.
 */
const mockLookup = jest.fn();
jest.mock("node:dns", () => ({ promises: { lookup: (...args: unknown[]) => mockLookup(...args) } }));

const mockVerify = jest.fn();
jest.mock("../mail", () => ({
  presetForEmail: () => null,
  verifyConnection: (...args: unknown[]) => mockVerify(...args),
}));

const mockInsert = jest.fn();
jest.mock("@ever-hust/db", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    delete: jest.fn(),
  },
  emailAccounts: {},
}));
jest.mock("@ever-hust/ai/crypto", () => ({ encryptApiKey: (s: string) => `enc:${s}` }));
jest.mock("../get-session-user", () => ({ requireSessionUser: async () => ({ id: "user-1" }) }));
jest.mock("../rate-limit", () => ({ applyRateLimit: () => null }));
jest.mock("../inbox", () => ({
  loadAccount: async () => null,
  publicAccount: () => ({ connected: true }),
}));

import { POST } from "../../app/api/inbox/account/route";

function post(body: Record<string, unknown>) {
  return POST(
    new Request("http://localhost/api/inbox/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "me@example.com", password: "app-password", ...body }),
    }),
  );
}

describe("POST /api/inbox/account host guard", () => {
  beforeEach(() => {
    mockLookup.mockReset();
    mockVerify.mockReset();
    mockInsert.mockReset();
    mockLookup.mockImplementation(async (host: string) => [
      { address: /^\d+\.\d+\.\d+\.\d+$/.test(host) ? host : "93.184.216.34", family: 4 },
    ]);
  });

  it("returns 400 for a loopback IMAP host and never connects", async () => {
    const res = await post({ imapHost: "127.0.0.1", smtpHost: "smtp.example.com" });
    expect(res.status).toBe(400);
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns 400 for an internal SMTP host and never connects", async () => {
    const res = await post({ imapHost: "imap.example.com", smtpHost: "169.254.169.254" });
    expect(res.status).toBe(400);
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-mail port and never connects", async () => {
    const res = await post({ imapHost: "imap.example.com", imapPort: 6379, smtpHost: "smtp.example.com" });
    expect(res.status).toBe(400);
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("does not leak driver details for refused hosts", async () => {
    const res = await post({ imapHost: "10.0.0.5", smtpHost: "smtp.example.com" });
    const text = await res.text();
    expect(text).not.toMatch(/ECONNREFUSED|ETIMEDOUT|10\.0\.0\.5/);
  });

  it("still verifies and proceeds for public hosts on mail ports", async () => {
    mockVerify.mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: () => ({ onConflictDoUpdate: async () => undefined }) });
    const res = await post({ imapHost: "imap.example.com", smtpHost: "smtp.example.com" });
    expect(res.status).toBe(200);
    expect(mockVerify).toHaveBeenCalledTimes(1);
  });
});
