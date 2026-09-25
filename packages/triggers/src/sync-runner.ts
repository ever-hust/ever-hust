import {
  buildSyncPlan,
  createDefaultSyncDeps,
  processUpstreamContract,
  readSyncEnv,
  runJobsSync,
  runSyncViaRoute,
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

/**
 * Scheduled sync: call the app's `/api/jobs/sync` route in `mode`, follow its progress stream,
 * return the summary. Throws {@link SyncRunFailedError} on any failure. A run that is ok on a
 * PARTIAL upstream crawl (`complete: false`, e.g. `stopReason: "deadline"`, spec 01a D21) does not
 * throw: it is logged as a warning and returned with its `complete` / `stopReason` /
 * `sourcesSkipped` / `sourcesFailed`, so the Trigger run shows it.
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
  } else if (summary.complete !== true) {
    logger.warn(
      `[jobs-sync] ${mode} sync ok but INCOMPLETE: stopReason=${summary.stopReason ?? "not_reported"}` +
        ` sourcesSkipped=${summary.sourcesSkipped ?? 0} sourcesFailed=${summary.sourcesFailed ?? 0}` +
        ` (the upstream crawl did not cover every source; what arrived is stored)`,
      { ...summary },
    );
  } else {
    logger.info(`[jobs-sync] ${mode} sync ok`, { ...summary });
  }
  return summary;
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
  return summary;
}
