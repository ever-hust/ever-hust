import { db } from "@repo/db";
import { users, jobs, subscriptions } from "@repo/db/schema";
import { count, desc, gte } from "drizzle-orm";
import type { NextResponse } from "next/server";
import { requireRole } from "../../../../lib/auth-roles";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { apiSuccess, apiError } from "../../../../lib/api-response";

export async function GET() {
  let admin;
  try {
    admin = await requireRole("admin");
  } catch (response) {
    return response as NextResponse;
  }

  const rateLimited = applyRateLimit(admin.id, "admin");
  if (rateLimited) return rateLimited;

  try {
    // Run all stat queries in parallel
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [totalUsersResult, totalJobsResult, activeSubsResult, recentUsers] =
      await Promise.all([
        db.select({ value: count() }).from(users),
        db.select({ value: count() }).from(jobs),
        db
          .select({ value: count() })
          .from(subscriptions)
          .where(gte(subscriptions.currentPeriodEnd, new Date())),
        db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            image: users.image,
            role: users.role,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(gte(users.createdAt, sevenDaysAgo))
          .orderBy(desc(users.createdAt))
          .limit(10),
      ]);

    const totalUsers = totalUsersResult[0]?.value ?? 0;
    const totalJobs = totalJobsResult[0]?.value ?? 0;
    const activeSubscriptions = activeSubsResult[0]?.value ?? 0;

    return apiSuccess({
      totalUsers,
      totalJobs,
      activeSubscriptions,
      recentUsers,
    });
  } catch (err) {
    console.error(
      "[api/admin/stats] GET failed:",
      err instanceof Error ? err.message : err,
    );
    return apiError("Failed to fetch admin stats");
  }
}
