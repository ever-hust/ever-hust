import type { ScraperInput, JobSearchResponse } from "./types";

export type { ScraperInput, JobPostDto, JobSearchResponse } from "./types";

const API_URL = process.env.EVER_JOBS_API_URL ?? "https://api.everjobs.ai";
const API_KEY = process.env.EVER_JOBS_API_KEY;
// Ever Jobs aggregates 160+ company/ATS sources per search, which routinely takes ~60s+.
// This client is only used by the background sync (runtime search reads Hust's own DB), so a
// generous timeout is safe and necessary to avoid spurious sync timeouts.
const DEFAULT_FETCH_TIMEOUT_MS = 120_000; // 120 seconds

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

  /** Execute a request with circuit breaker + retry logic. */
  private async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.checkCircuit();

    try {
      const result = await withRetry(fn, {
        maxRetries: 2,
        baseDelayMs: 500,
      });
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
      // On by default; the server treats unknown flags as no-ops, so this stays
      // forward-compatible against an API that hasn't deployed the feature yet.
      // Ops can disable globally with EVER_JOBS_REQUEST_SIGNALS=false.
      const wantSignals =
        options?.signals ?? process.env.EVER_JOBS_REQUEST_SIGNALS !== "false";
      if (wantSignals) {
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
            body: JSON.stringify(input),
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
