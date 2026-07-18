import { NextResponse } from "next/server";
import { db, emailAccounts } from "@ever-hust/db";
import { encryptApiKey } from "@ever-hust/ai/crypto";
import { gmailOauthConfigured, verifyState, exchangeCode } from "../../../../../../lib/gmail-oauth";

export const maxDuration = 30;

/** GET — Google OAuth redirect target: store the connected Gmail account. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? url.origin).replace(/\/$/, "");
  const back = (status: string) => NextResponse.redirect(`${appUrl}/inbox?google=${status}`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error") || !code || !state) return back("error");
  if (!gmailOauthConfigured()) return back("disabled");

  const userId = verifyState(state);
  if (!userId) return back("error");

  const tokens = await exchangeCode(code);
  if (!tokens) return back("error");

  let refreshEnc: string;
  try {
    refreshEnc = encryptApiKey(tokens.refreshToken);
  } catch {
    return back("noenc");
  }

  try {
    const values = {
      userId,
      email: tokens.email,
      username: tokens.email,
      authType: "oauth" as const,
      passwordEnc: null,
      oauthRefreshTokenEnc: refreshEnc,
      imapHost: "imap.gmail.com",
      imapPort: 993,
      imapSecure: true,
      smtpHost: "smtp.gmail.com",
      smtpPort: 465,
      smtpSecure: true,
      status: "connected" as const,
      lastError: null,
      updatedAt: new Date(),
    };
    await db
      .insert(emailAccounts)
      .values(values)
      .onConflictDoUpdate({ target: emailAccounts.userId, set: values });
    return back("connected");
  } catch (err) {
    console.error("[inbox/oauth/google/callback] save failed:", err instanceof Error ? err.message : err);
    return back("error");
  }
}
