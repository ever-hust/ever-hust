import { task, schedules } from "@trigger.dev/sdk";
import { callAppEndpoint } from "./app-endpoint";
import { APP_ENDPOINT_TASK_MAX_DURATION_S, CRON_ENDPOINTS, CRON_TIMEOUTS_MS } from "./cron-endpoints";
import { runsOnTrigger, SKIPPED } from "./scheduler";

type AlertFrequency = "daily" | "twice_daily" | "weekly";

/**
 * Job-alert emails. The work (DB queries + Resend) runs in the app via `POST /api/cron/job-alerts`
 * (see `work/job-alerts.ts`). Retries are safe: each alert is claimed atomically per period before
 * it is sent, so a retry or manual re-run only sends what is still due. The app answers non-2xx
 * when any alert failed or was deferred, which marks the run FAILED and retries the remainder.
 */
async function sendAlerts(frequencies: AlertFrequency[]) {
  return callAppEndpoint(CRON_ENDPOINTS.jobAlerts, { frequencies }, { timeoutMs: CRON_TIMEOUTS_MS.jobAlerts });
}

// Task definition
export const sendJobAlertsTask = task({
  id: "send-job-alerts",
  maxDuration: APP_ENDPOINT_TASK_MAX_DURATION_S,
  run: async (payload: { frequency: AlertFrequency }) => sendAlerts([payload.frequency]),
});

// Scheduled triggers
// Daily alerts at 8 AM UTC
export const dailyAlertSchedule = schedules.task({
  id: "daily-job-alerts",
  maxDuration: APP_ENDPOINT_TASK_MAX_DURATION_S,
  cron: "0 8 * * *",
  run: async () => {
    if (!runsOnTrigger()) return SKIPPED;
    return sendAlerts(["daily", "twice_daily"]);
  },
});

// Twice daily alerts at 6 PM UTC (second run)
export const eveningAlertSchedule = schedules.task({
  id: "evening-job-alerts",
  maxDuration: APP_ENDPOINT_TASK_MAX_DURATION_S,
  cron: "0 18 * * *",
  run: async () => {
    if (!runsOnTrigger()) return SKIPPED;
    return sendAlerts(["twice_daily"]);
  },
});

// Weekly alerts on Monday at 8 AM UTC
export const weeklyAlertSchedule = schedules.task({
  id: "weekly-job-alerts",
  maxDuration: APP_ENDPOINT_TASK_MAX_DURATION_S,
  cron: "0 8 * * 1",
  run: async () => {
    if (!runsOnTrigger()) return SKIPPED;
    return sendAlerts(["weekly"]);
  },
});
