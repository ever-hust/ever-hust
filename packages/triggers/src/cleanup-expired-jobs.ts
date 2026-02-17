import { task, schedules } from "@trigger.dev/sdk/v3";
import { db, jobs } from "@repo/db";
import { lt, and, isNotNull, sql } from "drizzle-orm";

/**
 * Cleanup task that removes expired job listings from the database.
 *
 * Jobs are considered expired when:
 * 1. Their `expires_at` timestamp has passed, OR
 * 2. They were posted more than 90 days ago and haven't been updated
 *
 * This keeps the database lean and search results relevant.
 */
async function cleanupExpiredJobs() {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  let totalDeleted = 0;

  try {
    // 1. Delete jobs with a past expiration date
    const expiredResult = await db
      .delete(jobs)
      .where(
        and(
          isNotNull(jobs.expiresAt),
          lt(jobs.expiresAt, now)
        )
      )
      .returning({ id: jobs.id });

    totalDeleted += expiredResult.length;
    console.log(`Deleted ${expiredResult.length} jobs with past expiration dates.`);

    // 2. Delete stale jobs posted > 90 days ago that haven't been updated recently
    const staleResult = await db
      .delete(jobs)
      .where(
        and(
          lt(jobs.datePosted, ninetyDaysAgo),
          lt(jobs.updatedAt, ninetyDaysAgo)
        )
      )
      .returning({ id: jobs.id });

    totalDeleted += staleResult.length;
    console.log(`Deleted ${staleResult.length} stale jobs (>90 days old, not updated).`);

    // 3. Log summary stats
    const totalJobs = await db
      .select({ count: sql<number>`count(*)` })
      .from(jobs);

    console.log(
      `Cleanup complete. Removed ${totalDeleted} jobs. ${totalJobs[0]?.count ?? 0} remaining.`
    );
  } catch (error) {
    console.error(
      "Job cleanup failed:",
      error instanceof Error ? error.message : error
    );
    throw error;
  }

  return { totalDeleted, timestamp: now.toISOString() };
}

// Manual task trigger
export const cleanupExpiredJobsTask = task({
  id: "cleanup-expired-jobs",
  run: async () => {
    return cleanupExpiredJobs();
  },
});

// Scheduled: Run daily at 3 AM UTC (off-peak)
export const cleanupExpiredJobsSchedule = schedules.task({
  id: "cleanup-expired-jobs-schedule",
  cron: "0 3 * * *",
  run: async () => {
    return cleanupExpiredJobs();
  },
});
