import { auth } from "@repo/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function getSessionUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

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
