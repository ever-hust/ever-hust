import { NextResponse } from "next/server";
import { getEnabledSocialProviders } from "@ever-hust/auth/providers";

/**
 * GET /api/auth-providers — public. The social sign-in providers this
 * deployment has credentials for, so the login page only shows buttons that
 * work. Read per request: credentials come from the runtime env, not the build.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { providers: getEnabledSocialProviders() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
