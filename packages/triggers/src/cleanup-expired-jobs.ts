import { task } from "@trigger.dev/sdk";
import { callAppEndpoint } from "./app-endpoint";
import { APP_ENDPOINT_TASK_MAX_DURATION_S, CRON_ENDPOINTS, CRON_TIMEOUTS_MS } from "./cron-endpoints";
import type { CleanupPayload } from "./cleanup";

/**
 * On-demand jobs-only cleanup (no schedule — the daily `cleanup` covers it). Runs in the app via
 * `POST /api/cron/cleanup-expired-jobs` with the same reference guard and `JOBS_CLEANUP_MODE` as
 * the full cleanup.
 */
export const cleanupExpiredJobsTask = task({
  id: "cleanup-expired-jobs",
  maxDuration: APP_ENDPOINT_TASK_MAX_DURATION_S,
  run: async (payload?: CleanupPayload) =>
    callAppEndpoint(CRON_ENDPOINTS.cleanupExpiredJobs, payload?.mode ? { mode: payload.mode } : {}, {
      timeoutMs: CRON_TIMEOUTS_MS.cleanup,
    }),
});
