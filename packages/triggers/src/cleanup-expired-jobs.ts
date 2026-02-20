import { task } from "@trigger.dev/sdk/v3";
import { cleanupExpiredJobs } from "./cleanup";

/**
 * Standalone task for cleaning up expired job listings.
 *
 * Delegates to the shared `cleanupExpiredJobs()` in cleanup.ts to avoid
 * duplicating deletion logic. The full `cleanup` task (which runs on its own
 * daily schedule at 3 AM UTC) also calls `cleanupExpiredJobs()` in addition
 * to agent instance and webhook event cleanup. This task exists only for
 * manual/on-demand triggers — no schedule here to avoid double execution.
 */
export const cleanupExpiredJobsTask = task({
  id: "cleanup-expired-jobs",
  run: async () => {
    const { totalDeletedJobs } = await cleanupExpiredJobs();
    return { totalDeleted: totalDeletedJobs, timestamp: new Date().toISOString() };
  },
});
