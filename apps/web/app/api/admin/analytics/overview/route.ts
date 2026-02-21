import { db } from "@ever-hust/db";
import {
  users,
  jobs,
  subscriptions,
  applications,
  chatSessions,
  referrals,
} from "@ever-hust/db/schema";
import { count, gte } from "drizzle-orm";
import type { NextResponse } from "next/server";
import { requireRole } from "../../../../../lib/auth-roles";
import { applyRateLimit } from "../../../../../lib/rate-limit";
import { apiSuccess, apiError } from "../../../../../lib/api-response";

export const maxDuration = 30;

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
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      totalUsersResult,
      newUsers7dResult,
      newUsers30dResult,
      totalJobsResult,
      activeSubsResult,
      totalApplicationsResult,
      totalChatSessionsResult,
      totalReferralsResult,
    ] = await Promise.all([
      db.select({ value: count() }).from(users),
      db
        .select({ value: count() })
        .from(users)
        .where(gte(users.createdAt, sevenDaysAgo)),
      db
        .select({ value: count() })
        .from(users)
        .where(gte(users.createdAt, thirtyDaysAgo)),
      db.select({ value: count() }).from(jobs),
      db
        .select({ value: count() })
        .from(subscriptions)
        .where(gte(subscriptions.currentPeriodEnd, now)),
      db.select({ value: count() }).from(applications),
      db.select({ value: count() }).from(chatSessions),
      db.select({ value: count() }).from(referrals),
    ]);

    return apiSuccess({
      totalUsers: totalUsersResult[0]?.value ?? 0,
      newUsersLast7d: newUsers7dResult[0]?.value ?? 0,
      newUsersLast30d: newUsers30dResult[0]?.value ?? 0,
      totalJobs: totalJobsResult[0]?.value ?? 0,
      activeSubscriptions: activeSubsResult[0]?.value ?? 0,
      totalApplications: totalApplicationsResult[0]?.value ?? 0,
      totalChatSessions: totalChatSessionsResult[0]?.value ?? 0,
      totalReferrals: totalReferralsResult[0]?.value ?? 0,
    });
  } catch (err) {
    console.error(
      "[api/admin/analytics/overview] GET failed:",
      err instanceof Error ? err.message : err
    );
    return apiError("Failed to fetch analytics overview");
  }
}
