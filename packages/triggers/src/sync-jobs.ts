import { task, schedules, logger, queue } from "@trigger.dev/sdk";
import type { SyncMode } from "./ingest";
import { runsOnTrigger, SKIPPED } from "./scheduler";
import {
  environmentSkip,
  FULL_SYNC_MAX_DURATION_S,
  FULL_SYNC_SCHEDULES,
  FULL_SYNC_TTL,
  KEYWORD_SYNC_MAX_DURATION_S,
  KEYWORD_SYNC_TTL,
  lateTickSkip,
  runInProcessSync,
  runScheduledSync,
  SYNC_JOBS_QUEUE,
  type FullSyncScheduleDef,
} from "./sync-runner";

/**
 * Job-corpus sync (spec 01a). The schedules are portable: they POST the app's own
 * `/api/jobs/sync` endpoint so the sync executes in the app's runtime — which can reach the Ever
 * Jobs API (including an internal/ClusterIP one) wherever the app is deployed (k8s, Vercel, …) —
 * and follow its NDJSON progress stream. An external scheduler (k8s CronJob / Vercel Cron) can
 * hit the same endpoint directly.
 *
 * - `sync-jobs-schedule`             every 15 min, mode=keywords (rotating term, keyword-capable
 *                                    sources), every environment
 * - `sync-jobs-full-schedule`        every 6 h at 00/06/12/18:20Z, mode=full, PRODUCTION only
 * - `sync-jobs-full-schedule-stage`  every 6 h at 02/08/14/20:20Z, mode=full, STAGING only
 * - `sync-jobs-full-schedule-dev`    every 6 h at 04/10/16/22:20Z, mode=full, PREVIEW (hust-dev) and
 *                                    DEVELOPMENT only (spec 01a D33: the environments no longer hit
 *                                    the same sites and the shared Postgres cluster at once)
 *
 * Every sync task runs on ONE queue (`sync-jobs`, concurrency 1), so a full and a keyword sync
 * never run at the same time against the same Ever Jobs (D33, H-4). Scheduled runs carry a TTL
 * (10 min keyword, 1 h full): a run that cannot start in time expires instead of piling up behind
 * a stuck queue (T-3). A keyword tick that starts more than 10 min after its scheduled time (e.g.
 * queued behind a full run) returns a `late_tick` skip instead of firing back to back with the
 * next one.
 *
 * Every task THROWS when the route reports `ok:false`, answers non-2xx, or the stream is cut, so
 * a failed sync is a FAILED run. A run that is ok on a partial upstream crawl (`complete: false`,
 * spec 01a D21) is NOT failed: the task logs a warning and returns the summary with its
 * `stopReason` — unless a source has gone unseen for days and this run did not crawl it for a
 * reason that points at breakage (`staleSourcesAlarming`, spec 01a D27/D32).
 * Retries are off (spec D7): the next tick is the retry, and re-running a failed full sync would
 * re-scrape every source.
 */

const triggerLogger = {
  info: (message: string, data?: Record<string, unknown>) => logger.info(message, data),
  warn: (message: string, data?: Record<string, unknown>) => logger.warn(message, data),
};

/** The one queue of every job-sync task (spec 01a D33). */
export const syncJobsQueue = queue({ name: SYNC_JOBS_QUEUE, concurrencyLimit: 1 });

// Direct in-process sync (kept for in-cluster/manual runs where this code can reach Ever Jobs and
// the database). Payload: { mode?: "keywords" | "full", searchTerms?: string[] }. On the shared
// queue too, so a manual run never overlaps a scheduled one.
export const syncJobsTask = task({
  id: "sync-jobs",
  maxDuration: FULL_SYNC_MAX_DURATION_S,
  queue: syncJobsQueue,
  retry: { maxAttempts: 1 },
  run: async (payload?: { mode?: SyncMode; searchTerms?: string[] }) => {
    return runInProcessSync({ mode: payload?.mode, searchTerms: payload?.searchTerms });
  },
});

// Scheduled keyword sync. Under SCHEDULER=cron an external scheduler owns the cadence and this
// no-ops (the k8s fallback: `.deploy/k8s/sync-cronjob.yaml`).
export const syncJobsSchedule = schedules.task({
  id: "sync-jobs-schedule",
  cron: "*/15 * * * *",
  maxDuration: KEYWORD_SYNC_MAX_DURATION_S,
  queue: syncJobsQueue,
  ttl: KEYWORD_SYNC_TTL,
  retry: { maxAttempts: 1 },
  run: async (payload) => {
    if (!runsOnTrigger()) return SKIPPED;
    const late = lateTickSkip("keywords", payload?.timestamp);
    if (late) {
      logger.warn(
        `[jobs-sync] keywords tick skipped: it started ${Math.round((late.lateByMs ?? 0) / 1000)} s after its` +
          ` scheduled time ${late.scheduledAt} (queued behind another sync); the next tick runs`,
        { ...late },
      );
      return late;
    }
    return runScheduledSync("keywords", { logger: triggerLogger });
  },
});

/**
 * One full-sync schedule declaration (spec 01a D33). Under SCHEDULER=cron it no-ops too; its k8s
 * fallback is `.deploy/k8s/sync-full-cronjob.yaml` (spec D31).
 */
function fullSyncSchedule<const TId extends string>(def: FullSyncScheduleDef & { id: TId }) {
  return schedules.task({
    id: def.id,
    cron: { pattern: def.cron, environments: [...def.environments] },
    maxDuration: FULL_SYNC_MAX_DURATION_S,
    queue: syncJobsQueue,
    ttl: FULL_SYNC_TTL,
    retry: { maxAttempts: 1 },
    run: async (_payload, { ctx }) => {
      if (!runsOnTrigger()) return SKIPPED;
      const elsewhere = environmentSkip(def, ctx?.environment?.type);
      if (elsewhere) {
        logger.warn(
          `[jobs-sync] ${def.id} skipped: this is ${elsewhere.environment}, the schedule is for` +
            ` ${def.environments.join(", ")} (the platform's environments filter did not apply)`,
          { ...elsewhere },
        );
        return elsewhere;
      }
      return runScheduledSync("full", { logger: triggerLogger });
    },
  });
}

// Production keeps the original id and cron, so its schedule and run history continue.
export const syncJobsFullSchedule = fullSyncSchedule(FULL_SYNC_SCHEDULES[0]);
export const syncJobsFullScheduleStage = fullSyncSchedule(FULL_SYNC_SCHEDULES[1]);
export const syncJobsFullScheduleDev = fullSyncSchedule(FULL_SYNC_SCHEDULES[2]);
