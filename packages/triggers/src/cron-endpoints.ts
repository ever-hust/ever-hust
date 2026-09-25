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

/** Trigger-side timeouts (ms). All stay under MAX_APP_ENDPOINT_TIMEOUT_MS (290 s). */
export const CRON_TIMEOUTS_MS = {
  cleanup: 290_000,
  jobAlerts: 290_000,
  followUpNudges: 290_000,
  funnelSnapshots: 180_000,
  batchEvaluate: 290_000,
  inboxSync: 290_000,
} as const;
