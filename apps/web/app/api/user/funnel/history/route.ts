import { db, funnelSnapshots } from "@ever-hust/db";
import { eq, desc } from "drizzle-orm";
import type { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../../lib/rate-limit";
import { apiSuccess, apiError } from "../../../../../lib/api-response";

/**
 * Funnel snapshot history (spec #8) — the signed-in user's persisted funnel time series, newest
 * first, for trend charts. Snapshots are written by the `funnel-snapshots` scheduled task.
 */
export async function GET(req: Request) {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }

  const rateLimited = applyRateLimit(user.id, "authenticated");
  if (rateLimited) return rateLimited;

  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 90, 1), 365);

  try {
    const snapshots = await db
      .select({
        capturedAt: funnelSnapshots.capturedAt,
        total: funnelSnapshots.total,
        byStage: funnelSnapshots.byStage,
        conversions: funnelSnapshots.conversions,
        avgScore: funnelSnapshots.avgScore,
      })
      .from(funnelSnapshots)
      .where(eq(funnelSnapshots.userId, user.id))
      .orderBy(desc(funnelSnapshots.capturedAt))
      .limit(limit);

    return apiSuccess({ snapshots }, { cacheSeconds: 0, isPrivate: true });
  } catch (err) {
    console.error(
      "[api/user/funnel/history] GET failed:",
      err instanceof Error ? err.message : err,
    );
    return apiError("Failed to load funnel history");
  }
}
