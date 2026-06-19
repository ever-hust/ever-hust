import { db, emailAccounts } from "@ever-hust/db";
import { eq } from "drizzle-orm";
import type { NextResponse } from "next/server";
import { encryptApiKey } from "@ever-hust/ai/crypto";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { apiSuccess, apiBadRequest, apiError, safeJsonParse } from "../../../../lib/api-response";
import { loadAccount, publicAccount } from "../../../../lib/inbox";
import { presetForEmail, verifyConnection, type MailConfig } from "../../../../lib/mail";

export const maxDuration = 30;

/** GET — the connected account (no secrets), or { connected: false }. */
export async function GET() {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const rl = applyRateLimit(user.id, "authenticated");
  if (rl) return rl;

  const account = await loadAccount(user.id);
  return apiSuccess(account ? publicAccount(account) : { connected: false });
}

/** POST — connect (or replace) an account. Verifies IMAP+SMTP before saving. */
export async function POST(req: Request) {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const rl = applyRateLimit(user.id, "authenticated");
  if (rl) return rl;

  const jsonResult = await safeJsonParse(req);
  if (!jsonResult.ok) return jsonResult.response;
  const b = jsonResult.data as Record<string, unknown>;

  const email = typeof b.email === "string" ? b.email.trim() : "";
  const password = typeof b.password === "string" ? b.password : "";
  if (!email || !email.includes("@") || !password) {
    return apiBadRequest("Email and password (app password) are required");
  }

  const preset = presetForEmail(email) ?? {};
  const cfg: MailConfig = {
    email,
    username: (typeof b.username === "string" && b.username.trim()) || email,
    password,
    imapHost: (typeof b.imapHost === "string" && b.imapHost) || preset.imapHost || "",
    imapPort: Number(b.imapPort) || preset.imapPort || 993,
    imapSecure: typeof b.imapSecure === "boolean" ? b.imapSecure : preset.imapSecure ?? true,
    smtpHost: (typeof b.smtpHost === "string" && b.smtpHost) || preset.smtpHost || "",
    smtpPort: Number(b.smtpPort) || preset.smtpPort || 465,
    smtpSecure: typeof b.smtpSecure === "boolean" ? b.smtpSecure : preset.smtpSecure ?? true,
  };
  if (!cfg.imapHost || !cfg.smtpHost) {
    return apiBadRequest(
      "Couldn't auto-detect your provider's mail servers. Please enter the IMAP and SMTP host.",
    );
  }

  // Verify credentials before storing them.
  try {
    await verifyConnection(cfg);
  } catch (err) {
    return apiBadRequest(err instanceof Error ? err.message : "Could not connect to your mailbox");
  }

  let passwordEnc: string;
  try {
    passwordEnc = encryptApiKey(password);
  } catch {
    return apiError("Email connection is not configured on the server (missing encryption key).");
  }

  try {
    await db
      .insert(emailAccounts)
      .values({
        userId: user.id,
        email: cfg.email,
        username: cfg.username,
        authType: "password",
        passwordEnc,
        oauthRefreshTokenEnc: null,
        imapHost: cfg.imapHost,
        imapPort: cfg.imapPort,
        imapSecure: cfg.imapSecure,
        smtpHost: cfg.smtpHost,
        smtpPort: cfg.smtpPort,
        smtpSecure: cfg.smtpSecure,
        status: "connected",
        lastError: null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: emailAccounts.userId,
        set: {
          email: cfg.email,
          username: cfg.username,
          authType: "password",
          passwordEnc,
          oauthRefreshTokenEnc: null,
          imapHost: cfg.imapHost,
          imapPort: cfg.imapPort,
          imapSecure: cfg.imapSecure,
          smtpHost: cfg.smtpHost,
          smtpPort: cfg.smtpPort,
          smtpSecure: cfg.smtpSecure,
          status: "connected",
          lastError: null,
          updatedAt: new Date(),
        },
      });
    const account = await loadAccount(user.id);
    return apiSuccess(account ? publicAccount(account) : { connected: true });
  } catch (err) {
    console.error("[api/inbox/account] save failed:", err instanceof Error ? err.message : err);
    return apiError("Failed to save the email account");
  }
}

/** DELETE — disconnect (removes the account + its messages via cascade). */
export async function DELETE() {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const rl = applyRateLimit(user.id, "authenticated");
  if (rl) return rl;

  try {
    await db.delete(emailAccounts).where(eq(emailAccounts.userId, user.id));
    return apiSuccess({ connected: false });
  } catch (err) {
    console.error("[api/inbox/account] delete failed:", err instanceof Error ? err.message : err);
    return apiError("Failed to disconnect");
  }
}
