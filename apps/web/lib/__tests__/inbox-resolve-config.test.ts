/**
 * resolveMailConfig only checks the server the caller will contact, so a bad
 * endpoint on the unused protocol doesn't block sync (IMAP) or sending (SMTP).
 */
const mockLookup = jest.fn();
jest.mock("node:dns", () => ({ promises: { lookup: (...args: unknown[]) => mockLookup(...args) } }));
jest.mock("@ever-hust/db", () => ({ db: {}, emailAccounts: {} }));
jest.mock("@ever-hust/ai/crypto", () => ({ decryptApiKey: (s: string) => s.replace(/^enc:/, "") }));

import { resolveMailConfig, type EmailAccountRow } from "../inbox";
import { MailHostRefusedError } from "../mail-host-guard";

function account(over: Partial<EmailAccountRow>): EmailAccountRow {
  return {
    email: "me@example.com",
    username: "me@example.com",
    authType: "password",
    passwordEnc: "enc:secret",
    oauthRefreshTokenEnc: null,
    imapHost: "imap.example.com",
    imapPort: 993,
    imapSecure: true,
    smtpHost: "smtp.example.com",
    smtpPort: 465,
    smtpSecure: true,
    ...over,
  } as EmailAccountRow;
}

describe("resolveMailConfig host guard", () => {
  beforeEach(() => {
    mockLookup.mockReset();
    mockLookup.mockImplementation(async (host: string) => [
      { address: /^\d+\.\d+\.\d+\.\d+$/.test(host) ? host : "93.184.216.34", family: 4 },
    ]);
  });

  it("refuses an internal IMAP host for sync and for both", async () => {
    const a = account({ imapHost: "10.0.0.5" });
    await expect(resolveMailConfig(a, "imap")).rejects.toBeInstanceOf(MailHostRefusedError);
    await expect(resolveMailConfig(a)).rejects.toBeInstanceOf(MailHostRefusedError);
  });

  it("does not let a bad SMTP host block IMAP sync", async () => {
    const cfg = await resolveMailConfig(account({ smtpHost: "127.0.0.1" }), "imap");
    expect(cfg?.password).toBe("secret");
  });

  it("does not let a bad IMAP host block SMTP sending", async () => {
    const cfg = await resolveMailConfig(account({ imapHost: "127.0.0.1" }), "smtp");
    expect(cfg?.password).toBe("secret");
  });

  it("refuses an internal SMTP host for sending", async () => {
    await expect(resolveMailConfig(account({ smtpHost: "169.254.169.254" }), "smtp")).rejects.toBeInstanceOf(
      MailHostRefusedError,
    );
  });

  it("refuses a non-mail stored port", async () => {
    await expect(resolveMailConfig(account({ imapPort: 6379 }), "imap")).rejects.toBeInstanceOf(
      MailHostRefusedError,
    );
  });
});
