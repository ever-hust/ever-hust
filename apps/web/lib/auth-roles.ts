import { requireSessionUser } from "./get-session-user";
import { db } from "@ever-hust/db";
import { users } from "@ever-hust/db/schema";
import type { UserRole } from "@ever-hust/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * Get the role for an authenticated user.
 * Returns the user's role from the database.
 */
export async function getUserRole(userId: string): Promise<UserRole> {
  const [user] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return (user?.role as UserRole) ?? "user";
}

/**
 * Require that the authenticated user has one of the specified roles.
 * Returns the session user if authorized, or throws a 403 response.
 */
export async function requireRole(...allowedRoles: UserRole[]) {
  const sessionUser = await requireSessionUser();
  // requireSessionUser throws NextResponse on failure, so if we reach here
  // we have a valid user.

  const role = await getUserRole(sessionUser.id);
  if (!allowedRoles.includes(role)) {
    throw NextResponse.json(
      { error: "Forbidden: insufficient permissions" },
      { status: 403 },
    );
  }

  return { ...sessionUser, role };
}
