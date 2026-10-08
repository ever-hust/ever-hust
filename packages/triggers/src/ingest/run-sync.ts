import type { JobStreamEnd, JobStreamEvent, ScraperInput } from "@ever-hust/jobs-api";
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
import {
  MAX_STALE_SOURCES_READ,
  MAX_STALE_SOURCES_REPORTED,
  STALE_SOURCE_DAYS,
  type JobStore,
  type StaleSource,
} from "./job-store";
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
  /** Sum of the producer's `sourcesPartial` (returned jobs, then failed); 0 when unreported. */
  sourcesPartial: number;
  /**
   * Sum of the producer's `problemSourcesTotal` (Ever Jobs Spec 1721 FR-20): sources whose list
   * this run must not be read as whole. Absent when no end line reported a per-source list.
   */
  problemSourcesTotal?: number;
  /**
   * The problem sources by reason (`blocked`, `skipped`, `keyword_required`, …), summed over the
   * end lines' lists; at most {@link MAX_PROBLEM_REASONS} reasons (the rest under `(other)`).
   * Absent when no end line reported a per-source list.
   */
  problemReasons?: Record<string, number>;
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
   * days, each judged against this run's per-source report ({@link judgeStaleSource}): the
   * alarming ones first, then the rest, each group oldest first, at most
   * {@link MAX_STALE_SOURCES_REPORTED} (spec 01a D27). Read from the database at the end of the
   * run, so it holds across pods and restarts. Absent when the check did not run (a skipped or
   * aborted run, a failed read). See {@link staleSourcesAlarm}.
   */
  staleSources?: JudgedStaleSource[];
  /** With {@link staleSources}: how many stale sources the read found (at most {@link MAX_STALE_SOURCES_READ}). */
  staleSourcesTotal?: number;
  /**
   * With {@link staleSources}: how many of them this run escalates (the per-source rule, spec 01a
   * D27). The scheduled and in-process full tasks and the full CronJob fail when it is above 0. A
   * summary without it (an app before the per-source rule) is judged crawl-wide.
   */
  staleSourcesAlarming?: number;
}

/** A stale source with this run's verdict on it (spec 01a D27, see {@link judgeStaleSource}). */
export interface JudgedStaleSource extends StaleSource {
  /**
   * What this run's per-source report says about the source: the producer's reason
   * (`blocked`, `partial`, `keyword_required`, `results_wanted`, `skipped (job_ceiling)`, …),
   * `not_listed` (a whole report does not list it: it ran clean, or Ever Jobs did not select it),
   * or `unknown` (no per-source report, or a truncated one that does not list it).
   */
  thisRun: string;
  /** Whether this source makes the run fail. */
  alarm: boolean;
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
  let sourcesPartial = 0;
  // Per source (Ever Jobs Spec 1721 FR-20; spec 01a D27): what the end lines listed.
  const sourceReport = new SourceReportBuilder();
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
            sourcesPartial += event.sourcesPartial ?? 0;
            sourceReport.add(event);
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
  // Spec D27: what went unseen, from the database (not from this process's memory), each source
  // judged against what this run's end lines said about it.
  const stale =
    plan.mode === "full" && !plan.skipped && !fatal ? await findStaleSources(deps.store, now(), logger) : undefined;
  const perSource = sourceReport.build(plan.inputs.length, { complete, sourcesFailed });
  const judged = stale?.map((s): JudgedStaleSource => ({ ...s, ...judgeStaleSource(s.site, perSource) }));
  const alarming = judged?.filter((s) => s.alarm) ?? [];
  const staleSources = judged
    ? [...alarming, ...judged.filter((s) => !s.alarm)].slice(0, MAX_STALE_SOURCES_REPORTED)
    : undefined;

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
    sourcesPartial,
    ...(perSource.listedStreams > 0
      ? { problemSourcesTotal: perSource.problemSourcesTotal, problemReasons: perSource.reasons }
      : {}),
    errorMessages: [...upstreamErrors, ...ingestor.errorMessages].slice(0, 25),
    ...(plan.skipped ? { skipped: plan.skipped } : {}),
    ...(incompleteStreak !== undefined ? { incompleteStreak } : {}),
    ...(staleSources !== undefined && judged !== undefined
      ? { staleSources, staleSourcesTotal: judged.length, staleSourcesAlarming: alarming.length }
      : {}),
  };

  if (plan.skipped) logger.warn(`[jobs-sync] ${plan.mode} sync skipped: ${plan.skipped}`);
  else if (ok && !complete) logger.warn(formatIncompleteLine(summary));
  if (staleSourcesAlarm(summary)) logger.error(formatStaleSourcesLine(summary));
  else if (staleSources !== undefined && staleSources.length > 0) logger.warn(formatStaleSourcesLine(summary));
  logger.info(formatSummaryLine(summary));
  return summary;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The sources unseen for {@link STALE_SOURCE_DAYS} days (at most {@link MAX_STALE_SOURCES_READ},
 * oldest first), or undefined when that cannot be read. More than are reported are read, so the
 * per-source verdict covers a newly broken source even when many older, warning-only stale
 * sources sort before it (the summary reports the alarming ones first).
 */
async function findStaleSources(
  store: JobStore,
  at: number,
  logger: IngestLogger,
): Promise<StaleSource[] | undefined> {
  if (!store.findStaleSources) return undefined;
  try {
    return await store.findStaleSources(new Date(at - STALE_SOURCE_DAYS * DAY_MS), MAX_STALE_SOURCES_READ);
  } catch (err) {
    logger.warn(`[jobs-sync] reading which sources went unseen failed: ${errorText(err)}`);
    return undefined;
  }
}

/** Most distinct reasons {@link SyncSummary.problemReasons} keeps; the rest are summed under `(other)`. */
export const MAX_PROBLEM_REASONS = 32;

/** One listing of a source in an end line's `problemSources`: its reason and that stream's `stopReason`. */
export interface SourceListing {
  reason: string;
  stopReason: string | null;
}

/** What a run's end lines said per source (Ever Jobs Spec 1721 FR-20), for {@link judgeStaleSource}. */
export interface SourceReport {
  /** Each listed source (trimmed, lower case, as the stale-source read groups them) → its listings. */
  listed: ReadonlyMap<string, readonly SourceListing[]>;
  /**
   * Every planned stream ended with a WHOLE list (`problemSourcesTotal` ≤ its length): then a
   * source not listed ran to the end and did not fail, or the producer did not select it at all.
   */
  exhaustive: boolean;
  /** Streams whose end line carried a list, whole or not. */
  listedStreams: number;
  /** Sum of the producer's uncapped counts. */
  problemSourcesTotal: number;
  /** Problem sources by reason (see {@link MAX_PROBLEM_REASONS}). */
  reasons: Record<string, number>;
  /** The crawl-wide facts, for a source the report cannot speak for (the rule before FR-20). */
  complete: boolean;
  sourcesFailed: number;
}

/** Collects the end lines' per-source lists over a run (one stream per planned input). */
export class SourceReportBuilder {
  private readonly listed = new Map<string, SourceListing[]>();
  private readonly reasons = new Map<string, number>();
  private wholeStreams = 0;
  private listedStreams = 0;
  private problemSourcesTotal = 0;

  add(end: Pick<JobStreamEnd, "problemSources" | "problemSourcesTotal" | "stopReason">): void {
    const list = end.problemSources;
    if (list === undefined) return; // a producer before FR-20 (or the legacy JSON fallback)
    this.listedStreams++;
    const total = end.problemSourcesTotal;
    // Absent total: truncation unknown, so the list is not taken as whole.
    if (total !== undefined && total <= list.length) this.wholeStreams++;
    this.problemSourcesTotal += Math.max(total ?? 0, list.length);
    const stopReason = typeof end.stopReason === "string" && end.stopReason.trim() !== "" ? end.stopReason.trim() : null;
    for (const { site, reason } of list) {
      const key = site.trim().toLowerCase();
      const listings = this.listed.get(key) ?? [];
      listings.push({ reason: reason.trim().toLowerCase(), stopReason });
      this.listed.set(key, listings);
      const counted = this.reasons.has(reason) || this.reasons.size < MAX_PROBLEM_REASONS ? reason : "(other)";
      this.reasons.set(counted, (this.reasons.get(counted) ?? 0) + 1);
    }
  }

  build(plannedStreams: number, crawl: { complete: boolean; sourcesFailed: number }): SourceReport {
    return {
      listed: this.listed,
      exhaustive: plannedStreams > 0 && this.wholeStreams === plannedStreams,
      listedStreams: this.listedStreams,
      problemSourcesTotal: this.problemSourcesTotal,
      reasons: Object.fromEntries(this.reasons),
      complete: crawl.complete,
      sourcesFailed: crawl.sourcesFailed,
    };
  }
}

/**
 * Listed reasons that never make a stale source an alarm (spec 01a D27): `keyword_required` (list
 * mode does not query the source by design; only keyword runs refresh it) and `results_wanted`
 * (it ran and delivered at least `resultsWanted` jobs: the crawl reached it, so its staleness is
 * not the crawl's doing — look at the run's invalid rows or the source's site name instead).
 */
export const STALE_WARN_REASONS: ReadonlySet<string> = new Set(["keyword_required", "results_wanted"]);

/**
 * Producer bounds whose `skipped` sources are a sizing matter, not breakage (spec 01a D27): the job
 * ceiling (`EVER_JOBS_MAX_JOBS_PER_SEARCH`) trips because the crawl already holds the most jobs it
 * may, and it trips on every full run today (`stopReason=job_ceiling`). A source it cut is sized
 * back in by Ever Jobs' ceiling or `JOBS_SYNC_FULL_RESULTS_PER_SOURCE`, not fixed. A skip by the
 * fan-out deadline (D19 step 1 not done), by no reason or by a reason Hust does not know stays an
 * alarm.
 */
export const SIZING_STOP_REASONS: ReadonlySet<string> = new Set(["job_ceiling"]);

/** This run's verdict on one stale source. */
export interface StaleSourceVerdict {
  thisRun: string;
  alarm: boolean;
}

/**
 * The per-source D27 rule (spec 01a, revised 2026-10-08). A stale source (no row seen for
 * {@link STALE_SOURCE_DAYS} days) is an ALARM only when this run did not crawl it for a reason
 * that points at breakage:
 *
 * | the run's report on the source                                   | verdict |
 * |------------------------------------------------------------------|---------|
 * | listed with a failure reason (`blocked`, `fetch_error`, `timeout`, `bad_input`, `browser_unavailable`, `circuit_open`, `not_registered`, `rate_limited`, `unknown`) | alarm |
 * | listed `partial` (returned some jobs, then failed)                | alarm |
 * | listed `skipped`, stream stopped on `job_ceiling`                 | warning |
 * | listed `skipped`, stream stopped on `deadline` / no or another reason | alarm |
 * | listed `keyword_required` or `results_wanted`                     | warning |
 * | listed with a reason Hust does not know                           | alarm |
 * | not listed, every stream's list whole                             | warning (`not_listed`: ran clean, or not selected — Ever Jobs no longer lists it) |
 * | not listed, no per-source list or a truncated one                 | the crawl-wide rule: alarm unless the crawl was complete with no failed source (`unknown`) |
 *
 * A source listed more than once (one listing per stream) is an alarm if any listing is.
 */
export function judgeStaleSource(site: string, report: SourceReport): StaleSourceVerdict {
  const listings = report.listed.get(site.trim().toLowerCase());
  if (listings && listings.length > 0) {
    const verdicts = listings.map(judgeListing);
    return verdicts.find((v) => v.alarm) ?? verdicts[0]!;
  }
  if (report.exhaustive) return { thisRun: "not_listed", alarm: false };
  return { thisRun: "unknown", alarm: report.complete !== true || report.sourcesFailed > 0 };
}

function judgeListing({ reason, stopReason }: SourceListing): StaleSourceVerdict {
  if (reason === "skipped") {
    return {
      thisRun: `skipped (${stopReason ?? "no stopReason"})`,
      alarm: stopReason === null || !SIZING_STOP_REASONS.has(stopReason),
    };
  }
  return { thisRun: reason, alarm: !STALE_WARN_REASONS.has(reason) };
}

/**
 * Whether a full run's {@link SyncSummary.staleSources} is an alarm (spec 01a D27): then the
 * scheduled and in-process full tasks fail, so the Trigger run alerts. This app judges each stale
 * source ({@link judgeStaleSource}) and says how many alarm (`staleSourcesAlarming`). A summary
 * without that count (an app before the per-source rule, read by a newer task) is judged
 * crawl-wide, as before: a stale source AND a crawl that was not complete or had failed sources.
 * Takes the route's parsed summary too.
 */
export function staleSourcesAlarm(
  summary: Partial<Pick<SyncSummary, "mode" | "staleSources" | "staleSourcesAlarming" | "complete" | "sourcesFailed">>,
): boolean {
  if (summary.mode !== "full" || !Array.isArray(summary.staleSources) || summary.staleSources.length === 0) {
    return false;
  }
  const alarming = summary.staleSourcesAlarming;
  if (typeof alarming === "number" && Number.isInteger(alarming) && alarming >= 0) return alarming > 0;
  return summary.complete !== true || (typeof summary.sourcesFailed === "number" && summary.sourcesFailed > 0);
}

/** What to do about a warning-only stale source, by its verdict. */
function warnHint(thisRun: string): string {
  if (thisRun.startsWith("skipped")) {
    return `${thisRun}: a sizing bound cut the crawl before it (size Ever Jobs' EVER_JOBS_MAX_JOBS_PER_SEARCH or lower JOBS_SYNC_FULL_RESULTS_PER_SOURCE)`;
  }
  if (thisRun === "keyword_required") return "keyword_required: list mode does not query it; only keyword runs refresh it";
  if (thisRun === "results_wanted") return "results_wanted: it delivered jobs; check the run's invalid rows and its site name";
  if (thisRun === "not_listed") {
    return "not_listed: Ever Jobs reported no problem with it (no longer listed upstream, or it ran clean without its old postings)";
  }
  return `${thisRun}: no per-source report, and the crawl was complete with no failed source (no longer listed upstream?)`;
}

/** The stale sources of a full run (spec 01a D27): an error with {@link staleSourcesAlarm}, else a warning. */
export function formatStaleSourcesLine(
  s: Partial<
    Pick<
      SyncSummary,
      | "mode"
      | "staleSources"
      | "staleSourcesTotal"
      | "staleSourcesAlarming"
      | "complete"
      | "stopReason"
      | "sourcesSkipped"
      | "sourcesFailed"
    >
  >,
): string {
  const stale: Array<Partial<JudgedStaleSource>> = Array.isArray(s.staleSources) ? s.staleSources : [];
  const total =
    typeof s.staleSourcesTotal === "number" && s.staleSourcesTotal > stale.length ? s.staleSourcesTotal : stale.length;
  const list = stale
    .map((x) => {
      const verdict = typeof x?.thisRun === "string" ? `, this run: ${x.thisRun}${x.alarm === true ? " [alarm]" : ""}` : "";
      return `${String(x?.site)} (last seen ${String(x?.lastSeen)}, ${String(x?.rows)} rows${verdict})`;
    })
    .join(", ");
  const shown = total > stale.length ? ` (the first ${stale.length} listed)` : "";
  const head = `[jobs-sync] full sync: ${total} source(s) not seen for ${STALE_SOURCE_DAYS}+ days${shown}: ${list}`;
  const judged = stale.filter((x) => typeof x?.thisRun === "string");
  if (staleSourcesAlarm(s)) {
    const perSource = judged.some((x) => x.alarm === true && x.thisRun !== "unknown");
    if (perSource) {
      return (
        `${head}; ${s.staleSourcesAlarming} of them were not crawled this run for a reason that points at breakage` +
        ` (a failure, a partial list, or a skip by a bound other than the job ceiling): their postings are not` +
        ` refreshed and the 90-day cleanup will delete them; fix those sources, or raise Ever Jobs' fan-out deadline` +
        ` for deadline skips (spec 01a D19/D27)`
      );
    }
    return (
      `${head}; this crawl did not cover every source (stopReason=${s.stopReason ?? "not_reported"}` +
      ` sourcesSkipped=${s.sourcesSkipped ?? 0} sourcesFailed=${s.sourcesFailed ?? 0}): their postings are not` +
      ` refreshed and the 90-day cleanup will delete them; raise Ever Jobs' fan-out deadline or fix the failing sources (spec 01a D19/D27)`
    );
  }
  if (judged.length === 0 || judged.every((x) => x.thisRun === "unknown")) {
    return `${head}; the crawl was complete, so Ever Jobs no longer lists them (removed or renamed upstream?): their rows age out with the 90-day cleanup`;
  }
  const hints = [...new Set(judged.map((x) => warnHint(String(x.thisRun))))];
  return `${head}; none of them points at breakage this run (${hints.join("; ")}): their rows age out with the 90-day cleanup`;
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
    ` sourcesPartial=${s.sourcesPartial ?? 0}` +
    (s.problemSourcesTotal !== undefined ? ` problemSources=${s.problemSourcesTotal}` : "") +
    (s.incompleteStreak !== undefined ? ` incompleteStreak=${s.incompleteStreak}` : "") +
    (s.staleSources !== undefined ? ` staleSources=${s.staleSourcesTotal ?? s.staleSources.length}` : "") +
    (s.staleSourcesAlarming !== undefined ? ` staleSourcesAlarming=${s.staleSourcesAlarming}` : "") +
    (s.skipped ? ` skipped=true` : "")
  );
}
