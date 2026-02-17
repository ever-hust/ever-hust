import { auth } from "@repo/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function getSessionUser() {
  let session;
  try {
    session = await auth.api.getSession({
      headers: await headers(),
    });
  } catch (error) {
    // Auth infrastructure failure (DB down, corrupt cookie, etc.) — treat as
    // unauthenticated rather than letting the error propagate to callers that
    // assume the thrown value is always a NextResponse.
    console.error(
      "[get-session-user] Auth session check failed:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }

  if (!session?.user?.id) {
    return null;
  }

  return session.user;
}

/**
 * Helper that returns the user or throws a 401 response.
 * Use in API routes that require authentication.
 */
export async function requireSessionUser() {
  const user = await getSessionUser();
  if (!user) {
    throw NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return user;
}
