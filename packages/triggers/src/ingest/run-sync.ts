import type { JobStreamEvent, ScraperInput } from "@ever-hust/jobs-api";
import type { SyncMode, SyncPlan } from "./config";
import { RunGeocoder, type GeocodeFn, type GeocodeMemo } from "./geocoder";
import {
  IngestAbortedError,
  JobIngestor,
  type IngestCounters,
  type IngestLogger,
} from "./ingestor";
import { errorText } from "./errors";
import type { IncompleteRunTracker } from "./incomplete-runs";
import { MAX_STALE_SOURCES_REPORTED, STALE_SOURCE_DAYS, type JobStore, type StaleSource } from "./job-store";
import type { UpstreamContractTracker } from "./upstream-contract";

/**
 * One sync run (spec 01a FR-9..FR-11): plan → open each upstream stream → ingest → summary.
 * Used by both the `/api/jobs/sync` route and the in-process Trigger task.
 */

export interface SyncCounters extends IngestCounters {
  durationMs: number;
}

export interface SyncSummary extends SyncCounters {
  /** Never true when an upstream failed or a stream was truncated (spec D4). */
  ok: boolean;
  mode: SyncMode;
  terms: string[];
  /** At least one upstream stream ended without its end line / with an error line. */
  truncated: boolean;
  /** At least one upstream request could not be opened. */
  upstreamFailed: boolean;
  /** At least one upstream answered plain JSON (pre-contract server). */
  legacyServer: boolean;
  /** Sum of the upstream `end.total` values (for cross-checking `received`). */
  upstreamTotal: number;
  /**
   * The upstream crawl covered every source (spec 01a D21): every upstream stream ended with an end
   * line that says `complete: true`. A missing or non-true `complete` is "not known complete". `ok`
   * may be true while this is false: a partial crawl is stored and is not a failure, but a job
   * missing from it may still be open.
   */
  complete: boolean;
  /**
   * `null` when {@link complete}; otherwise the first reason, in input order: the producer's own
   * `stopReason` (`"deadline"`, `"job_ceiling"`, …) or one of {@link SyncIncompleteReason}.
   */
  stopReason: string | null;
  /** Sum of the producer's `sourcesSkipped` (sources a bound left unscraped); 0 when unreported. */
  sourcesSkipped: number;
  /** Sum of the producer's `sourcesFailed` (sources that ran and failed); 0 when unreported. */
  sourcesFailed: number;
  errorMessages: string[];
  /** Set when the run did nothing on purpose (full mode gated off, spec 01a D18). */
  skipped?: string;
  /**
   * Full runs only (with a tracker): the full runs in a row, this one included, that were not
   * complete in this process; 0 when this one was. Informational only: the count is per process
   * (each web pod counts the runs it served, and a restart resets it), so it is logged, never
   * alerted on; {@link staleSources} is the escalation (spec 01a D27).
   */
  incompleteStreak?: number;
  /**
   * Full runs only: the sources none of whose rows a sync has seen for {@link STALE_SOURCE_DAYS}
   * days, oldest first, at most {@link MAX_STALE_SOURCES_REPORTED} (spec 01a D27). Read from the
   * database at the end of the run, so it holds across pods and restarts. Absent when the check did
   * not run (a skipped or aborted run, a failed read). See {@link staleSourcesAlarm}.
   */
  staleSources?: StaleSource[];
}

/**
 * Hust's reasons for a run that is not known complete (the producer's `stopReason` is used as is
 * when it gives one):
 * - `not_reported` — an end line without `complete: true` and without a reason (an older
 *   producer, or the legacy JSON fallback);
 * - `truncated` / `upstream_failed` — a stream broke or could not be opened (`ok` is false too);
 * - `aborted` — the database failed and the run stopped early (`ok` is false too);
 * - `crashed` — the run threw; set by the sync route on its own summary (`ok` is false too);
 * - `skipped` — the run did nothing on purpose (full mode gated off).
 */
export type SyncIncompleteReason =
  | "not_reported"
  | "truncated"
  | "upstream_failed"
  | "aborted"
  | "crashed"
  | "skipped";

export interface SyncProgress extends IngestCounters {
  /** The keyword currently streaming (keywords mode). */
  term?: string;
  upstream?: { sourcesDone?: number; sourcesTotal?: number; jobs?: number };
}

/** An opened upstream stream (see `EverJobsClient.openSearchStream`). */
export interface UpstreamStream extends AsyncIterable<JobStreamEvent> {
  readonly legacy?: boolean;
  close?(): void;
}

export interface RunSyncDeps {
  /** Open the upstream stream for plan input `index`. */
  openStream: (input: ScraperInput, index: number) => Promise<UpstreamStream>;
  store: JobStore;
  geocode: GeocodeFn | null;
  geocodeMaxCalls: number;
  /** Process-level geocoding memo shared across runs (default: none — per-run memo only). */
  geocodeMemo?: GeocodeMemo;
  /** Records whether Ever Jobs answered in NDJSON (contract v1) or plain JSON (spec 01a D18). */
  upstreamContract?: UpstreamContractTracker;
  /** Counts full runs in a row that were not complete (spec 01a D27). */
  incompleteRuns?: IncompleteRunTracker;
  batchSize?: number;
  logger?: IngestLogger;
  /** Called on upstream progress and after each flushed batch. Must not throw. */
  onProgress?: (progress: SyncProgress) => void;
  /**
   * The run's deadline (epoch ms). The streams are opened within it (see `createDefaultSyncDeps`);
   * the ingestor's row-by-row fallback writes no row past it (spec 01a D25).
   */
  deadlineAt?: number;
  now?: () => number;
}

const consoleLogger: IngestLogger = {
  info: (m) => console.log(m),
  warn: (m) => console.warn(m),
  error: (m) => console.error(m),
};

function describe(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

function isTruncation(err: unknown): boolean {
  return err instanceof Error && err.name === "TruncatedStreamError";
}

export async function runJobsSync(plan: SyncPlan, deps: RunSyncDeps): Promise<SyncSummary> {
  const now = deps.now ?? Date.now;
  const logger = deps.logger ?? consoleLogger;
  const startedAt = now();
  const geocoder = new RunGeocoder({
    lookup: deps.store,
    geocode: deps.geocode,
    maxCalls: deps.geocodeMaxCalls,
    logger,
    shared: deps.geocodeMemo,
  });
  let currentTerm: string | undefined;
  let lastUpstream: SyncProgress["upstream"];
  const ingestor: JobIngestor = new JobIngestor({
    store: deps.store,
    geocoder,
    batchSize: deps.batchSize,
    logger,
    deadlineAt: deps.deadlineAt,
    now,
    onFlush: () => report(currentTerm, lastUpstream),
  });

  let truncated = false;
  let upstreamFailed = false;
  let legacyServer = false;
  let fatal = false;
  let upstreamTotal = 0;
  const upstreamErrors: string[] = [];
  // Crawl completeness (spec 01a D21): only an end line with `complete: true` counts.
  let completeStreams = 0;
  let stopReason: string | null = null;
  let sourcesSkipped = 0;
  let sourcesFailed = 0;
  const incomplete = (reason: string) => {
    if (stopReason === null) stopReason = reason;
  };

  function report(term?: string, upstream?: SyncProgress["upstream"]) {
    if (!deps.onProgress) return;
    try {
      deps.onProgress({ ...ingestor.counters, term, upstream });
    } catch {
      // progress reporting must never break the run
    }
  }

  for (const [index, input] of plan.inputs.entries()) {
    const term = plan.mode === "keywords" ? input.searchTerm : undefined;
    const label = term ? `"${term}"` : "<none>";
    currentTerm = term;
    lastUpstream = undefined;
    let stream: UpstreamStream;
    try {
      stream = await deps.openStream(input, index);
    } catch (err) {
      upstreamFailed = true;
      incomplete("upstream_failed");
      upstreamErrors.push(`open term=${label}: ${describe(err)}`);
      logger.error(`[jobs-sync] upstream open failed for term=${label}: ${describe(err)}`);
      continue;
    }
    if (stream.legacy) legacyServer = true;
    if (typeof stream.legacy === "boolean") deps.upstreamContract?.observe(stream.legacy);

    let sawEnd = false;
    try {
      for await (const event of stream) {
        switch (event.type) {
          case "job":
            await ingestor.add(event.job);
            break;
          case "invalid":
            ingestor.noteInvalid(event.reason);
            break;
          case "progress":
            lastUpstream = {
              sourcesDone: event.sourcesDone,
              sourcesTotal: event.sourcesTotal,
              jobs: event.jobs,
            };
            report(term, lastUpstream);
            break;
          case "end":
            sawEnd = true;
            upstreamTotal += event.total ?? 0;
            sourcesSkipped += event.sourcesSkipped ?? 0;
            sourcesFailed += event.sourcesFailed ?? 0;
            if (event.complete === true) {
              completeStreams++;
            } else {
              // false, or absent (older producer / legacy JSON): not known complete.
              const reason = typeof event.stopReason === "string" ? event.stopReason.trim() : "";
              incomplete(reason !== "" ? reason : "not_reported");
            }
            if (event.legacy) {
              logger.warn(
                `[jobs-sync] Ever Jobs predates the streaming contract: term=${label} returned one page` +
                  ` of a ${event.total ?? "?"}-job result; upgrade Ever Jobs for a complete sync`,
              );
            }
            break;
        }
      }
      await ingestor.flush();
      if (!sawEnd) {
        // Defensive: the client throws on a missing end line; an adapter that does not is
        // still treated as truncated.
        truncated = true;
        incomplete("truncated");
        upstreamErrors.push(`stream term=${label}: ended without an end line`);
      }
    } catch (err) {
      stream.close?.();
      if (err instanceof IngestAbortedError) {
        fatal = true;
        incomplete("aborted");
        upstreamErrors.push(err.message);
        logger.error(`[jobs-sync] ${err.message}`);
        break;
      }
      if (isTruncation(err)) {
        truncated = true;
        incomplete("truncated");
      } else {
        upstreamFailed = true;
        incomplete("upstream_failed");
      }
      upstreamErrors.push(`stream term=${label}: ${describe(err)}`);
      logger.error(`[jobs-sync] upstream stream failed for term=${label}: ${describe(err)}`);
      // Keep what was received before the break (spec D3).
      try {
        await ingestor.flush();
      } catch (flushErr) {
        if (flushErr instanceof IngestAbortedError) {
          fatal = true;
          incomplete("aborted");
          upstreamErrors.push(flushErr.message);
          break;
        }
        throw flushErr;
      }
    }
    report(term, lastUpstream);
  }

  const counters = ingestor.counters;
  // Spec D4: failed upstream / truncated stream / fatal DB error → not ok; a few rejected rows
  // are tolerated, a run where every write failed is not.
  const nothingPersisted = counters.errors > 0 && ingestor.persisted === 0;
  const ok = !truncated && !upstreamFailed && !fatal && !nothingPersisted;
  // Complete only when every planned stream ended with `complete: true` (a skipped plan has none).
  if (plan.inputs.length === 0) incomplete("skipped");
  const complete = stopReason === null && completeStreams === plan.inputs.length;
  if (!complete) incomplete("not_reported"); // defensive: never "incomplete for no reason"

  const incompleteStreak =
    plan.mode === "full" && !plan.skipped && deps.incompleteRuns ? deps.incompleteRuns.record(complete) : undefined;
  // Spec D27: what went unseen, from the database (not from this process's memory).
  const staleSources =
    plan.mode === "full" && !plan.skipped && !fatal ? await findStaleSources(deps.store, now(), logger) : undefined;

  const summary: SyncSummary = {
    ok,
    mode: plan.mode,
    terms: plan.terms,
    ...counters,
    durationMs: Math.max(0, now() - startedAt),
    truncated,
    upstreamFailed,
    legacyServer,
    upstreamTotal,
    complete,
    stopReason: complete ? null : stopReason,
    sourcesSkipped,
    sourcesFailed,
    errorMessages: [...upstreamErrors, ...ingestor.errorMessages].slice(0, 25),
    ...(plan.skipped ? { skipped: plan.skipped } : {}),
    ...(incompleteStreak !== undefined ? { incompleteStreak } : {}),
    ...(staleSources !== undefined ? { staleSources } : {}),
  };

  if (plan.skipped) logger.warn(`[jobs-sync] ${plan.mode} sync skipped: ${plan.skipped}`);
  else if (ok && !complete) logger.warn(formatIncompleteLine(summary));
  if (staleSourcesAlarm(summary)) logger.error(formatStaleSourcesLine(summary));
  else if (staleSources !== undefined && staleSources.length > 0) logger.warn(formatStaleSourcesLine(summary));
  logger.info(formatSummaryLine(summary));
  return summary;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The sources unseen for {@link STALE_SOURCE_DAYS} days, or undefined when that cannot be read. */
async function findStaleSources(
  store: JobStore,
  at: number,
  logger: IngestLogger,
): Promise<StaleSource[] | undefined> {
  if (!store.findStaleSources) return undefined;
  try {
    return await store.findStaleSources(new Date(at - STALE_SOURCE_DAYS * DAY_MS), MAX_STALE_SOURCES_REPORTED);
  } catch (err) {
    logger.warn(`[jobs-sync] reading which sources went unseen failed: ${errorText(err)}`);
    return undefined;
  }
}

/**
 * Whether a full run's {@link SyncSummary.staleSources} is an alarm (spec 01a D27): a source went
 * unseen for {@link STALE_SOURCE_DAYS} days AND this crawl did not cover every source (not
 * complete, or sources failed), so the producer's bounds are the likely cause and the 90-day
 * cleanup will delete that source's postings while they may still be open. Then the scheduled
 * and in-process full tasks fail. After a complete crawl with no failed source, a stale source is
 * one Ever Jobs no longer lists (removed or renamed upstream): a warning only, or it would fail
 * every full run until the cleanup has deleted its rows. Takes the route's parsed summary too.
 */
export function staleSourcesAlarm(
  summary: Partial<Pick<SyncSummary, "mode" | "staleSources" | "complete" | "sourcesFailed">>,
): boolean {
  return (
    summary.mode === "full" &&
    Array.isArray(summary.staleSources) &&
    summary.staleSources.length > 0 &&
    (summary.complete !== true || (typeof summary.sourcesFailed === "number" && summary.sourcesFailed > 0))
  );
}

/** The stale sources of a full run (spec 01a D27): an error with {@link staleSourcesAlarm}, else a warning. */
export function formatStaleSourcesLine(
  s: Partial<Pick<SyncSummary, "mode" | "staleSources" | "complete" | "stopReason" | "sourcesSkipped" | "sourcesFailed">>,
): string {
  const stale = Array.isArray(s.staleSources) ? s.staleSources : [];
  const list = stale
    .map((x) => `${String(x?.site)} (last seen ${String(x?.lastSeen)}, ${String(x?.rows)} rows)`)
    .join(", ");
  const head = `[jobs-sync] full sync: ${stale.length} source(s) not seen for ${STALE_SOURCE_DAYS}+ days: ${list}`;
  if (staleSourcesAlarm(s)) {
    return (
      `${head}; this crawl did not cover every source (stopReason=${s.stopReason ?? "not_reported"}` +
      ` sourcesSkipped=${s.sourcesSkipped ?? 0} sourcesFailed=${s.sourcesFailed ?? 0}): their postings are not` +
      ` refreshed and the 90-day cleanup will delete them; raise Ever Jobs' fan-out deadline or fix the failing sources (spec 01a D19/D27)`
    );
  }
  return `${head}; the crawl was complete, so Ever Jobs no longer lists them (removed or renamed upstream?): their rows age out with the 90-day cleanup`;
}

/**
 * The warning for a run that succeeded on a partial crawl (spec 01a D21): what arrived is stored,
 * but the producer did not cover every source, so a job missing from the run may still be open.
 */
export function formatIncompleteLine(s: SyncSummary): string {
  return (
    `[jobs-sync] ${s.mode} sync incomplete: stopReason=${s.stopReason ?? "not_reported"}` +
    ` sourcesSkipped=${s.sourcesSkipped} sourcesFailed=${s.sourcesFailed} received=${s.received}` +
    ` upstreamTotal=${s.upstreamTotal}; the upstream crawl did not cover every source (what arrived is stored)`
  );
}

/** One log line per run. */
export function formatSummaryLine(s: SyncSummary): string {
  const term = s.terms.length > 0 ? s.terms.map((t) => `"${t}"`).join(",") : "<none>";
  return (
    `[jobs-sync] summary ok=${s.ok} mode=${s.mode} term=${term}` +
    ` received=${s.received} inserted=${s.inserted} updated=${s.updated} unchanged=${s.unchanged}` +
    ` invalid=${s.invalid} duplicatesMerged=${s.duplicatesMerged} mergedWrites=${s.mergedWrites} errors=${s.errors}` +
    ` geocodeCalls=${s.geocodeCalls} geocodeReused=${s.geocodeReused}` +
    ` upstreamTotal=${s.upstreamTotal} truncated=${s.truncated} upstreamFailed=${s.upstreamFailed}` +
    ` complete=${s.complete} stopReason=${s.stopReason ?? "-"} sourcesSkipped=${s.sourcesSkipped}` +
    ` sourcesFailed=${s.sourcesFailed} legacyServer=${s.legacyServer} durationMs=${s.durationMs}` +
    (s.incompleteStreak !== undefined ? ` incompleteStreak=${s.incompleteStreak}` : "") +
    (s.staleSources !== undefined ? ` staleSources=${s.staleSources.length}` : "") +
    (s.skipped ? ` skipped=true` : "")
  );
}
