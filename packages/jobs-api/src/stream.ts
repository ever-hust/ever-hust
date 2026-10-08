import { parseNdjsonObject, readNdjsonLines } from "./ndjson";
import { parseJobPost, type JobPostDto } from "./types";

/**
 * Events yielded by a streaming job search (Ever Jobs contract v1 C3).
 *
 * - `progress` — heartbeat while the server is still scraping (numbers are optional).
 * - `job`      — one validated job, in server order.
 * - `invalid`  — a job line that failed validation or a malformed line; skipped, count it.
 * - `end`      — the server's terminal line. `legacy: true` means the server predates the
 *                contract and answered one JSON document, which was adapted into this sequence.
 *                The crawl-completeness fields are additive on the producer side: see
 *                {@link JobStreamEnd}.
 */
export type JobStreamEvent =
  | { type: "progress"; sourcesDone?: number; sourcesTotal?: number; jobs?: number }
  | { type: "job"; job: JobPostDto }
  | { type: "invalid"; reason: string }
  | JobStreamEnd;

/**
 * The terminal `end` line. Besides the totals, a producer that reports crawl completeness sends:
 *
 * - `complete` — `true` only when every selected source was started and allowed to finish.
 *   `false` when the producer's fan-out deadline or its job ceiling left sources unscraped, so a
 *   job missing from the result may still be open. **Absent (an older producer, or the legacy JSON
 *   fallback) means "not known complete"**, never "complete": only `complete === true` is.
 * - `stopReason` — why the fan-out stopped early (`"deadline"`, `"job_ceiling"`, or a newer
 *   producer's reason, kept verbatim), `null` when complete.
 * - `sourcesSkipped` — selected sources that contributed nothing because the fan-out stopped.
 * - `sourcesFailed` — sources that ran and failed on their own (not a completeness signal).
 *
 * And, per source (Ever Jobs Spec 1721 FR-20/FR-21, additive too):
 *
 * - `sourcesPartial` — sources that returned some jobs and then failed (`partial`).
 * - `problemSources` — every selected source whose result must not be read as "its whole list",
 *   `{ site, reason }` in fan-out order: a failure reason (`blocked`, `fetch_error`, `timeout`, …),
 *   `partial`, `skipped` (a bound left it unstarted or abandoned it), `results_wanted` (it returned
 *   at least `resultsWanted` jobs, so its list was probably cut there) or `keyword_required` (list
 *   mode does not query it). A selected source NOT listed ran to the end, did not fail and was not
 *   cut — but only when the list is whole: see `problemSourcesTotal`. Kept only when it is an
 *   array of well-typed entries; one ill-typed entry drops the whole field (a list with a hole
 *   would make a problem source look clean), never coerced.
 * - `problemSourcesTotal` — how many sources qualified before the producer's cap. Larger than
 *   `problemSources.length` (or absent) ⇔ the list is truncated, and then no unlisted source may
 *   be assumed clean.
 */
export interface JobStreamEnd {
  type: "end";
  total?: number;
  deduped?: boolean;
  durationMs?: number;
  legacy: boolean;
  complete?: boolean;
  stopReason?: string | null;
  sourcesSkipped?: number;
  sourcesFailed?: number;
  sourcesPartial?: number;
  problemSources?: ProblemSource[];
  problemSourcesTotal?: number;
}

/** One entry of {@link JobStreamEnd.problemSources}: a source and why its list is not whole. */
export interface ProblemSource {
  /** The source as the producer names it (trimmed, case kept). */
  site: string;
  /** The producer's reason, kept verbatim (trimmed): a newer producer may add reasons. */
  reason: string;
}

/**
 * Most `problemSources` entries the client keeps from one end line. The producer caps its list at
 * 2 500 (its whole catalogue fits, Spec 1721 FR-21); a longer list is cut here, which makes it
 * read as truncated (`problemSourcesTotal` > length), never as "the rest are clean".
 */
export const MAX_PROBLEM_SOURCES_PARSED = 5000;

export type TruncationReason = "missing_end" | "error_line" | "aborted" | "read_failed";

/**
 * The stream did not complete: no `end` line (connection dropped / server crashed), an explicit
 * `{"type":"error"}` line, the request was aborted (timeout), or the body could not be read.
 * Consumers must treat the result as failed; jobs yielded before the error are still valid.
 */
export class TruncatedStreamError extends Error {
  constructor(
    public readonly reason: TruncationReason,
    message: string,
    /** Job lines received (valid + invalid) before the stream broke. */
    public readonly received: number,
  ) {
    super(message);
    this.name = "TruncatedStreamError";
  }
}

export interface JobStreamStats {
  /** Non-blank lines read (NDJSON) or 1 for a legacy JSON document. */
  lines: number;
  /** Job lines / array entries received (valid + invalid). */
  received: number;
  jobs: number;
  invalid: number;
  /** Lines of an unknown `type` — ignored for forward compatibility. */
  unknown: number;
  progress: number;
}

export function emptyStreamStats(): JobStreamStats {
  return { lines: 0, received: 0, jobs: 0, invalid: 0, unknown: 0, progress: 0 };
}

const NDJSON_TYPES = ["application/x-ndjson", "application/ndjson", "application/jsonl"];

/** True when the response is the NDJSON stream rather than a legacy JSON document. */
export function isNdjsonContentType(contentType: string | null | undefined): boolean {
  const ct = (contentType ?? "").toLowerCase();
  return NDJSON_TYPES.some((t) => ct.includes(t));
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** A non-negative integer count, else undefined. */
function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

/**
 * The end line's `problemSources` (Spec 1721 FR-20): an array of `{ site, reason }` with
 * non-blank strings, else undefined — one ill-typed entry drops the whole list (see
 * {@link JobStreamEnd.problemSources}). Longer than {@link MAX_PROBLEM_SOURCES_PARSED}: cut there.
 */
export function parseProblemSources(value: unknown): ProblemSource[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: ProblemSource[] = [];
  for (const entry of value.slice(0, MAX_PROBLEM_SOURCES_PARSED)) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return undefined;
    const { site, reason } = entry as { site?: unknown; reason?: unknown };
    if (typeof site !== "string" || typeof reason !== "string") return undefined;
    const s = site.trim();
    const r = reason.trim();
    if (s === "" || r === "") return undefined;
    out.push({ site: s, reason: r });
  }
  return out;
}

/**
 * Turn an opened search response into {@link JobStreamEvent}s.
 *
 * `isAborted` lets the caller distinguish its own timeout/abort from a server-side truncation.
 */
export async function* iterateSearchResponse(
  response: Response,
  stats: JobStreamStats,
  isAborted: () => boolean = () => false,
): AsyncGenerator<JobStreamEvent> {
  if (!isNdjsonContentType(response.headers.get("content-type"))) {
    yield* iterateLegacyJson(response, stats, isAborted);
    return;
  }
  if (!response.body) {
    throw new TruncatedStreamError("read_failed", "Ever Jobs stream has no body", 0);
  }

  try {
    for await (const line of readNdjsonLines(response.body)) {
      stats.lines++;
      const obj = parseNdjsonObject(line);
      if (!obj) {
        // A corrupted line is most likely a corrupted job — count it, keep going.
        stats.received++;
        stats.invalid++;
        yield { type: "invalid", reason: "malformed NDJSON line" };
        continue;
      }
      switch (obj.type) {
        case "job": {
          stats.received++;
          const parsed = parseJobPost(obj.data);
          if (parsed.ok) {
            stats.jobs++;
            yield { type: "job", job: parsed.job };
          } else {
            stats.invalid++;
            yield { type: "invalid", reason: parsed.reason };
          }
          break;
        }
        case "progress":
          stats.progress++;
          yield {
            type: "progress",
            sourcesDone: num(obj.sourcesDone),
            sourcesTotal: num(obj.sourcesTotal),
            jobs: num(obj.jobs),
          };
          break;
        case "end":
          yield {
            type: "end",
            total: num(obj.total),
            deduped: typeof obj.deduped === "boolean" ? obj.deduped : undefined,
            durationMs: num(obj.durationMs),
            legacy: false,
            // Crawl completeness (additive): kept only when well-typed; absent = not known complete.
            complete: typeof obj.complete === "boolean" ? obj.complete : undefined,
            stopReason:
              typeof obj.stopReason === "string" ? obj.stopReason : obj.stopReason === null ? null : undefined,
            sourcesSkipped: count(obj.sourcesSkipped),
            sourcesFailed: count(obj.sourcesFailed),
            // Per source (additive, Spec 1721 FR-20); absent from a producer before FR-20.
            sourcesPartial: count(obj.sourcesPartial),
            problemSources: parseProblemSources(obj.problemSources),
            problemSourcesTotal: count(obj.problemSourcesTotal),
          };
          // The end line is terminal: stop reading (returning cancels the body).
          return;
        case "error":
          throw new TruncatedStreamError(
            "error_line",
            `Ever Jobs stream error: ${typeof obj.message === "string" ? obj.message : "unknown error"}`,
            stats.received,
          );
        default:
          stats.unknown++;
      }
    }
  } catch (error) {
    if (error instanceof TruncatedStreamError) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new TruncatedStreamError(
      isAborted() ? "aborted" : "read_failed",
      isAborted()
        ? `Ever Jobs stream aborted after ${stats.received} jobs: ${detail}`
        : `Ever Jobs stream read failed after ${stats.received} jobs: ${detail}`,
      stats.received,
    );
  }

  throw new TruncatedStreamError(
    "missing_end",
    `Ever Jobs stream ended without an end line after ${stats.received} jobs`,
    stats.received,
  );
}

/**
 * Graceful fallback for a server that predates the NDJSON contract: it ignores `format=ndjson`
 * and answers one JSON document — either an array of jobs or `{ jobs: [...] }` (the client asks
 * such a server for a bounded first page; see `LEGACY_FALLBACK_PAGE_SIZE`).
 */
async function* iterateLegacyJson(
  response: Response,
  stats: JobStreamStats,
  isAborted: () => boolean,
): AsyncGenerator<JobStreamEvent> {
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new TruncatedStreamError(
      isAborted() ? "aborted" : "read_failed",
      `Ever Jobs returned an unreadable JSON body: ${detail}`,
      0,
    );
  }
  stats.lines++;

  const list: unknown[] | undefined = Array.isArray(body)
    ? body
    : body !== null && typeof body === "object" && Array.isArray((body as { jobs?: unknown }).jobs)
      ? (body as { jobs: unknown[] }).jobs
      : undefined;
  if (!list) {
    throw new TruncatedStreamError(
      "read_failed",
      "Ever Jobs returned JSON without a jobs array",
      0,
    );
  }

  for (const entry of list) {
    stats.received++;
    const parsed = parseJobPost(entry);
    if (parsed.ok) {
      stats.jobs++;
      yield { type: "job", job: parsed.job };
    } else {
      stats.invalid++;
      yield { type: "invalid", reason: parsed.reason };
    }
  }

  const deduped = (body as { deduped?: unknown }).deduped;
  // A paginated legacy answer reports the full result size in `count`; surfacing it lets the
  // caller see how much of the upstream result a single page covered.
  const fullCount = (body as { count?: unknown }).count;
  // No completeness fields: a pre-contract answer is one page of a crawl whose completeness the
  // server never reported, so it is "not known complete" (see JobStreamEnd).
  yield {
    type: "end",
    total: typeof fullCount === "number" && Number.isFinite(fullCount) ? fullCount : list.length,
    deduped: typeof deduped === "boolean" ? deduped : undefined,
    legacy: true,
  };
}
