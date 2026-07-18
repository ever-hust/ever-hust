import type { NextResponse } from "next/server";
import { NextResponse as Res } from "next/server";
import { requireSessionUser } from "../../../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../../../lib/rate-limit";
import { apiBadRequest } from "../../../../../../lib/api-response";
import { gmailOauthConfigured, buildAuthUrl, signState } from "../../../../../../lib/gmail-oauth";

/** GET — begin Gmail OAuth: redirect the signed-in user to Google consent. */
export async function GET() {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const rl = applyRateLimit(user.id, "authenticated");
  if (rl) return rl;

  if (!gmailOauthConfigured()) {
    return apiBadRequest(
      "Gmail one-click connect isn't enabled on this server yet. You can connect Gmail now with an app password instead.",
    );
  }
  return Res.redirect(buildAuthUrl(signState(user.id)));
}
