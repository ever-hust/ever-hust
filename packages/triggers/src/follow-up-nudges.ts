import { task, schedules } from "@trigger.dev/sdk";
import { callAppEndpoint } from "./app-endpoint";
import { APP_ENDPOINT_TASK_MAX_DURATION_S, CRON_ENDPOINTS, CRON_TIMEOUTS_MS } from "./cron-endpoints";
import { runsOnTrigger, SKIPPED } from "./scheduler";

/**
 * Follow-up nudge digest (spec #9). The work (DB + Resend) runs in the app via
 * `POST /api/cron/follow-up-nudges` (see `work/follow-up-nudges.ts`). The app sends nothing unless
 * its FOLLOW_UP_NUDGES_ENABLED is on (default off: the run completes with `skipped: "disabled"`).
 * Retries are safe: each user is claimed atomically for the 3-day cooldown before the email goes
 * out, and the send carries a Resend idempotency key.
 */
async function runNudges() {
  return callAppEndpoint(CRON_ENDPOINTS.followUpNudges, {}, { timeoutMs: CRON_TIMEOUTS_MS.followUpNudges });
}

export const followUpNudgesTask = task({
  id: "follow-up-nudges",
  maxDuration: APP_ENDPOINT_TASK_MAX_DURATION_S,
  run: async () => runNudges(),
});

// Daily at 9 AM UTC.
export const followUpNudgesSchedule = schedules.task({
  id: "daily-follow-up-nudges",
  maxDuration: APP_ENDPOINT_TASK_MAX_DURATION_S,
  cron: "0 9 * * *",
  run: async () => {
    if (!runsOnTrigger()) return SKIPPED;
    return runNudges();
  },
});
