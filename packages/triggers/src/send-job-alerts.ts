import { task, schedules } from "@trigger.dev/sdk";
import { callAppEndpoint, stableRunTimestamp } from "./app-endpoint";
import { APP_ENDPOINT_TASK_MAX_DURATION_S, CRON_ENDPOINTS, CRON_TIMEOUTS_MS } from "./cron-endpoints";
import { runsOnTrigger, SKIPPED } from "./scheduler";

type AlertFrequency = "daily" | "twice_daily" | "weekly";

/**
 * Job-alert emails. The work (DB queries + Resend) runs in the app via `POST /api/cron/job-alerts`
 * (see `work/job-alerts.ts`).
 *
 * Each run passes a `windowEnd` that is the SAME on every attempt of the run: the schedule's fire
 * time (`payload.timestamp`) for a scheduled run, the run's creation time (`ctx.run.createdAt`)
 * for an on-demand one. The app sends each alert the jobs of a fixed period ending there, under an
 * idempotency key that includes it, and only then moves the alert's marker to it. So a retry
 * repeats the first attempt's email exactly (Resend delivers one), and a job created between two
 * attempts goes in the next period instead of being lost. The app answers non-2xx when any alert
 * failed or was deferred, which marks the run FAILED and retries the remainder.
 */
async function sendAlerts(frequencies: AlertFrequency[], windowEnd: string | undefined) {
  return callAppEndpoint(
    CRON_ENDPOINTS.jobAlerts,
    windowEnd ? { frequencies, windowEnd } : { frequencies },
    { timeoutMs: CRON_TIMEOUTS_MS.jobAlerts },
  );
}

// Task definition (on demand): the run's creation time is its window end.
export const sendJobAlertsTask = task({
  id: "send-job-alerts",
  maxDuration: APP_ENDPOINT_TASK_MAX_DURATION_S,
  run: async (payload: { frequency: AlertFrequency }, { ctx }) =>
    sendAlerts([payload.frequency], stableRunTimestamp(ctx.run.createdAt)),
});

// Scheduled triggers: the schedule's fire time is the window end (the run's creation time if a
// payload somehow lacks it).
// Daily alerts at 8 AM UTC
export const dailyAlertSchedule = schedules.task({
  id: "daily-job-alerts",
  maxDuration: APP_ENDPOINT_TASK_MAX_DURATION_S,
  cron: "0 8 * * *",
  run: async (payload, { ctx }) => {
    if (!runsOnTrigger()) return SKIPPED;
    return sendAlerts(["daily", "twice_daily"], stableRunTimestamp(payload.timestamp, ctx.run.createdAt));
  },
});

// Twice daily alerts at 6 PM UTC (second run)
export const eveningAlertSchedule = schedules.task({
  id: "evening-job-alerts",
  maxDuration: APP_ENDPOINT_TASK_MAX_DURATION_S,
  cron: "0 18 * * *",
  run: async (payload, { ctx }) => {
    if (!runsOnTrigger()) return SKIPPED;
    return sendAlerts(["twice_daily"], stableRunTimestamp(payload.timestamp, ctx.run.createdAt));
  },
});

// Weekly alerts on Monday at 8 AM UTC
export const weeklyAlertSchedule = schedules.task({
  id: "weekly-job-alerts",
  maxDuration: APP_ENDPOINT_TASK_MAX_DURATION_S,
  cron: "0 8 * * 1",
  run: async (payload, { ctx }) => {
    if (!runsOnTrigger()) return SKIPPED;
    return sendAlerts(["weekly"], stableRunTimestamp(payload.timestamp, ctx.run.createdAt));
  },
});
