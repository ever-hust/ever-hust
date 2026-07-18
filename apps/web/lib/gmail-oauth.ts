import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Gmail one-click connect via OAuth2 (XOAUTH2 for IMAP/SMTP). Server-only.
 * Dormant unless GMAIL_INBOX_CLIENT_ID/SECRET are set. The `mail.google.com`
 * scope is a Google "restricted" scope: works in the OAuth app's testing mode
 * (≤100 testers) without verification; CASA verification is only needed to scale.
 */
const SCOPES = ["https://mail.google.com/", "openid", "email"];

export function gmailOauthConfigured(): boolean {
  return Boolean(process.env.GMAIL_INBOX_CLIENT_ID && process.env.GMAIL_INBOX_CLIENT_SECRET);
}

function redirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:8443";
  return `${base.replace(/\/$/, "")}/api/inbox/oauth/google/callback`;
}

function stateSecret(): string {
  return process.env.BETTER_AUTH_SECRET ?? "hust-dev-secret";
}

/** Sign `userId` into a CSRF-safe state token. */
export function signState(userId: string): string {
  const mac = createHmac("sha256", stateSecret()).update(userId).digest("hex");
  return `${userId}.${mac}`;
}

/** Verify a state token and return the userId, or null. */
export function verifyState(state: string): string | null {
  const i = state.lastIndexOf(".");
  if (i <= 0) return null;
  const userId = state.slice(0, i);
  const mac = state.slice(i + 1);
  const expected = createHmac("sha256", stateSecret()).update(userId).digest("hex");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return userId;
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GMAIL_INBOX_CLIENT_ID ?? "",
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = idToken.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof json.email === "string" ? json.email : null;
  } catch {
    return null;
  }
}

/** Exchange an authorization code for tokens + the connected Gmail address. */
export async function exchangeCode(
  code: string,
): Promise<{ refreshToken: string; accessToken: string; email: string } | null> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GMAIL_INBOX_CLIENT_ID ?? "",
        client_secret: process.env.GMAIL_INBOX_CLIENT_SECRET ?? "",
        code,
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      id_token?: string;
    };
    // refresh_token is only returned on first consent — prompt=consent forces it.
    if (!json.access_token || !json.refresh_token) return null;
    const email = emailFromIdToken(json.id_token);
    if (!email) return null;
    return { refreshToken: json.refresh_token, accessToken: json.access_token, email };
  } catch {
    return null;
  }
}
