import { db } from "@repo/db";
import { subscriptions } from "@repo/db/schema";
import { count, desc } from "drizzle-orm";
import type { NextResponse } from "next/server";
import { requireRole } from "../../../../../lib/auth-roles";
import { applyRateLimit } from "../../../../../lib/rate-limit";
import { apiSuccess, apiError } from "../../../../../lib/api-response";

export async function GET() {
  let admin;
  try {
    admin = await requireRole("admin");
  } catch (response) {
    return response as NextResponse;
  }

  const rateLimited = applyRateLimit(admin.id, "adminWrite");
  if (rateLimited) return rateLimited;

  try {
    const [byPlanTypeResult, byStatusResult, recentChangesResult] =
      await Promise.all([
        // Count by plan type
        db
          .select({
            planType: subscriptions.planType,
            value: count(),
          })
          .from(subscriptions)
          .groupBy(subscriptions.planType),

        // Count by status
        db
          .select({
            status: subscriptions.status,
            value: count(),
          })
          .from(subscriptions)
          .groupBy(subscriptions.status),

        // Last 20 subscription events
        db
          .select({
            id: subscriptions.id,
            userId: subscriptions.userId,
            planType: subscriptions.planType,
            status: subscriptions.status,
            createdAt: subscriptions.createdAt,
            updatedAt: subscriptions.updatedAt,
          })
          .from(subscriptions)
          .orderBy(desc(subscriptions.updatedAt))
          .limit(20),
      ]);

    const byPlanType = byPlanTypeResult.map((r) => ({
      planType: r.planType,
      count: r.value,
    }));

    const byStatus = byStatusResult.map((r) => ({
      status: r.status,
      count: r.value,
    }));

    return apiSuccess({
      byPlanType,
      byStatus,
      recentChanges: recentChangesResult,
    });
  } catch (err) {
    console.error(
      "[api/admin/analytics/subscriptions] GET failed:",
      err instanceof Error ? err.message : err
    );
    return apiError("Failed to fetch subscription analytics");
  }
}
