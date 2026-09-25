import type { ScraperInput, JobSearchResponse } from "./types";
import { getLongTimeoutDispatcher } from "./dispatcher";
import {
  emptyStreamStats,
  isNdjsonContentType,
  iterateSearchResponse,
  TruncatedStreamError,
  type JobStreamEvent,
  type JobStreamStats,
} from "./stream";

export type {
  ScraperInput,
  JobPostDto,
  JobSearchResponse,
  CareerLevel,
  CareerLevelName,
  SiteCategory,
} from "./types";
export {
  ScraperInputSchema,
  JobPostSchema,
  parseJobPost,
  SITE_CATEGORIES,
  CAREER_LEVELS,
} from "./types";
export {
  readNdjsonLines,
  parseNdjsonObject,
  NdjsonLineTooLongError,
  DEFAULT_MAX_NDJSON_LINE_LENGTH,
} from "./ndjson";
export {
  TruncatedStreamError,
  iterateSearchResponse,
  isNdjsonContentType,
  emptyStreamStats,
} from "./stream";
export type { JobStreamEnd, JobStreamEvent, JobStreamStats, TruncationReason } from "./stream";
export { createLongTimeoutDispatcher, getLongTimeoutDispatcher } from "./dispatcher";

const API_URL = process.env.EVER_JOBS_API_URL ?? "https://api.everjobs.ai";
const API_KEY = process.env.EVER_JOBS_API_KEY;
// Ever Jobs aggregates 160+ company/ATS sources per search, which routinely takes ~60s+.
// This client is only used by the background sync (runtime search reads Hust's own DB), so a
// generous timeout is safe and necessary to avoid spurious sync timeouts.
// Full multi-source scrapes take ~130s+; 120s aborted mid-search (0 jobs ingested).
// Default 5 min, overridable via EVER_JOBS_FETCH_TIMEOUT_MS. Stays within the Trigger task maxDuration (600s).
const DEFAULT_FETCH_TIMEOUT_MS = Number(process.env.EVER_JOBS_FETCH_TIMEOUT_MS) || 300_000;

// Streaming searches (contract v1 C3) run far longer than a paginated call — a keyword-less full
// sync fans out to every source — but stay alive with heartbeat lines. Separate, long overall
// timeout; default 30 min, overridable via EVER_JOBS_STREAM_TIMEOUT_MS.
export const DEFAULT_STREAM_TIMEOUT_MS = Number(process.env.EVER_JOBS_STREAM_TIMEOUT_MS) || 30 * 60_000;

/**
 * Whether to opt into the per-job corpus signals (spec #4 liveness / #7 legitimacy). OFF by
 * default: liveness makes the server probe every returned posting, which multiplies outbound
 * requests. Ops opt in with EVER_JOBS_REQUEST_SIGNALS=true; a per-call `signals` value wins.
 */
export function requestSignalsEnabled(explicit?: boolean): boolean {
  if (explicit !== undefined) return explicit;
  return (process.env.EVER_JOBS_REQUEST_SIGNALS ?? "").trim().toLowerCase() === "true";
}

/**
 * Normalise a search input for the wire: a blank / whitespace-only `searchTerm` is dropped so the
 * request is list mode (contract v1 C1) and never carries a literal empty keyword; an empty
 * `siteCategories` list is dropped (it would otherwise select nothing).
 */
export function toWireSearchInput(input: ScraperInput): Record<string, unknown> {
  const body: Record<string, unknown> = { ...input };
  if (typeof input.searchTerm !== "string" || input.searchTerm.trim().length === 0) {
    delete body.searchTerm;
  } else {
    body.searchTerm = input.searchTerm.trim();
  }
  if (!input.siteCategories || input.siteCategories.length === 0) delete body.siteCategories;
  if (!input.careerLevels || input.careerLevels.length === 0) delete body.careerLevels;
  return body;
}

/**
 * Page size requested for the legacy fallback (the largest page a pre-contract server serves).
 * A contract-v1 server ignores pagination in NDJSON mode and streams every job.
 */
export const LEGACY_FALLBACK_PAGE_SIZE = 100;

/** Options for {@link EverJobsClient.openSearchStream}. */
export interface SearchStreamOptions {
  /** Opt into liveness/legitimacy (default: {@link requestSignalsEnabled}). */
  signals?: boolean;
  /**
   * Let Ever Jobs merge cross-source duplicates before streaming (`dedup=true`). Default **false**,
   * always sent explicitly: the producer's default hybrid dedup also merges DIFFERENT postings that
   * share a title (across cities or employment types) and drops them, e.g. one employer's 30
   * postings came back as 20 and a New York new-grad role was merged into a Hong Kong internship.
   * Every job still carries its `dedupKey` (company | title | location), and the sync dedupes by
   * that key itself, within a run and across runs (spec 01a D22).
   */
  dedup?: boolean;
  /** Overall timeout for the whole stream (default EVER_JOBS_STREAM_TIMEOUT_MS / 30 min). */
  timeoutMs?: number;
  /** Caller cancellation. */
  signal?: AbortSignal;
  /**
   * Undici dispatcher for the request. Default: a long-timeout Agent (see dispatcher.ts);
   * pass `null` to use the global dispatcher.
   */
  dispatcher?: unknown | null;
}

/** An opened streaming search: iterate it for events. Always iterate to completion or call `close()`. */
export interface OpenedJobStream extends AsyncIterable<JobStreamEvent> {
  /** The server answered a single JSON document (predates the NDJSON contract). */
  readonly legacy: boolean;
  readonly status: number;
  readonly stats: JobStreamStats;
  /** Abort the request and release the connection. Idempotent. */
  close(): void;
}

/** Typed error carrying the HTTP status code — used by withRetry to skip retries on 4xx. */
class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ---------------------------------------------------------------------------
// Circuit Breaker
// ---------------------------------------------------------------------------

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  state: "closed" | "open" | "half-open";
}

const DEFAULT_FAILURE_THRESHOLD = 5;
/** Retry policy of the stream open: none (see {@link EverJobsClient.openSearchStream}). */
const NO_RETRY = { maxRetries: 0, baseDelayMs: 0 } as const;
const DEFAULT_RESET_TIMEOUT_MS = 60_000; // 1 minute

// ---------------------------------------------------------------------------
// Retry with exponential backoff
// ---------------------------------------------------------------------------

async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries: number; baseDelayMs: number }
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on 4xx client errors (except 429 rate limit)
      if (
        lastError instanceof ApiError &&
        lastError.status >= 400 &&
        lastError.status < 500 &&
        lastError.status !== 429
      ) {
        throw lastError;
      }

      if (attempt < options.maxRetries) {
        // Exponential backoff with jitter
        const delay =
          options.baseDelayMs * Math.pow(2, attempt) +
          Math.random() * options.baseDelayMs;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError ?? new Error("Max retries exceeded");
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class EverJobsClient {
  private baseUrl: string;
  private apiKey?: string;
  private circuit: CircuitBreakerState;
  private failureThreshold: number;
  private resetTimeoutMs: number;

  private fetchTimeoutMs: number;

  constructor(
    baseUrl?: string,
    apiKey?: string,
    options?: { failureThreshold?: number; resetTimeoutMs?: number; fetchTimeoutMs?: number }
  ) {
    this.baseUrl = baseUrl ?? API_URL;
    this.apiKey = apiKey ?? API_KEY;
    this.failureThreshold =
      options?.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.resetTimeoutMs = options?.resetTimeoutMs ?? DEFAULT_RESET_TIMEOUT_MS;
    this.fetchTimeoutMs = options?.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
    this.circuit = { failures: 0, lastFailure: 0, state: "closed" };
  }

  /**
   * Check circuit breaker state before making a request.
   * Throws if the circuit is open.
   */
  private checkCircuit(): void {
    if (this.circuit.state === "open") {
      const elapsed = Date.now() - this.circuit.lastFailure;
      if (elapsed > this.resetTimeoutMs) {
        // Transition to half-open: allow one test request
        this.circuit.state = "half-open";
      } else {
        throw new Error(
          `Circuit breaker OPEN: Ever Jobs API is unavailable. ` +
            `Retry in ${Math.ceil((this.resetTimeoutMs - elapsed) / 1000)}s.`
        );
      }
    }
  }

  /** Record a successful response — reset the circuit breaker. */
  private onSuccess(): void {
    this.circuit = { failures: 0, lastFailure: 0, state: "closed" };
  }

  /** Record a failure — potentially trip the circuit breaker. */
  private onFailure(): void {
    this.circuit.failures++;
    this.circuit.lastFailure = Date.now();

    if (this.circuit.failures >= this.failureThreshold) {
      this.circuit.state = "open";
      console.warn(
        `[EverJobsClient] Circuit breaker OPEN after ${this.circuit.failures} failures. ` +
          `Will retry after ${this.resetTimeoutMs / 1000}s.`
      );
    }
  }

  /** Execute a request with circuit breaker + retry logic (default: 2 retries). */
  private async execute<T>(
    fn: () => Promise<T>,
    retry: { maxRetries: number; baseDelayMs: number } = { maxRetries: 2, baseDelayMs: 500 },
  ): Promise<T> {
    this.checkCircuit();

    try {
      const result = await withRetry(fn, retry);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  async searchJobs(
    input: ScraperInput,
    options?: { page?: number; pageSize?: number; signals?: boolean }
  ): Promise<JobSearchResponse> {
    return this.execute(async () => {
      const params = new URLSearchParams({
        paginate: "true",
        page: String(options?.page ?? 1),
        page_size: String(options?.pageSize ?? 25),
      });

      // Opt into the Ever Jobs corpus signals (spec #4 liveness / #7 legitimacy).
      // OFF by default (liveness probes every returned posting upstream); enable
      // globally with EVER_JOBS_REQUEST_SIGNALS=true or per call with `signals`.
      if (requestSignalsEnabled(options?.signals)) {
        params.set("liveness", "true");
        params.set("legitimacy", "true");
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.fetchTimeoutMs);

      let response: Response;
      try {
        response = await fetch(
          `${this.baseUrl}/api/jobs/search?${params}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(this.apiKey ? { "x-api-key": this.apiKey } : {}),
            },
            body: JSON.stringify(toWireSearchInput(input)),
            signal: controller.signal,
          }
        );
      } catch (error) {
        clearTimeout(timeout);
        if (error instanceof Error && error.name === "AbortError") {
          throw new ApiError(408, "Ever Jobs API request timed out");
        }
        throw error;
      }
      clearTimeout(timeout);

      if (!response.ok) {
        throw new ApiError(
          response.status,
          `Ever Jobs API error: ${response.status} ${response.statusText}`
        );
      }

      try {
        return (await response.json()) as JobSearchResponse;
      } catch {
        throw new ApiError(502, "Ever Jobs API returned invalid JSON");
      }
    });
  }

  /**
   * Open a streaming search (`POST /api/jobs/search?format=ndjson`, contract v1 C3).
   *
   * Resolves once the response headers arrived with a 2xx status. The open phase goes through the
   * circuit breaker but is NEVER retried: every attempt is a whole upstream fan-out (and a server
   * that predates the contract only answers after its entire scrape), so a failed open is reported
   * to the caller and the next scheduled run is the retry (spec 01a D7). The returned stream yields
   * {@link JobStreamEvent}s; it throws {@link TruncatedStreamError} when the server's `end` line
   * is missing, on an `error` line, or when the overall timeout aborts it. A server that predates
   * the contract answers `application/json`; that body (an array or `{ jobs }`) is adapted into
   * the same events, ending with `{ type: "end", legacy: true }`.
   *
   * Pagination does not apply to the stream: every job the server finds is yielded. (A
   * pre-contract server is asked for one bounded page instead — see
   * {@link LEGACY_FALLBACK_PAGE_SIZE}.)
   */
  async openSearchStream(
    input: ScraperInput,
    options?: SearchStreamOptions,
  ): Promise<OpenedJobStream> {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS;
    const dispatcher =
      options?.dispatcher === null
        ? undefined
        : (options?.dispatcher ?? getLongTimeoutDispatcher(timeoutMs));

    // Pagination is ignored in NDJSON mode (contract v1 C3). The params are only for a server that
    // predates the contract: it would otherwise answer the WHOLE fan-out (tens of thousands of
    // jobs, hundreds of MB) as one JSON document; with them it answers a bounded first page.
    const params = new URLSearchParams({
      format: "ndjson",
      paginate: "true",
      page: "1",
      page_size: String(LEGACY_FALLBACK_PAGE_SIZE),
      // Explicit either way: the producer's default is to dedup (see SearchStreamOptions.dedup).
      dedup: options?.dedup === true ? "true" : "false",
    });
    if (requestSignalsEnabled(options?.signals)) {
      params.set("liveness", "true");
      params.set("legitimacy", "true");
    }
    const url = `${this.baseUrl}/api/jobs/search?${params}`;
    const body = JSON.stringify(toWireSearchInput(input));

    // One controller spans open + body, so the overall timeout also bounds a stalled stream.
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onCallerAbort = () => controller.abort();
    if (options?.signal) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener("abort", onCallerAbort, { once: true });
    }
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      options?.signal?.removeEventListener("abort", onCallerAbort);
      if (!controller.signal.aborted) controller.abort();
    };

    let response: Response;
    try {
      response = await this.execute(async () => {
        let res: Response;
        try {
          res = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/x-ndjson, application/json;q=0.9",
              ...(this.apiKey ? { "x-api-key": this.apiKey } : {}),
            },
            body,
            signal: controller.signal,
            ...(dispatcher ? { dispatcher } : {}),
          } as RequestInit);
        } catch (error) {
          if (controller.signal.aborted) {
            throw new ApiError(
              408,
              timedOut
                ? "Ever Jobs stream request timed out before the response started"
                : "Ever Jobs stream request aborted",
            );
          }
          throw error;
        }
        if (!res.ok) {
          // Release the connection.
          await res.body?.cancel().catch(() => undefined);
          throw new ApiError(res.status, `Ever Jobs API error: ${res.status} ${res.statusText}`);
        }
        return res;
      }, NO_RETRY);
    } catch (error) {
      close();
      throw error;
    }

    const stats = emptyStreamStats();
    const legacy = !isNdjsonContentType(response.headers.get("content-type"));
    const onTruncated = () => this.onFailure();
    const opened = response;

    return {
      legacy,
      status: opened.status,
      stats,
      close,
      [Symbol.asyncIterator]: async function* () {
        try {
          yield* iterateSearchResponse(opened, stats, () => controller.signal.aborted);
        } catch (error) {
          if (error instanceof TruncatedStreamError) onTruncated();
          throw error;
        } finally {
          close();
        }
      },
    };
  }

  /**
   * Convenience wrapper: open a streaming search and yield its events.
   * See {@link openSearchStream} for the error contract.
   */
  async *streamSearchJobs(
    input: ScraperInput,
    options?: SearchStreamOptions,
  ): AsyncGenerator<JobStreamEvent> {
    const stream = await this.openSearchStream(input, options);
    yield* stream;
  }

  async analyzeJobs(input: ScraperInput): Promise<unknown> {
    return this.execute(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.fetchTimeoutMs);

      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}/api/jobs/analyze`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(this.apiKey ? { "x-api-key": this.apiKey } : {}),
          },
          body: JSON.stringify(input),
          signal: controller.signal,
        });
      } catch (error) {
        clearTimeout(timeout);
        if (error instanceof Error && error.name === "AbortError") {
          throw new ApiError(408, "Ever Jobs API request timed out");
        }
        throw error;
      }
      clearTimeout(timeout);

      if (!response.ok) {
        throw new ApiError(
          response.status,
          `Ever Jobs API error: ${response.status} ${response.statusText}`
        );
      }

      try {
        return await response.json();
      } catch {
        throw new ApiError(502, "Ever Jobs API returned invalid JSON");
      }
    });
  }

  /** Get the current circuit breaker state (useful for health checks). */
  getCircuitState(): CircuitBreakerState["state"] {
    return this.circuit.state;
  }
}

export const everJobsClient = new EverJobsClient();

export { ApiError as EverJobsApiError };
