import { task, schedules, logger } from "@trigger.dev/sdk";
import type { SyncMode } from "./ingest";
import { runsOnTrigger, SKIPPED } from "./scheduler";
import {
  FULL_SYNC_MAX_DURATION_S,
  KEYWORD_SYNC_MAX_DURATION_S,
  runInProcessSync,
  runScheduledSync,
} from "./sync-runner";

/**
 * Job-corpus sync (spec 01a). Two schedules, both portable: they POST the app's own
 * `/api/jobs/sync` endpoint so the sync executes in the app's runtime — which can reach the Ever
 * Jobs API (including an internal/ClusterIP one) wherever the app is deployed (k8s, Vercel, …) —
 * and follow its NDJSON progress stream. An external scheduler (k8s CronJob / Vercel Cron) can
 * hit the same endpoint directly.
 *
 * - `sync-jobs-schedule`      every 15 min, mode=keywords (rotating term, keyword-capable sources)
 * - `sync-jobs-full-schedule` every 6 h,    mode=full     (keyword-less list of every source)
 *
 * Both THROW when the route reports `ok:false`, answers non-2xx, or the stream is cut, so a failed
 * sync is a FAILED run. A run that is ok on a partial upstream crawl (`complete: false`, spec 01a
 * D21) is NOT failed: the task logs a warning and returns the summary with its `stopReason` —
 * unless a source has gone unseen for days meanwhile (`staleSources`, spec 01a D27).
 * Retries are off (spec D7): the next tick is the retry, and re-running a failed full sync would
 * re-scrape every source.
 */

const triggerLogger = {
  info: (message: string, data?: Record<string, unknown>) => logger.info(message, data),
  warn: (message: string, data?: Record<string, unknown>) => logger.warn(message, data),
};

// Direct in-process sync (kept for in-cluster/manual runs where this code can reach Ever Jobs and
// the database). Payload: { mode?: "keywords" | "full", searchTerms?: string[] }.
export const syncJobsTask = task({
  id: "sync-jobs",
  maxDuration: FULL_SYNC_MAX_DURATION_S,
  retry: { maxAttempts: 1 },
  run: async (payload?: { mode?: SyncMode; searchTerms?: string[] }) => {
    return runInProcessSync({ mode: payload?.mode, searchTerms: payload?.searchTerms });
  },
});

// Scheduled keyword sync. Under SCHEDULER=cron an external scheduler owns the cadence and this
// no-ops.
export const syncJobsSchedule = schedules.task({
  id: "sync-jobs-schedule",
  cron: "*/15 * * * *",
  maxDuration: KEYWORD_SYNC_MAX_DURATION_S,
  queue: { name: "sync-jobs-keywords", concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async () => {
    if (!runsOnTrigger()) return SKIPPED;
    return runScheduledSync("keywords", { logger: triggerLogger });
  },
});

// Scheduled full (keyword-less) sync, offset from the quarter-hour keyword ticks.
export const syncJobsFullSchedule = schedules.task({
  id: "sync-jobs-full-schedule",
  cron: "20 */6 * * *",
  maxDuration: FULL_SYNC_MAX_DURATION_S,
  queue: { name: "sync-jobs-full", concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async () => {
    if (!runsOnTrigger()) return SKIPPED;
    return runScheduledSync("full", { logger: triggerLogger });
  },
});
