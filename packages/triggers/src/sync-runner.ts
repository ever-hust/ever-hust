import {
  buildSyncPlan,
  createDefaultSyncDeps,
  formatStaleSourcesLine,
  processUpstreamContract,
  readSyncEnv,
  runJobsSync,
  runSyncViaRoute,
  staleSourcesAlarm,
  SyncRunFailedError,
  type RouteSyncOptions,
  type RouteSyncResult,
  type RunSyncDeps,
  type SyncMode,
  type SyncRequestOptions,
  type SyncSummary,
} from "./ingest";

/**
 * What the Trigger.dev sync tasks run (spec 01a FR-12), kept free of the Trigger SDK so it is
 * unit-testable. Every function here THROWS when the run did not succeed, so the task run is
 * marked FAILED instead of silently green.
 */

/** maxDuration of the 15-min keyword schedule (seconds). */
export const KEYWORD_SYNC_MAX_DURATION_S = 600;
/** maxDuration of the 6-hourly full schedule (seconds). */
export const FULL_SYNC_MAX_DURATION_S = 3600;
/** Headroom below maxDuration so the call fails with a clear error before the task is killed. */
const ROUTE_TIMEOUT_MARGIN_MS = 30_000;
/** Minimum spacing of progress log lines. */
const PROGRESS_LOG_INTERVAL_MS = 60_000;

export interface SyncRunnerLogger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
}

const consoleLogger: SyncRunnerLogger = {
  info: (message, data) => console.log(message, data ?? ""),
  warn: (message, data) => console.warn(message, data ?? ""),
};

export function maxDurationFor(mode: SyncMode): number {
  return mode === "full" ? FULL_SYNC_MAX_DURATION_S : KEYWORD_SYNC_MAX_DURATION_S;
}

// ---------------------------------------------------------------------------
// Scheduling (spec 01a D33): one queue, late keyword ticks, TTLs, per-environment full schedules
// ---------------------------------------------------------------------------

/**
 * The one Trigger queue every job-sync task runs on (concurrency 1): a full and a keyword sync
 * never run at once against the same Ever Jobs (handover H-4). It replaces the per-mode queues
 * `sync-jobs-keywords` and `sync-jobs-full`, which stay unused after the deploy.
 */
export const SYNC_JOBS_QUEUE = "sync-jobs";

/**
 * A keyword tick that starts this long after its scheduled time skips itself (H-4): behind a
 * full run (up to an hour) on the shared queue, up to four ticks wait, and would otherwise fire
 * back to back — each picking its term from the clock at plan time, so the same term again.
 * Below the 15-min tick interval, so a tick never runs in the next tick's rotation slot.
 */
export const KEYWORD_TICK_MAX_LATENESS_MS = 10 * 60_000;

/**
 * Time-to-live of a scheduled run (T-3): a run that cannot start within it expires instead of
 * piling up behind a stuck queue (on 2026-10-05, 556 runs piled up behind a phantom run).
 * Keyword: one tick interval minus margin; full: an hour (the next full run is 6 h away).
 */
export const KEYWORD_SYNC_TTL = "10m";
export const FULL_SYNC_TTL = "1h";

/** Trigger.dev environment types (`ctx.environment.type`; the SDK's schedule `environments`). */
export type TriggerEnvironmentType = "PRODUCTION" | "STAGING" | "PREVIEW" | "DEVELOPMENT";

export interface FullSyncScheduleDef {
  /** Task id; unique per project. */
  id: string;
  /** UTC cron. */
  cron: string;
  /** Where this declaration creates a schedule (the SDK's declarative `environments` filter). */
  environments: readonly TriggerEnvironmentType[];
}

/**
 * The full sync, one declaration per environment at staggered hours (spec 01a D33, FS-3 / H-1 step
 * 4): dev, stage and prod crawl the same external sites and write to the same Postgres cluster,
 * which also hosts Gauzy production, so they no longer start at the same minute. Prod keeps
 * `20 *\/6` (00/06/12/18:20Z, which other runbooks rely on) and its task id, so its run history
 * continues; stage runs 2 h later, the `develop` preview env (hust-dev) and local dev 4 h later.
 * Every hour stays at minute 20, offset from the quarter-hour keyword ticks.
 */
export const FULL_SYNC_SCHEDULES = [
  { id: "sync-jobs-full-schedule", cron: "20 */6 * * *", environments: ["PRODUCTION"] },
  { id: "sync-jobs-full-schedule-stage", cron: "20 2-23/6 * * *", environments: ["STAGING"] },
  { id: "sync-jobs-full-schedule-dev", cron: "20 4-23/6 * * *", environments: ["PREVIEW", "DEVELOPMENT"] },
] as const satisfies readonly FullSyncScheduleDef[];

/** What a sync tick returns when it does nothing on purpose (never a FAILED run). */
export interface SyncTickSkipped {
  ok: true;
  mode: SyncMode;
  /** Why: `late_tick` or `wrong_environment`. */
  skipped: "late_tick" | "wrong_environment";
  /** The tick's scheduled time (ISO 8601 UTC), when known. */
  scheduledAt?: string;
  /** How late the tick started (ms). */
  lateByMs?: number;
  /** The environment the run is in, and the ones its schedule is for. */
  environment?: string;
  scheduledFor?: readonly string[];
  /** The task that skipped. */
  taskId?: string;
}

/**
 * The skip summary for a tick that started more than `maxLateMs` after its scheduled time
 * (`payload.timestamp`, a Date or its ISO string), else null. A tick without a usable scheduled
 * time runs.
 */
export function lateTickSkip(
  mode: SyncMode,
  scheduledAt: unknown,
  now: number = Date.now(),
  maxLateMs: number = KEYWORD_TICK_MAX_LATENESS_MS,
): SyncTickSkipped | null {
  const at = scheduledAt instanceof Date ? scheduledAt : typeof scheduledAt === "string" ? new Date(scheduledAt) : null;
  if (!at || !Number.isFinite(at.getTime())) return null;
  const lateByMs = now - at.getTime();
  if (lateByMs <= maxLateMs) return null;
  return { ok: true, mode, skipped: "late_tick", scheduledAt: at.toISOString(), lateByMs };
}

/**
 * The skip summary for a full-schedule run in an environment its declaration is not for, else
 * null. Defense in depth: the platform's `environments` filter already keeps the schedule out of
 * other environments; should a Trigger version ignore the filter, every environment would run
 * all three schedules, so the run checks too. An unknown environment runs.
 */
export function environmentSkip(def: FullSyncScheduleDef, environment: string | undefined): SyncTickSkipped | null {
  if (environment === undefined || (def.environments as readonly string[]).includes(environment)) return null;
  return {
    ok: true,
    mode: "full",
    skipped: "wrong_environment",
    environment,
    scheduledFor: def.environments,
    taskId: def.id,
  };
}

/**
 * Scheduled sync: call the app's `/api/jobs/sync` route in `mode`, follow its progress stream,
 * return the summary. Throws {@link SyncRunFailedError} on any failure. A run that is ok on a
 * PARTIAL upstream crawl (`complete: false`, e.g. `stopReason: "deadline"`, spec 01a D21) does not
 * throw: it is logged as a warning and returned with its `complete` / `stopReason` /
 * `sourcesSkipped` / `sourcesFailed`, so the Trigger run shows it — unless a source has gone
 * unseen for days and this run did not crawl it for a reason that points at breakage (the
 * per-source rule, `staleSourcesAlarming`, spec D27): then it throws. Stale sources that are not
 * an alarm (cut by the job ceiling, not queried in list mode, no longer listed upstream, …) are
 * logged as a warning.
 */
export async function runScheduledSync(
  mode: SyncMode,
  overrides: Partial<Omit<RouteSyncOptions, "mode">> & { logger?: SyncRunnerLogger } = {},
): Promise<RouteSyncResult> {
  const { logger = consoleLogger, ...routeOverrides } = overrides;
  let lastLog = 0;
  const summary = await runSyncViaRoute({
    timeoutMs: maxDurationFor(mode) * 1000 - ROUTE_TIMEOUT_MARGIN_MS,
    onLine: (line) => {
      const now = Date.now();
      if (line.type === "start" || now - lastLog >= PROGRESS_LOG_INTERVAL_MS) {
        lastLog = now;
        logger.info(`[jobs-sync] ${String(line.type)}`, line);
      }
    },
    ...routeOverrides,
    mode,
  });
  if (typeof summary.skipped === "string") {
    logger.info(`[jobs-sync] ${mode} sync skipped: ${summary.skipped}`, { ...summary });
  } else if (staleSourcesAlarm(summary)) {
    throw staleSourcesError(summary);
  } else {
    if (Array.isArray(summary.staleSources) && summary.staleSources.length > 0) {
      logger.warn(formatStaleSourcesLine(summary), { staleSources: summary.staleSources });
    }
    logOutcome(mode, summary, logger);
  }
  return summary;
}

/** The run's own line: a warning for a partial crawl (spec D21), else info. */
function logOutcome(mode: SyncMode, summary: RouteSyncResult, logger: SyncRunnerLogger): void {
  if (summary.complete !== true) {
    logger.warn(
      `[jobs-sync] ${mode} sync ok but INCOMPLETE: stopReason=${summary.stopReason ?? "not_reported"}` +
        ` sourcesSkipped=${summary.sourcesSkipped ?? 0} sourcesFailed=${summary.sourcesFailed ?? 0}` +
        ` (the upstream crawl did not cover every source; what arrived is stored)`,
      { ...summary },
    );
  } else {
    logger.info(`[jobs-sync] ${mode} sync ok`, { ...summary });
  }
}

/**
 * In-process sync (the `sync-jobs` task): runs the ingest core directly, for hosts where the task
 * runtime can reach both Ever Jobs and the database. Throws when the summary is not ok.
 */
export async function runInProcessSync(
  options: SyncRequestOptions = {},
  deps?: RunSyncDeps,
): Promise<SyncSummary> {
  const contract = (deps?.upstreamContract ?? processUpstreamContract).current;
  const plan = buildSyncPlan(options, readSyncEnv(), Date.now(), contract);
  const summary = await runJobsSync(plan, deps ?? createDefaultSyncDeps({ mode: plan.mode }));
  if (!summary.ok) {
    throw new SyncRunFailedError(
      `sync failed: ${summary.errorMessages.slice(0, 3).join(" | ") || "see counters"}`,
      undefined,
      { ...summary },
    );
  }
  if (staleSourcesAlarm(summary)) throw staleSourcesError(summary);
  return summary;
}

/**
 * A source unseen for days that this run did not crawl for a reason that points at breakage (spec
 * 01a D27): the run stored what it received, but that source's postings are not refreshed and the
 * 90-day cleanup will delete them.
 */
function staleSourcesError(summary: SyncSummary): SyncRunFailedError {
  return new SyncRunFailedError(formatStaleSourcesLine(summary), undefined, { ...summary });
}
