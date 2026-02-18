import { task, schedules } from "@trigger.dev/sdk/v3";
import { cleanupExpiredJobs } from "./cleanup";

/**
 * Standalone task for cleaning up expired job listings.
 *
 * Delegates to the shared `cleanupExpiredJobs()` in cleanup.ts to avoid
 * duplicating deletion logic. The full `cleanup` task also handles agent
 * instance cleanup in addition to jobs.
 */

// Manual task trigger
export const cleanupExpiredJobsTask = task({
  id: "cleanup-expired-jobs",
  run: async () => {
    const { totalDeletedJobs } = await cleanupExpiredJobs();
    return { totalDeleted: totalDeletedJobs, timestamp: new Date().toISOString() };
  },
});

// Scheduled: Run daily at 3 AM UTC (off-peak)
export const cleanupExpiredJobsSchedule = schedules.task({
  id: "cleanup-expired-jobs-schedule",
  cron: "0 3 * * *",
  run: async () => {
    const { totalDeletedJobs } = await cleanupExpiredJobs();
    return { totalDeleted: totalDeletedJobs, timestamp: new Date().toISOString() };
  },
});
