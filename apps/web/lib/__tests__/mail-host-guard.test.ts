const mockLookup = jest.fn();
jest.mock("node:dns", () => ({ promises: { lookup: (...args: unknown[]) => mockLookup(...args) } }));

import { assertPublicMailHost, isBlockedAddress, MailHostRefusedError } from "../mail-host-guard";

/** Make dns.lookup resolve `host` to the given addresses. */
function resolvesTo(...addresses: string[]) {
  mockLookup.mockResolvedValue(
    addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })),
  );
}

describe("assertPublicMailHost", () => {
  beforeEach(() => mockLookup.mockReset());

  it.each([
    ["127.0.0.1"],
    ["10.0.0.5"],
    ["172.16.4.1"],
    ["192.168.1.1"],
    ["169.254.169.254"],
    ["100.64.0.1"],
    ["0.0.0.0"],
    ["224.0.0.1"],
    ["::1"],
    ["::"],
    ["fd00::1"],
    ["fe80::1"],
    ["ff02::1"],
    ["::ffff:127.0.0.1"],
    ["::ffff:7f00:1"],
    ["::ffff:10.1.2.3"],
  ])("refuses %s", async (ip) => {
    resolvesTo(ip);
    await expect(assertPublicMailHost(ip, 993)).rejects.toBeInstanceOf(MailHostRefusedError);
  });

  it("refuses a name that resolves to a private address", async () => {
    resolvesTo("192.168.1.1");
    await expect(assertPublicMailHost("mail.example.com", 993)).rejects.toBeInstanceOf(MailHostRefusedError);
  });

  it("refuses when any one resolved address is internal", async () => {
    resolvesTo("93.184.216.34", "10.0.0.5");
    await expect(assertPublicMailHost("mail.example.com", 993)).rejects.toBeInstanceOf(MailHostRefusedError);
  });

  it("refuses a name that does not exist, as a permanent refusal", async () => {
    mockLookup.mockRejectedValue(Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }));
    const err = await assertPublicMailHost("nope.invalid", 993).catch((e: MailHostRefusedError) => e);
    expect(err).toBeInstanceOf(MailHostRefusedError);
    expect((err as MailHostRefusedError).transient).toBe(false);
  });

  it("flags a temporary DNS failure as transient so saved accounts aren't parked", async () => {
    mockLookup.mockRejectedValue(Object.assign(new Error("getaddrinfo EAI_AGAIN"), { code: "EAI_AGAIN" }));
    const err = await assertPublicMailHost("imap.example.com", 993).catch((e: MailHostRefusedError) => e);
    expect(err).toBeInstanceOf(MailHostRefusedError);
    expect((err as MailHostRefusedError).transient).toBe(true);
  });

  it("marks policy refusals as not transient", async () => {
    resolvesTo("10.0.0.5");
    const err = await assertPublicMailHost("mail.example.com", 993).catch((e: MailHostRefusedError) => e);
    expect((err as MailHostRefusedError).transient).toBe(false);
  });

  it.each([6379, 22, 80, 5432, 0, 65536, 993.5, NaN])("refuses non-mail port %s", async (port) => {
    resolvesTo("93.184.216.34");
    await expect(assertPublicMailHost("mail.example.com", port)).rejects.toBeInstanceOf(MailHostRefusedError);
  });

  it("refuses an empty host without resolving", async () => {
    await expect(assertPublicMailHost("  ", 993)).rejects.toBeInstanceOf(MailHostRefusedError);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it.each([993, 143, 465, 587, 25, 2525])("allows a public address on port %s", async (port) => {
    resolvesTo("93.184.216.34");
    await expect(assertPublicMailHost("imap.example.com", port)).resolves.toBeUndefined();
  });

  it("allows a public IPv6 address", async () => {
    resolvesTo("2606:2800:220:1:248:1893:25c8:1946");
    await expect(assertPublicMailHost("imap.example.com", 993)).resolves.toBeUndefined();
  });

  it("uses a generic message that does not echo the host", async () => {
    resolvesTo("127.0.0.1");
    const err = await assertPublicMailHost("internal.svc.cluster.local", 993).catch((e: Error) => e);
    expect(err).toBeInstanceOf(MailHostRefusedError);
    expect((err as Error).message).not.toContain("internal");
    expect((err as Error).message).not.toContain("127.0.0.1");
  });
});

describe("isBlockedAddress keeps public ranges open", () => {
  it.each(["8.8.8.8", "172.15.0.1", "172.32.0.1", "100.63.0.1", "100.128.0.1", "169.253.0.1", "2001:4860:4860::8888"])(
    "%s is public",
    (ip) => {
      expect(isBlockedAddress(ip)).toBe(false);
    },
  );
});
