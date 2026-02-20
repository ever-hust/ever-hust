import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import { EverJobsClient } from "./index";
import type { ScraperInput, JobSearchResponse } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_URL = "https://test.everjobs.ai";
const API_KEY = "test-api-key-12345";

/** Short reset timeout so circuit breaker tests run quickly. */
const RESET_TIMEOUT_MS = 100;

/** Convenience: create a client with short circuit breaker timeouts. */
function createClient(
  overrides?: Partial<{
    baseUrl: string;
    apiKey: string;
    failureThreshold: number;
    resetTimeoutMs: number;
  }>
) {
  return new EverJobsClient(
    overrides?.baseUrl ?? BASE_URL,
    overrides?.apiKey ?? API_KEY,
    {
      failureThreshold: overrides?.failureThreshold ?? 5,
      resetTimeoutMs: overrides?.resetTimeoutMs ?? RESET_TIMEOUT_MS,
    }
  );
}

/** Minimal valid ScraperInput for most tests. */
const SEARCH_INPUT: ScraperInput = {
  searchTerm: "software engineer",
  location: "San Francisco",
  distance: 50,
  resultsWanted: 15,
  country: "USA",
};

/** Minimal valid JobSearchResponse returned by our mock. */
const MOCK_SEARCH_RESPONSE: JobSearchResponse = {
  count: 1,
  total_pages: 1,
  current_page: 1,
  page_size: 25,
  cached: false,
  jobs: [
    {
      id: "job-1",
      site: "linkedin",
      title: "Software Engineer",
      companyName: "Acme Corp",
    },
  ],
};

const MOCK_ANALYZE_RESPONSE = { analysis: "looks great" };

/** Build a mock Response object. */
function mockResponse(
  body: unknown,
  init?: { status?: number; statusText?: string }
): Response {
  const status = init?.status ?? 200;
  const statusText = init?.statusText ?? (status === 200 ? "OK" : "Error");
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(body),
    headers: new Headers(),
    redirected: false,
    type: "basic" as ResponseType,
    url: "",
    clone: () => mockResponse(body, init) as Response,
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(JSON.stringify(body)),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

// Reusable mock responses
const RESP_400 = () => mockResponse(null, { status: 400, statusText: "Bad Request" });
const RESP_404 = () => mockResponse(null, { status: 404, statusText: "Not Found" });
const RESP_429 = () => mockResponse(null, { status: 429, statusText: "Too Many Requests" });
const RESP_500 = () => mockResponse(null, { status: 500, statusText: "Internal Server Error" });
const RESP_OK = () => mockResponse(MOCK_SEARCH_RESPONSE);

// ---------------------------------------------------------------------------
// Mock global.fetch
// ---------------------------------------------------------------------------

let fetchMock: jest.Mock<typeof global.fetch>;

beforeEach(() => {
  fetchMock = jest.fn<typeof global.fetch>();
  global.fetch = fetchMock;
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

// ==========================================================================
// Circuit Breaker Tests
// ==========================================================================
// Use 400 errors to trip the circuit breaker: 4xx errors (non-429) skip retries
// in withRetry, so they fail immediately -- perfect for testing the breaker
// state machine in isolation without dealing with retry delays.

describe("EverJobsClient -- circuit breaker", () => {
  it("starts in closed state", () => {
    const client = createClient();
    expect(client.getCircuitState()).toBe("closed");
  });

  it("stays closed when failures are below the threshold", async () => {
    const client = createClient({ failureThreshold: 5 });
    fetchMock.mockImplementation(() => Promise.resolve(RESP_400()));

    // 4 failures (below threshold of 5)
    for (let i = 0; i < 4; i++) {
      await expect(client.searchJobs(SEARCH_INPUT)).rejects.toThrow(/400/);
    }

    expect(client.getCircuitState()).toBe("closed");
  });

  it("opens after reaching the failure threshold", async () => {
    const client = createClient({ failureThreshold: 5 });
    fetchMock.mockImplementation(() => Promise.resolve(RESP_400()));

    for (let i = 0; i < 5; i++) {
      await expect(client.searchJobs(SEARCH_INPUT)).rejects.toThrow(/400/);
    }

    expect(client.getCircuitState()).toBe("open");
  });

  it("throws in open state without calling fetch", async () => {
    const client = createClient({ failureThreshold: 2 });
    fetchMock.mockImplementation(() => Promise.resolve(RESP_400()));

    // Trip the breaker
    for (let i = 0; i < 2; i++) {
      await expect(client.searchJobs(SEARCH_INPUT)).rejects.toThrow(/400/);
    }
    expect(client.getCircuitState()).toBe("open");

    // Clear the call count after tripping
    fetchMock.mockClear();

    // Further requests should throw without calling fetch
    await expect(client.searchJobs(SEARCH_INPUT)).rejects.toThrow(
      /Circuit breaker OPEN/
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("transitions to half-open after the reset timeout elapses", async () => {
    jest.useFakeTimers();
    const client = createClient({ failureThreshold: 2, resetTimeoutMs: 100 });
    fetchMock.mockImplementation(() => Promise.resolve(RESP_400()));

    // Trip the breaker
    for (let i = 0; i < 2; i++) {
      await expect(client.searchJobs(SEARCH_INPUT)).rejects.toThrow(/400/);
    }
    expect(client.getCircuitState()).toBe("open");

    // Advance past the reset timeout
    jest.advanceTimersByTime(150);

    // Next call should be allowed (half-open). Mock success.
    fetchMock.mockImplementation(() => Promise.resolve(RESP_OK()));

    const result = await client.searchJobs(SEARCH_INPUT);
    expect(result).toEqual(MOCK_SEARCH_RESPONSE);
    // After success in half-open, state is closed
    expect(client.getCircuitState()).toBe("closed");
  });

  it("resets to closed on success during half-open", async () => {
    jest.useFakeTimers();
    const client = createClient({ failureThreshold: 2, resetTimeoutMs: 100 });
    fetchMock.mockImplementation(() => Promise.resolve(RESP_400()));

    // Trip the breaker
    for (let i = 0; i < 2; i++) {
      await expect(client.searchJobs(SEARCH_INPUT)).rejects.toThrow(/400/);
    }
    expect(client.getCircuitState()).toBe("open");

    // Move past the reset timeout
    jest.advanceTimersByTime(150);

    // Mock a successful response for the half-open test request
    fetchMock.mockImplementation(() => Promise.resolve(RESP_OK()));

    await client.searchJobs(SEARCH_INPUT);
    expect(client.getCircuitState()).toBe("closed");
  });

  it("goes back to open on failure during half-open", async () => {
    jest.useFakeTimers();
    const client = createClient({ failureThreshold: 2, resetTimeoutMs: 100 });
    fetchMock.mockImplementation(() => Promise.resolve(RESP_400()));

    // Trip the breaker
    for (let i = 0; i < 2; i++) {
      await expect(client.searchJobs(SEARCH_INPUT)).rejects.toThrow(/400/);
    }
    expect(client.getCircuitState()).toBe("open");

    // Move past the reset timeout -- should transition to half-open on next call
    jest.advanceTimersByTime(150);

    // Fail again during the half-open probe (still 400, no retries)
    await expect(client.searchJobs(SEARCH_INPUT)).rejects.toThrow(/400/);

    expect(client.getCircuitState()).toBe("open");
  });

  it("getCircuitState() returns the correct state throughout the lifecycle", async () => {
    jest.useFakeTimers();
    const client = createClient({ failureThreshold: 2, resetTimeoutMs: 100 });

    // 1. Closed initially
    expect(client.getCircuitState()).toBe("closed");

    // 2. Still closed after one failure
    fetchMock.mockImplementation(() => Promise.resolve(RESP_400()));
    await expect(client.searchJobs(SEARCH_INPUT)).rejects.toThrow(/400/);
    expect(client.getCircuitState()).toBe("closed");

    // 3. Open after second failure (threshold = 2)
    await expect(client.searchJobs(SEARCH_INPUT)).rejects.toThrow(/400/);
    expect(client.getCircuitState()).toBe("open");

    // 4. Advance time and trigger half-open transition via a request
    jest.advanceTimersByTime(150);
    fetchMock.mockImplementation(() => Promise.resolve(RESP_OK()));
    await client.searchJobs(SEARCH_INPUT);

    // 5. After success in half-open, back to closed
    expect(client.getCircuitState()).toBe("closed");
  });
});

// ==========================================================================
// Retry Logic Tests
// ==========================================================================

describe("EverJobsClient -- retry logic", () => {
  it("succeeds on the first attempt without retrying", async () => {
    const client = createClient();
    fetchMock.mockImplementation(() => Promise.resolve(RESP_OK()));

    const result = await client.searchJobs(SEARCH_INPUT);

    expect(result).toEqual(MOCK_SEARCH_RESPONSE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on 500 error and succeeds on retry", async () => {
    jest.useFakeTimers();
    const client = createClient();

    // First call: 500, second call: success
    fetchMock
      .mockImplementationOnce(() => Promise.resolve(RESP_500()))
      .mockImplementationOnce(() => Promise.resolve(RESP_OK()));

    const resultPromise = client.searchJobs(SEARCH_INPUT);

    // Advance timers to satisfy the retry delay
    await jest.advanceTimersByTimeAsync(5000);

    const result = await resultPromise;
    expect(result).toEqual(MOCK_SEARCH_RESPONSE);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on 400 error", async () => {
    const client = createClient();
    fetchMock.mockImplementation(() => Promise.resolve(RESP_400()));

    await expect(client.searchJobs(SEARCH_INPUT)).rejects.toThrow(/400/);

    // Only 1 call -- no retries for 4xx (except 429)
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry on 404 error", async () => {
    const client = createClient();
    fetchMock.mockImplementation(() => Promise.resolve(RESP_404()));

    await expect(client.searchJobs(SEARCH_INPUT)).rejects.toThrow(/404/);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("DOES retry on 429 rate-limit error", async () => {
    jest.useFakeTimers();
    const client = createClient();

    fetchMock
      .mockImplementationOnce(() => Promise.resolve(RESP_429()))
      .mockImplementationOnce(() => Promise.resolve(RESP_OK()));

    const resultPromise = client.searchJobs(SEARCH_INPUT);

    // Advance timers to satisfy the retry delay
    await jest.advanceTimersByTimeAsync(5000);

    const result = await resultPromise;
    expect(result).toEqual(MOCK_SEARCH_RESPONSE);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after max retries (3 attempts total)", async () => {
    // Replace setTimeout to execute callbacks immediately via microtask.
    // This avoids fake-timer + async-retry interaction issues where
    // intermediate rejections get flagged as "unhandled" by Jest.
    const origSetTimeout = globalThis.setTimeout;
    (globalThis as any).setTimeout = (fn: Function) => {
      Promise.resolve().then(() => fn());
      return 0;
    };

    const client = createClient();
    fetchMock.mockImplementation(() => Promise.resolve(RESP_500()));

    await expect(client.searchJobs(SEARCH_INPUT)).rejects.toThrow(/500/);

    // 1 initial + 2 retries = 3 total
    expect(fetchMock).toHaveBeenCalledTimes(3);

    globalThis.setTimeout = origSetTimeout;
  });
});

// ==========================================================================
// API Methods Tests
// ==========================================================================

describe("EverJobsClient -- searchJobs", () => {
  it("sends correct URL, method, headers, and body", async () => {
    const client = createClient();
    fetchMock.mockImplementation(() => Promise.resolve(RESP_OK()));

    await client.searchJobs(SEARCH_INPUT);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0]!;
    const urlStr = String(url);

    // URL must be POST to /api/jobs/search with pagination params
    expect(urlStr).toContain(`${BASE_URL}/api/jobs/search`);
    expect(urlStr).toContain("paginate=true");
    expect(urlStr).toContain("page=1");
    expect(urlStr).toContain("page_size=25");

    // Method
    expect((init as RequestInit).method).toBe("POST");

    // Headers
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["x-api-key"]).toBe(API_KEY);

    // Body
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.searchTerm).toBe("software engineer");
    expect(body.location).toBe("San Francisco");
  });

  it("handles custom pagination params", async () => {
    const client = createClient();
    fetchMock.mockImplementation(() => Promise.resolve(RESP_OK()));

    await client.searchJobs(SEARCH_INPUT, { page: 3, pageSize: 50 });

    const [url] = fetchMock.mock.calls[0]!;
    const urlStr = String(url);

    expect(urlStr).toContain("page=3");
    expect(urlStr).toContain("page_size=50");
  });

  it("uses default pagination when options are omitted", async () => {
    const client = createClient();
    fetchMock.mockImplementation(() => Promise.resolve(RESP_OK()));

    await client.searchJobs(SEARCH_INPUT);

    const [url] = fetchMock.mock.calls[0]!;
    const urlStr = String(url);

    expect(urlStr).toContain("page=1");
    expect(urlStr).toContain("page_size=25");
  });

  it("returns the parsed JSON response", async () => {
    const client = createClient();
    fetchMock.mockImplementation(() => Promise.resolve(RESP_OK()));

    const result = await client.searchJobs(SEARCH_INPUT);

    expect(result).toEqual(MOCK_SEARCH_RESPONSE);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]!.title).toBe("Software Engineer");
  });
});

describe("EverJobsClient -- analyzeJobs", () => {
  it("sends correct URL, method, headers, and body", async () => {
    const client = createClient();
    fetchMock.mockImplementation(() =>
      Promise.resolve(mockResponse(MOCK_ANALYZE_RESPONSE))
    );

    await client.analyzeJobs(SEARCH_INPUT);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0]!;
    const urlStr = String(url);

    expect(urlStr).toBe(`${BASE_URL}/api/jobs/analyze`);
    expect((init as RequestInit).method).toBe("POST");

    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["x-api-key"]).toBe(API_KEY);

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.searchTerm).toBe("software engineer");
  });

  it("returns the parsed JSON response", async () => {
    const client = createClient();
    fetchMock.mockImplementation(() =>
      Promise.resolve(mockResponse(MOCK_ANALYZE_RESPONSE))
    );

    const result = await client.analyzeJobs(SEARCH_INPUT);
    expect(result).toEqual(MOCK_ANALYZE_RESPONSE);
  });
});

describe("EverJobsClient -- API key handling", () => {
  it("includes x-api-key header when apiKey is provided", async () => {
    const client = createClient({ apiKey: "my-secret-key" });
    fetchMock.mockImplementation(() => Promise.resolve(RESP_OK()));

    await client.searchJobs(SEARCH_INPUT);

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("my-secret-key");
  });

  it("omits x-api-key header when apiKey is not provided", async () => {
    // Ensure the env var is not set
    const originalEnvKey = process.env.EVER_JOBS_API_KEY;
    delete process.env.EVER_JOBS_API_KEY;

    // Create client without an API key (pass undefined explicitly)
    const client = new EverJobsClient(BASE_URL, undefined, {
      failureThreshold: 5,
      resetTimeoutMs: RESET_TIMEOUT_MS,
    });

    fetchMock.mockImplementation(() => Promise.resolve(RESP_OK()));

    await client.searchJobs(SEARCH_INPUT);

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["x-api-key"]).toBeUndefined();

    // Restore env
    if (originalEnvKey !== undefined) {
      process.env.EVER_JOBS_API_KEY = originalEnvKey;
    }
  });
});

// ==========================================================================
// Fetch Timeout Tests
// ==========================================================================

describe("EverJobsClient -- fetch timeout", () => {
  it("aborts fetch and throws 408 when the request exceeds the timeout", async () => {
    const client = new EverJobsClient(BASE_URL, API_KEY, {
      failureThreshold: 5,
      resetTimeoutMs: RESET_TIMEOUT_MS,
      fetchTimeoutMs: 50, // Very short timeout for testing
    });

    // Simulate a slow response that never resolves before timeout
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((resolve, reject) => {
          // Listen for abort signal
          const signal = (init as RequestInit)?.signal;
          if (signal) {
            signal.addEventListener("abort", () => {
              const err = new Error("The operation was aborted");
              err.name = "AbortError";
              reject(err);
            });
          }
        })
    );

    await expect(client.searchJobs(SEARCH_INPUT)).rejects.toThrow(
      /timed out/
    );
  });

  it("passes AbortSignal to fetch for searchJobs", async () => {
    const client = createClient();
    fetchMock.mockImplementation(() => Promise.resolve(RESP_OK()));

    await client.searchJobs(SEARCH_INPUT);

    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });

  it("passes AbortSignal to fetch for analyzeJobs", async () => {
    const client = createClient();
    fetchMock.mockImplementation(() =>
      Promise.resolve(mockResponse(MOCK_ANALYZE_RESPONSE))
    );

    await client.analyzeJobs(SEARCH_INPUT);

    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });
});

// ==========================================================================
// Invalid JSON Response Tests
// ==========================================================================

describe("EverJobsClient -- invalid JSON handling", () => {
  /** Build a Response whose .json() rejects (simulating malformed JSON). */
  function mockBadJsonResponse(): Response {
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.reject(new SyntaxError("Unexpected token")),
      headers: new Headers(),
      redirected: false,
      type: "basic" as ResponseType,
      url: "",
      clone: () => mockBadJsonResponse() as Response,
      body: null,
      bodyUsed: false,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      blob: () => Promise.resolve(new Blob()),
      formData: () => Promise.resolve(new FormData()),
      text: () => Promise.resolve("not valid json"),
      bytes: () => Promise.resolve(new Uint8Array()),
    } as Response;
  }

  it("throws 502 when searchJobs gets invalid JSON", async () => {
    const client = createClient();
    fetchMock.mockImplementation(() => Promise.resolve(mockBadJsonResponse()));

    await expect(client.searchJobs(SEARCH_INPUT)).rejects.toThrow(
      /invalid JSON/
    );
  });

  it("throws 502 when analyzeJobs gets invalid JSON", async () => {
    const client = createClient();
    fetchMock.mockImplementation(() => Promise.resolve(mockBadJsonResponse()));

    await expect(client.analyzeJobs(SEARCH_INPUT)).rejects.toThrow(
      /invalid JSON/
    );
  });
});

// ==========================================================================
// Integration: Circuit Breaker + Retry Together
// ==========================================================================

describe("EverJobsClient -- circuit breaker + retry integration", () => {
  it("each failed request (after retries exhausted) counts as one circuit breaker failure", async () => {
    // Replace setTimeout to execute callbacks immediately via microtask.
    const origSetTimeout = globalThis.setTimeout;
    (globalThis as any).setTimeout = (fn: Function) => {
      Promise.resolve().then(() => fn());
      return 0;
    };

    const client = createClient({ failureThreshold: 3 });
    fetchMock.mockImplementation(() => Promise.resolve(RESP_500()));

    // Request 1: 3 fetch attempts (1 + 2 retries), 1 circuit breaker failure
    await expect(client.searchJobs(SEARCH_INPUT)).rejects.toThrow(/500/);

    // Request 2: 3 fetch attempts, 1 circuit breaker failure
    await expect(client.searchJobs(SEARCH_INPUT)).rejects.toThrow(/500/);

    // After 2 failures, circuit should still be closed (threshold is 3)
    expect(client.getCircuitState()).toBe("closed");

    // Request 3: trips the breaker
    await expect(client.searchJobs(SEARCH_INPUT)).rejects.toThrow(/500/);

    expect(client.getCircuitState()).toBe("open");

    // Total fetch calls: 3 requests x 3 attempts = 9
    expect(fetchMock).toHaveBeenCalledTimes(9);

    globalThis.setTimeout = origSetTimeout;
  });

  it("a 4xx error (non-429) fails immediately, still counts as circuit breaker failure", async () => {
    const client = createClient({ failureThreshold: 2 });
    fetchMock.mockImplementation(() => Promise.resolve(RESP_400()));

    // First 400 -- no retry, 1 circuit breaker failure
    await expect(client.searchJobs(SEARCH_INPUT)).rejects.toThrow(/400/);
    expect(client.getCircuitState()).toBe("closed");

    // Second 400 -- trips the breaker
    await expect(client.searchJobs(SEARCH_INPUT)).rejects.toThrow(/400/);
    expect(client.getCircuitState()).toBe("open");

    // Only 1 fetch per request (no retries on 4xx)
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
