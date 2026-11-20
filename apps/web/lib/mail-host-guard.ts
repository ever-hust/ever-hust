import { promises as dns } from "node:dns";
import { isIP } from "node:net";

/**
 * Server-side request guard for user-supplied IMAP/SMTP endpoints. The Inbox lets a
 * signed-in user name their own mail server; without a check the server would
 * connect to loopback, private, link-local or cluster-internal addresses on any
 * port, and the driver error would reveal which ones answer. Server-only.
 */

/** Standard mail ports (IMAP 143/993, SMTP 25/465/587/2525). */
export const ALLOWED_MAIL_PORTS: readonly number[] = [993, 143, 465, 587, 25, 2525];

/** Thrown when a mail endpoint is refused. The message is safe to show to the user. */
export class MailHostRefusedError extends Error {
  /**
   * True when the host could not be checked right now (a DNS timeout or server
   * failure) rather than being refused by policy. Callers must not mark a saved
   * account as broken for a transient failure.
   */
  readonly transient: boolean;

  constructor(
    message = "That mail server address isn't allowed. Use your provider's public IMAP/SMTP host.",
    transient = false,
  ) {
    super(message);
    this.name = "MailHostRefusedError";
    this.transient = transient;
  }
}

/** DNS answers that mean the name definitively does not exist (not a temporary failure). */
const DEFINITIVE_DNS_CODES = new Set(["ENOTFOUND", "ENODATA"]);

type IPv4Octets = [number, number, number, number];
type IPv6Groups = [number, number, number, number, number, number, number, number];

function parseIPv4(ip: string): IPv4Octets | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out.push(n);
  }
  return out as IPv4Octets;
}

function isBlockedIPv4(o: IPv4Octets): boolean {
  const [a, b] = o;
  return (
    a === 0 || // 0.0.0.0/8 unspecified / "this network"
    a === 10 || // private
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
    (a === 169 && b === 254) || // link-local (incl. cloud metadata)
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    a >= 224 // multicast (224/4), reserved (240/4), broadcast
  );
}

/** Expand an IPv6 literal into eight 16-bit groups, or null when malformed. */
function parseIPv6(ip: string): IPv6Groups | null {
  let s = (ip.split("%")[0] ?? "").toLowerCase();
  // Trailing dotted IPv4 (e.g. ::ffff:127.0.0.1) -> two hex groups.
  const lastColon = s.lastIndexOf(":");
  if (s.includes(".")) {
    const v4 = parseIPv4(s.slice(lastColon + 1));
    if (!v4) return null;
    s =
      s.slice(0, lastColon + 1) +
      ((v4[0] << 8) | v4[1]).toString(16) +
      ":" +
      ((v4[2] << 8) | v4[3]).toString(16);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (groups.length !== 8) return null;
  const out: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out.push(parseInt(g, 16));
  }
  return out as IPv6Groups;
}

function isBlockedIPv6(g: IPv6Groups): boolean {
  const allZeroUpTo = (n: number) => g.slice(0, n).every((x) => x === 0);
  if (allZeroUpTo(7) && (g[7] === 0 || g[7] === 1)) return true; // :: and ::1
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d): judge the embedded v4.
  if (allZeroUpTo(5) && (g[5] === 0xffff || g[5] === 0)) {
    return isBlockedIPv4([g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255]);
  }
  // NAT64 64:ff9b::/96 embeds an IPv4 address too.
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    return isBlockedIPv4([g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255]);
  }
  if ((g[0] & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((g[0] & 0xfe00) === 0xfc00) return true; // unique-local fc00::/7
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast ff00::/8
  return false;
}

/** True when the address literal is loopback/private/link-local/etc. Unparseable -> true (fail closed). */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address.split("%")[0] ?? "");
  if (family === 4) {
    const o = parseIPv4(address);
    return !o || isBlockedIPv4(o);
  }
  if (family === 6) {
    const g = parseIPv6(address);
    return !g || isBlockedIPv6(g);
  }
  return true;
}

/** A vetted mail endpoint: connect to `address`, check TLS against `servername`. */
export interface PinnedMailHost {
  /** The resolved public IP to connect to. Connect to this, never to the name. */
  address: string;
  /** Host name for TLS SNI and certificate checks; undefined when the host is an IP literal. */
  servername?: string;
}

/**
 * Resolves `host` once and returns one vetted address to connect to. Throws
 * MailHostRefusedError unless `host:port` is a standard mail port on a host whose
 * every resolved address is public. Resolution failure is also a refusal.
 *
 * Callers must connect to the returned `address` (with `servername` for TLS), not
 * to `host`: resolving the name again at connect time would let a DNS-rebinding
 * host answer "public" here and "internal" there.
 */
export async function resolvePublicMailHost(host: string, port: number): Promise<PinnedMailHost> {
  const name = typeof host === "string" ? host.trim().replace(/^\[|\]$/g, "") : "";
  if (!name || name.length > 255 || !Number.isInteger(port) || !ALLOWED_MAIL_PORTS.includes(port)) {
    throw new MailHostRefusedError();
  }

  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(name, { all: true });
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code && DEFINITIVE_DNS_CODES.has(code)) throw new MailHostRefusedError();
    throw new MailHostRefusedError("Couldn't look up that mail server right now. Try again shortly.", true);
  }
  if (addresses.length === 0 || addresses.some((a) => isBlockedAddress(a.address))) {
    throw new MailHostRefusedError();
  }
  // Prefer IPv4: a pinned address gets no dual-stack fallback, and many servers
  // have no IPv6 route.
  const picked = addresses.find((a) => isIP(a.address) === 4) ?? addresses[0];
  if (!picked) throw new MailHostRefusedError();
  return { address: picked.address, servername: isIP(name) ? undefined : name };
}

/** Same check as resolvePublicMailHost, for callers that only need a yes or no. */
export async function assertPublicMailHost(host: string, port: number): Promise<void> {
  await resolvePublicMailHost(host, port);
}
