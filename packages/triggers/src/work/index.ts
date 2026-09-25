/**
 * App-runtime work for the scheduled / background tasks — `@ever-hust/triggers/work`.
 *
 * Everything here touches the database, sends email or calls an LLM, so it runs INSIDE the Next
 * app (behind the CRON_SECRET-guarded `/api/cron/*` routes), never inside a Trigger.dev worker:
 * the Trigger env carries only CRON_SECRET + NEXT_PUBLIC_APP_URL. This entry point must not import
 * `@trigger.dev/sdk` (directly or transitively) so the app can load it without the SDK.
 */
export { CronWorkError, CronInputError, DEFAULT_WORK_BUDGET_MS } from "./errors";

export {
  runCleanup,
  cleanupExpiredJobs,
  resolveCleanupMode,
  CLEANUP_MODES,
  JOB_REFERENCING_COLUMNS,
  DELETE_BATCH_SIZE,
  type CleanupMode,
  type CleanupResult,
  type CleanupOptions,
  type JobsCleanupResult,
} from "./cleanup";

export {
  runJobAlerts,
  processAlerts,
  ALERT_FREQUENCIES,
  ALERT_MIN_INTERVAL_MS,
  type AlertFrequency,
  type AlertRunResult,
  type JobAlertsRunResult,
} from "./job-alerts";

export {
  runFollowUpNudges,
  processFollowUpNudges,
  resolveFollowUpNudgesEnabled,
  NUDGE_COOLDOWN_DAYS,
  type FollowUpNudgeResult,
  type FollowUpNudgeRunResult,
} from "./follow-up-nudges";

export { processFunnelSnapshots, type FunnelSnapshotResult } from "./funnel-snapshots";

export {
  runBatchEvaluate,
  type BatchEvaluatePayload,
  type BatchEvaluateResult,
} from "./batch-evaluate";
