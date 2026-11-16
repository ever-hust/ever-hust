/**
 * lib/mail.ts connects to the address the host guard vetted, never to the name, so
 * a DNS-rebinding host can't answer "public" to the check and "internal" to the
 * connect. Driver errors never reach the user.
 */
const mockLookup = jest.fn();
jest.mock("node:dns", () => ({ promises: { lookup: (...args: unknown[]) => mockLookup(...args) } }));

const mockImapConnect = jest.fn();
const mockImapOptions: Record<string, unknown>[] = [];
jest.mock("imapflow", () => ({
  ImapFlow: jest.fn().mockImplementation((opts: Record<string, unknown>) => {
    mockImapOptions.push(opts);
    return { connect: mockImapConnect, logout: jest.fn(async () => undefined) };
  }),
}));

const mockSmtpVerify = jest.fn();
const mockSmtpSend = jest.fn();
const mockSmtpOptions: Record<string, unknown>[] = [];
jest.mock("nodemailer", () => ({
  __esModule: true,
  default: {
    createTransport: (opts: Record<string, unknown>) => {
      mockSmtpOptions.push(opts);
      return { verify: mockSmtpVerify, sendMail: mockSmtpSend };
    },
  },
}));
jest.mock("mailparser", () => ({ simpleParser: jest.fn() }));

import { fetchRecent, sendMail, verifyConnection, type MailConfig } from "../mail";
import { assertPublicMailHost, MailHostRefusedError } from "../mail-host-guard";

const cfg: MailConfig = {
  email: "me@example.com",
  username: "me@example.com",
  password: "app-password",
  imapHost: "imap.example.com",
  imapPort: 993,
  imapSecure: true,
  smtpHost: "smtp.example.com",
  smtpPort: 587,
  smtpSecure: false,
};

const PUBLIC = "93.184.216.34";

/** First answer for each name is public, every later answer is loopback (DNS rebinding). */
function rebindingDns() {
  const seen = new Map<string, number>();
  mockLookup.mockImplementation(async (host: string) => {
    const n = (seen.get(host) ?? 0) + 1;
    seen.set(host, n);
    return [{ address: n === 1 ? PUBLIC : "127.0.0.1", family: 4 }];
  });
}

beforeEach(() => {
  mockLookup.mockReset();
  mockImapConnect.mockReset();
  mockSmtpVerify.mockReset();
  mockSmtpSend.mockReset();
  mockImapOptions.length = 0;
  mockSmtpOptions.length = 0;
  mockLookup.mockResolvedValue([{ address: PUBLIC, family: 4 }]);
});

describe("connections are pinned to the vetted address", () => {
  it("IMAP and SMTP connect to the resolved IP and check TLS against the host name", async () => {
    mockImapConnect.mockResolvedValue(undefined);
    mockSmtpVerify.mockResolvedValue(true);
    await verifyConnection(cfg);
    expect(mockImapOptions[0]).toMatchObject({ host: PUBLIC, servername: "imap.example.com", port: 993 });
    expect(mockSmtpOptions[0]).toMatchObject({
      host: PUBLIC,
      port: 587,
      tls: { servername: "smtp.example.com" },
    });
  });

  it("a rebinding host that passed the route check is refused at connect, never dialled", async () => {
    rebindingDns();
    await assertPublicMailHost(cfg.imapHost, cfg.imapPort); // the route's check sees "public"
    await expect(verifyConnection(cfg)).rejects.toBeInstanceOf(MailHostRefusedError);
    expect(mockImapOptions).toHaveLength(0);
    expect(mockImapConnect).not.toHaveBeenCalled();
  });

  it("fetchRecent and sendMail refuse an internal answer too", async () => {
    mockLookup.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);
    await expect(fetchRecent(cfg)).rejects.toBeInstanceOf(MailHostRefusedError);
    await expect(sendMail(cfg, { to: "a@b.com", subject: "hi" })).rejects.toBeInstanceOf(MailHostRefusedError);
    expect(mockImapOptions).toHaveLength(0);
    expect(mockSmtpOptions).toHaveLength(0);
  });

  it("prefers the IPv4 answer when a name has both", async () => {
    mockLookup.mockResolvedValue([
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
      { address: PUBLIC, family: 4 },
    ]);
    mockImapConnect.mockResolvedValue(undefined);
    mockSmtpVerify.mockResolvedValue(true);
    await verifyConnection(cfg);
    expect(mockImapOptions[0]).toMatchObject({ host: PUBLIC });
  });

  it("an IP-literal host gets no SNI name", async () => {
    mockImapConnect.mockResolvedValue(undefined);
    mockSmtpVerify.mockResolvedValue(true);
    await verifyConnection({ ...cfg, imapHost: PUBLIC, smtpHost: PUBLIC });
    expect(mockImapOptions[0]).toMatchObject({ host: PUBLIC, servername: undefined });
    expect(mockSmtpOptions[0]?.tls).toBeUndefined();
  });
});

describe("driver errors stay on the server", () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  afterAll(() => warn.mockRestore());

  it("a refused connection does not echo addresses or ports", async () => {
    mockImapConnect.mockRejectedValue(
      Object.assign(new Error(`connect ECONNREFUSED ${PUBLIC}:993`), { code: "ECONNREFUSED" }),
    );
    const err = await verifyConnection(cfg).catch((e: Error) => e);
    expect((err as Error).message).toMatch(/Could not connect to the IMAP server/);
    expect((err as Error).message).not.toMatch(/ECONNREFUSED|93\.184|993/);
  });

  it("a server banner is not echoed", async () => {
    mockImapConnect.mockResolvedValue(undefined);
    mockSmtpVerify.mockRejectedValue(new Error("Invalid greeting. response=220 internal-relay ESMTP v1.2"));
    const err = await verifyConnection(cfg).catch((e: Error) => e);
    expect((err as Error).message).toMatch(/Could not connect to the SMTP server/);
    expect((err as Error).message).not.toMatch(/internal-relay|greeting/);
  });

  it("an auth failure still says so", async () => {
    mockImapConnect.mockRejectedValue(Object.assign(new Error("Command failed"), { authenticationFailed: true }));
    await expect(verifyConnection(cfg)).rejects.toThrow(/IMAP login failed\. Check your email address and app password/);
    mockImapConnect.mockResolvedValue(undefined);
    mockSmtpVerify.mockRejectedValue(Object.assign(new Error("535 bad creds"), { code: "EAUTH" }));
    await expect(verifyConnection(cfg)).rejects.toThrow(/SMTP login failed\. Check your email address and app password/);
  });
});
