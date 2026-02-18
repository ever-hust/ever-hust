import { task, schedules } from "@trigger.dev/sdk/v3";
import { db, jobs } from "@repo/db";
import { lt, and, isNotNull, sql } from "drizzle-orm";

/**
 * Remove expired and stale job listings from the database.
 *
 * Jobs are considered removable when:
 * 1. Their `expires_at` timestamp has passed, OR
 * 2. They were posted more than 90 days ago and haven't been updated
 *
 * Exported so other tasks can reuse this without duplicating logic.
 */
export async function cleanupExpiredJobs(): Promise<{
  totalDeletedJobs: number;
}> {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  let totalDeletedJobs = 0;

  // 1. Delete jobs with a past expiration date
  const expiredResult = await db
    .delete(jobs)
    .where(and(isNotNull(jobs.expiresAt), lt(jobs.expiresAt, now)))
    .returning({ id: jobs.id });

  totalDeletedJobs += expiredResult.length;

  // 2. Delete stale jobs posted > 90 days ago that haven't been updated recently
  const staleResult = await db
    .delete(jobs)
    .where(and(lt(jobs.datePosted, ninetyDaysAgo), lt(jobs.updatedAt, ninetyDaysAgo)))
    .returning({ id: jobs.id });

  totalDeletedJobs += staleResult.length;

  return { totalDeletedJobs };
}

/**
 * Full cleanup task: removes stale jobs and expired agent instances.
 * Runs daily at 3 AM UTC.
 */
async function runCleanup() {
  const now = new Date();

  // Clean up expired jobs
  const { totalDeletedJobs } = await cleanupExpiredJobs();

  // Delete expired agent instances (completed/failed older than 7 days)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  let deletedAgents = 0;
  try {
    const agentResult = await db.execute(
      sql`DELETE FROM agent_instances WHERE status IN ('completed', 'failed') AND updated_at < ${sevenDaysAgo}`
    );
    deletedAgents = Number((agentResult as unknown as { rowCount?: number }).rowCount ?? 0);
  } catch {
    // Table may not exist yet
  }

  return {
    deletedJobs: totalDeletedJobs,
    deletedAgents,
    cleanupDate: now.toISOString(),
  };
}

export const cleanupTask = task({
  id: "cleanup",
  run: async () => {
    return runCleanup();
  },
});

// Run daily at 3 AM UTC
export const cleanupSchedule = schedules.task({
  id: "daily-cleanup",
  cron: "0 3 * * *",
  run: async () => {
    return runCleanup();
  },
});
