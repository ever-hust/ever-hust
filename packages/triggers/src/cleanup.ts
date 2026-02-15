import { task, schedules } from "@trigger.dev/sdk/v3";
import { db, jobs } from "@repo/db";
import { lt, sql } from "drizzle-orm";

/**
 * Cleanup task: removes stale jobs and expired data.
 * Runs daily at 3 AM UTC.
 */
async function runCleanup() {
  const now = new Date();
  let deletedJobs = 0;

  // Delete jobs older than 90 days that haven't been updated
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const result = await db
    .delete(jobs)
    .where(lt(jobs.updatedAt, ninetyDaysAgo))
    .returning({ id: jobs.id });

  deletedJobs = result.length;

  // Clean up orphaned chat messages older than 30 days
  // (chat_messages that reference deleted conversations)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

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
    deletedJobs,
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
