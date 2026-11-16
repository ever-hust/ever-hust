import { db, emailAccounts } from "@ever-hust/db";
import { eq } from "drizzle-orm";
import { decryptApiKey } from "@ever-hust/ai/crypto";
import type { MailConfig } from "./mail";
import { assertPublicMailHost } from "./mail-host-guard";

export type EmailAccountRow = typeof emailAccounts.$inferSelect;

/** Load the signed-in user's connected email account (raw row, incl. ciphertext). */
export async function loadAccount(userId: string): Promise<EmailAccountRow | null> {
  const rows = await db
    .select()
    .from(emailAccounts)
    .where(eq(emailAccounts.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Exchange a Google refresh token for a fresh access token (XOAUTH2). Returns
 * null when Gmail OAuth isn't configured or the refresh fails.
 */
export async function refreshGoogleAccessToken(refreshToken: string): Promise<string | null> {
  const clientId = process.env.GMAIL_INBOX_CLIENT_ID;
  const clientSecret = process.env.GMAIL_INBOX_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { access_token?: string };
    return json.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Build a usable MailConfig from a stored account. For password accounts decrypts
 * the app password; for OAuth (Gmail) accounts decrypts the refresh token and
 * mints a fresh access token. Returns null when it can't (encryption key missing,
 * OAuth not configured, refresh failed). Throws MailHostRefusedError when the
 * stored IMAP/SMTP host or port is not a public mail endpoint (rows saved before
 * that check existed), before any secret is decrypted or any connection is made.
 *
 * `protocol` names the server the caller will actually contact: "imap" for sync,
 * "smtp" for sending, "both" (default) checks each. A bad endpoint on the server
 * that is not used must not block the one that is. This is an early check only:
 * lib/mail.ts checks again at connect time and connects to the vetted address.
 */
export async function resolveMailConfig(
  account: EmailAccountRow,
  protocol: "imap" | "smtp" | "both" = "both",
): Promise<MailConfig | null> {
  if (protocol !== "smtp") await assertPublicMailHost(account.imapHost, account.imapPort);
  if (protocol !== "imap") await assertPublicMailHost(account.smtpHost, account.smtpPort);

  const base = {
    email: account.email,
    username: account.username,
    imapHost: account.imapHost,
    imapPort: account.imapPort,
    imapSecure: account.imapSecure,
    smtpHost: account.smtpHost,
    smtpPort: account.smtpPort,
    smtpSecure: account.smtpSecure,
  };

  if (account.authType === "oauth") {
    if (!account.oauthRefreshTokenEnc) return null;
    const refresh = decryptApiKey(account.oauthRefreshTokenEnc);
    if (!refresh) return null;
    const accessToken = await refreshGoogleAccessToken(refresh);
    if (!accessToken) return null;
    return { ...base, accessToken };
  }

  if (!account.passwordEnc) return null;
  const password = decryptApiKey(account.passwordEnc);
  if (password === null) return null;
  return { ...base, password };
}

/** Public, secret-free view of an account for the client. */
export function publicAccount(account: EmailAccountRow) {
  return {
    connected: true,
    email: account.email,
    authType: account.authType,
    imapHost: account.imapHost,
    smtpHost: account.smtpHost,
    status: account.status,
    lastError: account.lastError,
    lastSyncedAt: account.lastSyncedAt,
  };
}
