import { db, emailAccounts } from "@ever-hust/db";
import { eq } from "drizzle-orm";
import { decryptApiKey } from "@ever-hust/ai/crypto";
import type { MailConfig } from "./mail";

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

/** Build a usable MailConfig from a stored account (decrypts the password). */
export function toMailConfig(account: EmailAccountRow): MailConfig | null {
  const password = decryptApiKey(account.passwordEnc);
  if (password === null) return null; // encryption not configured / corrupt
  return {
    email: account.email,
    username: account.username,
    password,
    imapHost: account.imapHost,
    imapPort: account.imapPort,
    imapSecure: account.imapSecure,
    smtpHost: account.smtpHost,
    smtpPort: account.smtpPort,
    smtpSecure: account.smtpSecure,
  };
}

/** Public, password-free view of an account for the client. */
export function publicAccount(account: EmailAccountRow) {
  return {
    connected: true,
    email: account.email,
    imapHost: account.imapHost,
    smtpHost: account.smtpHost,
    status: account.status,
    lastError: account.lastError,
    lastSyncedAt: account.lastSyncedAt,
  };
}
