import { task, schedules } from "@trigger.dev/sdk";
import { callAppEndpoint } from "./app-endpoint";
import { CRON_ENDPOINTS, CRON_TIMEOUTS_MS } from "./cron-endpoints";
import { runsOnTrigger, SKIPPED } from "./scheduler";

/**
 * Persisted funnel snapshots (spec #8). The work runs in the app via
 * `POST /api/cron/funnel-snapshots` (see `work/funnel-snapshots.ts`); at most one scheduled
 * snapshot per user per UTC day, so retries do not duplicate points.
 */
async function runSnapshots() {
  return callAppEndpoint(CRON_ENDPOINTS.funnelSnapshots, {}, { timeoutMs: CRON_TIMEOUTS_MS.funnelSnapshots });
}

export const funnelSnapshotsTask = task({
  id: "funnel-snapshots",
  run: async () => runSnapshots(),
});

// Daily at 2 AM UTC (quiet hour).
export const funnelSnapshotsSchedule = schedules.task({
  id: "daily-funnel-snapshots",
  cron: "0 2 * * *",
  run: async () => {
    if (!runsOnTrigger()) return SKIPPED;
    return runSnapshots();
  },
});
