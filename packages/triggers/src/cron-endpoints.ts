/**
 * App endpoints the Trigger.dev tasks call (see `app-endpoint.ts`). Each path is served by
 * `apps/web/app/api<path>/route.ts`, guarded by `apps/web/lib/cron-auth.ts` (CRON_SECRET).
 * A web-lib test asserts every path here has a route file.
 */
export const CRON_ENDPOINTS = {
  cleanup: "/api/cron/cleanup",
  cleanupExpiredJobs: "/api/cron/cleanup-expired-jobs",
  jobAlerts: "/api/cron/job-alerts",
  followUpNudges: "/api/cron/follow-up-nudges",
  funnelSnapshots: "/api/cron/funnel-snapshots",
  batchEvaluate: "/api/cron/batch-evaluate",
  inboxSync: "/api/inbox/cron-sync",
} as const;

export type CronEndpoint = (typeof CRON_ENDPOINTS)[keyof typeof CRON_ENDPOINTS];

/**
 * `maxDuration` (seconds) of every task that delegates to an app endpoint. Trigger.dev defines
 * maxDuration as the compute time a RUN may use, and waiting on `fetch` counts. If that is summed
 * over attempts, the project default (600 s, trigger.config.ts) would kill the 3rd attempt of a
 * run whose attempts each wait the full 290 s — the attempt that finishes deferred alerts/nudges.
 * 3 attempts x 290 s + retry backoff (at most 2 x 30 s) = 930 s, so 1000 s covers every attempt
 * whichever way Trigger counts. Per-attempt, each request is still capped at 290 s.
 */
export const APP_ENDPOINT_TASK_MAX_DURATION_S = 1_000;

/** Trigger-side timeouts (ms). All stay under MAX_APP_ENDPOINT_TIMEOUT_MS (290 s). */
export const CRON_TIMEOUTS_MS = {
  cleanup: 290_000,
  jobAlerts: 290_000,
  followUpNudges: 290_000,
  funnelSnapshots: 290_000,
  batchEvaluate: 290_000,
  inboxSync: 290_000,
} as const;
