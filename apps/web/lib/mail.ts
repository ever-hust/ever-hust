import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { simpleParser } from "mailparser";

/**
 * Server-only email access for the Inbox: read an existing mailbox over IMAP and
 * send from it over SMTP. Works with any provider (Gmail, Outlook, iCloud, custom)
 * using an app-specific password — no OAuth-app verification required. Imported
 * ONLY by API route handlers (never client components).
 */

export interface MailConfig {
  email: string;
  username: string;
  /** Decrypted app password (password auth). Omit when using OAuth. */
  password?: string;
  /** Fresh OAuth access token (XOAUTH2). When set, used instead of password. */
  accessToken?: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
}

export interface ParsedMail {
  uid: number | null;
  messageId: string | null;
  threadKey: string | null;
  fromAddr: string | null;
  toAddrs: string | null;
  subject: string | null;
  snippet: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  sentAt: Date | null;
}

/** Common provider presets so users only enter email + app password. */
export function presetForEmail(email: string): Partial<MailConfig> | null {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  const gmail = { imapHost: "imap.gmail.com", imapPort: 993, imapSecure: true, smtpHost: "smtp.gmail.com", smtpPort: 465, smtpSecure: true };
  const outlook = { imapHost: "outlook.office365.com", imapPort: 993, imapSecure: true, smtpHost: "smtp.office365.com", smtpPort: 587, smtpSecure: false };
  const presets: Record<string, Partial<MailConfig>> = {
    "gmail.com": gmail,
    "googlemail.com": gmail,
    "outlook.com": outlook,
    "hotmail.com": outlook,
    "live.com": outlook,
    "office365.com": outlook,
    "yahoo.com": { imapHost: "imap.mail.yahoo.com", imapPort: 993, imapSecure: true, smtpHost: "smtp.mail.yahoo.com", smtpPort: 465, smtpSecure: true },
    "icloud.com": { imapHost: "imap.mail.me.com", imapPort: 993, imapSecure: true, smtpHost: "smtp.mail.me.com", smtpPort: 587, smtpSecure: false },
    "me.com": { imapHost: "imap.mail.me.com", imapPort: 993, imapSecure: true, smtpHost: "smtp.mail.me.com", smtpPort: 587, smtpSecure: false },
  };
  return presets[domain] ?? null;
}

/** Strip Re:/Fwd: prefixes and lowercase for conversation grouping. */
export function threadKeyFor(subject: string | null | undefined): string {
  return (subject ?? "")
    .replace(/^\s*(re|fwd|fw)\s*:\s*/gi, "")
    .replace(/^\s*(re|fwd|fw)\s*:\s*/gi, "")
    .trim()
    .toLowerCase()
    .slice(0, 200);
}

function imapClient(cfg: MailConfig): ImapFlow {
  const user = cfg.username || cfg.email;
  return new ImapFlow({
    host: cfg.imapHost,
    port: cfg.imapPort,
    secure: cfg.imapSecure,
    // XOAUTH2 when an access token is present, else password.
    auth: cfg.accessToken
      ? { user, accessToken: cfg.accessToken }
      : { user, pass: cfg.password ?? "" },
    logger: false,
  });
}

function smtpTransport(cfg: MailConfig) {
  const user = cfg.username || cfg.email;
  return nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpSecure,
    auth: cfg.accessToken
      ? { type: "OAuth2", user, accessToken: cfg.accessToken }
      : { user, pass: cfg.password ?? "" },
  });
}

/** Verify both IMAP login and SMTP login. Throws with a friendly message. */
export async function verifyConnection(cfg: MailConfig): Promise<void> {
  const client = imapClient(cfg);
  try {
    await client.connect();
  } catch (err) {
    throw new Error(`IMAP login failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }
  try {
    await smtpTransport(cfg).verify();
  } catch (err) {
    throw new Error(`SMTP login failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Fetch the most recent `limit` messages from INBOX, parsed. */
export async function fetchRecent(cfg: MailConfig, limit = 30): Promise<ParsedMail[]> {
  const client = imapClient(cfg);
  const out: ParsedMail[] = [];
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const mailbox = client.mailbox;
    const exists = mailbox && typeof mailbox !== "boolean" ? mailbox.exists : 0;
    if (!exists) return out;
    const start = Math.max(1, exists - limit + 1);
    for await (const msg of client.fetch(`${start}:*`, { uid: true, source: true })) {
      if (!msg.source) continue;
      try {
        const parsed = await simpleParser(msg.source as Buffer);
        const bodyText = parsed.text ?? null;
        const snippet = (bodyText ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
        out.push({
          uid: msg.uid ?? null,
          messageId: parsed.messageId ?? null,
          threadKey: threadKeyFor(parsed.subject),
          fromAddr: parsed.from?.text ?? null,
          toAddrs: Array.isArray(parsed.to) ? parsed.to.map((t) => t.text).join(", ") : parsed.to?.text ?? null,
          subject: parsed.subject ?? null,
          snippet,
          bodyText,
          bodyHtml: typeof parsed.html === "string" ? parsed.html : null,
          sentAt: parsed.date ?? null,
        });
      } catch {
        /* skip unparseable message */
      }
    }
  } finally {
    lock.release();
    try { await client.logout(); } catch { /* ignore */ }
  }
  // Newest first.
  return out.sort((a, b) => (b.sentAt?.getTime() ?? 0) - (a.sentAt?.getTime() ?? 0));
}

export interface OutgoingMail {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string;
}

/** Send a message over SMTP from the connected account. Returns the Message-ID. */
export async function sendMail(cfg: MailConfig, mail: OutgoingMail): Promise<string> {
  const info = await smtpTransport(cfg).sendMail({
    from: cfg.email,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    inReplyTo: mail.inReplyTo,
    references: mail.references,
  });
  return info.messageId ?? "";
}
