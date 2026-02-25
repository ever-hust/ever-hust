import { db, accounts } from "@ever-hust/db";
import { eq } from "drizzle-orm";
import type { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { apiSuccess, apiError } from "../../../../lib/api-response";

/**
 * GET /api/user/accounts — List all social accounts linked to the current user.
 * Returns the providerId and createdAt for each linked account.
 */
export async function GET() {
  let sessionUser;
  try {
    sessionUser = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const userId = sessionUser.id;

  const rateLimited = applyRateLimit(userId, "authenticated");
  if (rateLimited) return rateLimited;

  try {
    const linked = await db
      .select({
        providerId: accounts.providerId,
        createdAt: accounts.createdAt,
      })
      .from(accounts)
      .where(eq(accounts.userId, userId));

    return apiSuccess({ accounts: linked });
  } catch (err) {
    console.error(
      "[api/user/accounts] GET failed:",
      err instanceof Error ? err.message : err,
    );
    return apiError("Failed to load connected accounts");
  }
}
