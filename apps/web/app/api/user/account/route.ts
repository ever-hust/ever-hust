import { db, users } from "@repo/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../lib/rate-limit";

/**
 * DELETE /api/user/account — Permanently delete the user account.
 * Cascading deletes handle related data (applications, chat sessions,
 * favorites, alerts) via foreign key constraints.
 */
export async function DELETE() {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const userId = user.id;

  // Rate limit to prevent abuse
  const rateLimited = applyRateLimit(userId, "authenticated");
  if (rateLimited) return rateLimited;

  try {
    // Delete the user — cascading FK constraints handle related records
    await db.delete(users).where(eq(users.id, userId));

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Account deletion failed:", error);
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 }
    );
  }
}
