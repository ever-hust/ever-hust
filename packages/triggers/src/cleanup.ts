import { task, schedules } from "@trigger.dev/sdk";
import { callAppEndpoint } from "./app-endpoint";
import { CRON_ENDPOINTS, CRON_TIMEOUTS_MS } from "./cron-endpoints";
import { runsOnTrigger, SKIPPED } from "./scheduler";

/**
 * Daily cleanup — expired/stale jobs (never one that anything references), old agent instances and
 * old Stripe webhook events. The work runs in the app (`POST /api/cron/cleanup`, see
 * `work/cleanup.ts`), because the Trigger env has no DATABASE_URL. What it actually does is set by
 * `JOBS_CLEANUP_MODE` on the APP: `dry-run` (default, counts only) | `delete` | `off`.
 */
export interface CleanupPayload {
  /** Optional: make this run safer than the app's configured mode (never escalates to delete). */
  mode?: "dry-run" | "off";
}

async function runCleanupRemote(payload?: CleanupPayload) {
  return callAppEndpoint(CRON_ENDPOINTS.cleanup, payload?.mode ? { mode: payload.mode } : {}, {
    timeoutMs: CRON_TIMEOUTS_MS.cleanup,
  });
}

export const cleanupTask = task({
  id: "cleanup",
  run: async (payload?: CleanupPayload) => runCleanupRemote(payload),
});

// Run daily at 3 AM UTC
export const cleanupSchedule = schedules.task({
  id: "daily-cleanup",
  cron: "0 3 * * *",
  run: async () => {
    if (!runsOnTrigger()) return SKIPPED;
    return runCleanupRemote();
  },
});
