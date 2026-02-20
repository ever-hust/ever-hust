import { db } from "@repo/db";
import { userJobs } from "@repo/db";
import { eq, and } from "drizzle-orm";
import type { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { favoriteToggleSchema, parseBody } from "../../../../lib/api-schemas";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { apiSuccess, apiBadRequest, apiError, safeJsonParse } from "../../../../lib/api-response";

// GET /api/user/favorites - Get user's favorited job IDs
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(req: Request) {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const userId = user.id;

  // Rate limit: 100 req/min per authenticated user
  const rateLimited = applyRateLimit(userId, "authenticated");
  if (rateLimited) return rateLimited;

  try {
    const favorites = await db
      .select({ jobId: userJobs.jobId })
      .from(userJobs)
      .where(and(eq(userJobs.userId, userId), eq(userJobs.status, "favorited")))
      .limit(500);

    return apiSuccess({
      favoriteJobIds: favorites.map((f) => f.jobId),
    });
  } catch (err) {
    console.error("[api/user/favorites] GET failed:", err instanceof Error ? err.message : err);
    return apiError("Failed to load favorites");
  }
}

// POST /api/user/favorites - Toggle favorite for a job
export async function POST(req: Request) {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const userId = user.id;

  // Rate limit: 100 req/min per authenticated user
  const rateLimited = applyRateLimit(userId, "authenticated");
  if (rateLimited) return rateLimited;

  const jsonResult = await safeJsonParse(req);
  if (!jsonResult.ok) return jsonResult.response;
  const validation = parseBody(favoriteToggleSchema, jsonResult.data);
  if (!validation.success) {
    return apiBadRequest(validation.error);
  }
  const { jobId } = validation.data;

  try {
    // Wrap in transaction to prevent TOCTOU race on concurrent toggle requests
    const favorited = await db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: userJobs.id, status: userJobs.status })
        .from(userJobs)
        .where(and(eq(userJobs.userId, userId), eq(userJobs.jobId, jobId)))
        .limit(1);

      if (existing.length > 0 && existing[0]!.status === "favorited") {
        await tx
          .delete(userJobs)
          .where(and(eq(userJobs.userId, userId), eq(userJobs.jobId, jobId)));
        return false;
      }

      if (existing.length > 0) {
        await tx
          .update(userJobs)
          .set({ status: "favorited" as const, updatedAt: new Date() })
          .where(and(eq(userJobs.userId, userId), eq(userJobs.jobId, jobId)));
      } else {
        await tx.insert(userJobs).values({
          userId,
          jobId,
          status: "favorited",
        });
      }
      return true;
    });

    return apiSuccess({ jobId, favorited });
  } catch (err) {
    console.error("[api/user/favorites] POST failed:", err instanceof Error ? err.message : err);
    return apiError("Failed to toggle favorite");
  }
}
