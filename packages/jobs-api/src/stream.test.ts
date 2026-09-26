import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import {
  EverJobsClient,
  EverJobsApiError,
  TruncatedStreamError,
  readNdjsonLines,
  NdjsonLineTooLongError,
  parseJobPost,
  createLongTimeoutDispatcher,
  LEGACY_FALLBACK_PAGE_SIZE,
  type JobStreamEnd,
  type JobStreamEvent,
} from "./index";
import { UNDICI_GLOBAL_DISPATCHER } from "./dispatcher";
import type { ScraperInput } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_URL = "https://test.everjobs.ai";
const enc = new TextEncoder();

function streamOf(chunks: Array<string | Uint8Array>): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === "string" ? enc.encode(chunk) : chunk);
      }
      controller.close();
    },
  });
}

function ndjsonResponse(chunks: Array<string | Uint8Array>, status = 200): Response {
  return new Response(streamOf(chunks), {
    status,
    headers: { "content-type": "application/x-ndjson; charset=utf-8" },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const line = (obj: unknown) => `${JSON.stringify(obj)}\n`;
const job = (id: string, extra: Record<string, unknown> = {}) =>
  line({ type: "job", data: { id, site: "greenhouse", title: `Engineer ${id}`, ...extra } });
const END = line({ type: "end", total: 2, deduped: true, durationMs: 1234 });

async function collectLines(source: ReadableStream<Uint8Array>, max?: number) {
  const out: string[] = [];
  for await (const l of readNdjsonLines(source, max ? { maxLineLength: max } : undefined)) {
    out.push(l);
  }
  return out;
}

async function collect(iter: AsyncIterable<JobStreamEvent>) {
  const events: JobStreamEvent[] = [];
  let error: unknown;
  try {
    for await (const e of iter) events.push(e);
  } catch (err) {
    error = err;
  }
  return { events, error };
}

function createClient() {
  return new EverJobsClient(BASE_URL, "k", { failureThreshold: 5, resetTimeoutMs: 100 });
}

const LIST_INPUT: ScraperInput = {
  distance: 50,
  resultsWanted: 1000,
  country: "USA",
};

let fetchMock: jest.Mock<typeof global.fetch>;
const originalSignals = process.env.EVER_JOBS_REQUEST_SIGNALS;

beforeEach(() => {
  fetchMock = jest.fn<typeof global.fetch>();
  global.fetch = fetchMock;
  delete process.env.EVER_JOBS_REQUEST_SIGNALS;
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  if (originalSignals === undefined) delete process.env.EVER_JOBS_REQUEST_SIGNALS;
  else process.env.EVER_JOBS_REQUEST_SIGNALS = originalSignals;
});

// ---------------------------------------------------------------------------
// readNdjsonLines
// ---------------------------------------------------------------------------

describe("readNdjsonLines", () => {
  it("reassembles a line split across several chunks and splits chunks carrying many lines", async () => {
    const lines = await collectLines(
      streamOf(['{"a":', '1}\n{"b":2}\n{"c"', ":", "3}\n"]),
    );
    expect(lines).toEqual(['{"a":1}', '{"b":2}', '{"c":3}']);
  });

  it("decodes a multi-byte UTF-8 character split across a chunk boundary", async () => {
    const bytes = enc.encode('{"city":"Zürich"}\n');
    const cut = bytes.indexOf(0xc3) + 1; // split inside the 2-byte "ü"
    const lines = await collectLines(streamOf([bytes.slice(0, cut), bytes.slice(cut)]));
    expect(lines).toEqual(['{"city":"Zürich"}']);
  });

  it("accepts CRLF line endings and skips blank / whitespace-only lines", async () => {
    const lines = await collectLines(streamOf(['{"a":1}\r\n\r\n   \n{"b":2}\r', "\n"]));
    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
  });

  it("yields a final line without a trailing newline", async () => {
    const lines = await collectLines(streamOf(['{"a":1}\n{"end":true}']));
    expect(lines).toEqual(['{"a":1}', '{"end":true}']);
  });

  it("rejects a line longer than the configured limit instead of buffering it", async () => {
    await expect(collectLines(streamOf(["x".repeat(50), "y".repeat(60)]), 100)).rejects.toBeInstanceOf(
      NdjsonLineTooLongError,
    );
  });

  it("cancels the underlying stream when the consumer stops early", async () => {
    const cancel = jest.fn<(reason?: unknown) => void>();
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(enc.encode('{"n":1}\n'));
      },
      cancel,
    });
    for await (const l of readNdjsonLines(source)) {
      expect(l).toBe('{"n":1}');
      break;
    }
    expect(cancel).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// parseJobPost (runtime job schema)
// ---------------------------------------------------------------------------

describe("parseJobPost", () => {
  it("requires non-blank id, site and title", () => {
    expect(parseJobPost({ id: "1", site: "s", title: "t" }).ok).toBe(true);
    expect(parseJobPost({ id: "", site: "s", title: "t" }).ok).toBe(false);
    expect(parseJobPost({ id: "1", site: "s", title: "   " }).ok).toBe(false);
    expect(parseJobPost({ site: "s", title: "t" }).ok).toBe(false);
    expect(parseJobPost(null).ok).toBe(false);
    expect(parseJobPost("job").ok).toBe(false);
  });

  it("drops a malformed optional field instead of rejecting the job", () => {
    const parsed = parseJobPost({
      id: "1",
      site: "s",
      title: "t",
      companyName: 42,
      compensation: { minAmount: "lots" },
      jobType: "fulltime",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.job).not.toHaveProperty("companyName");
    expect(parsed.job).not.toHaveProperty("jobType");
    expect(parsed.job.compensation?.minAmount).toBeUndefined();
  });

  it("keeps ids verbatim and preserves unknown fields plus dedupKey / careerLevel", () => {
    const parsed = parseJobPost({
      id: " abc ",
      site: "lever",
      title: "Quant Researcher",
      dedupKey: "k-123",
      careerLevel: { level: "new_grad", confidence: "high", reasons: ["title: new grad"] },
      someFutureField: { nested: true },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.job.id).toBe(" abc ");
    expect(parsed.job.dedupKey).toBe("k-123");
    expect(parsed.job.careerLevel).toEqual({
      level: "new_grad",
      confidence: "high",
      reasons: ["title: new grad"],
    });
    expect((parsed.job as unknown as Record<string, unknown>).someFutureField).toEqual({ nested: true });
  });
});

// ---------------------------------------------------------------------------
// EverJobsClient.openSearchStream — NDJSON
// ---------------------------------------------------------------------------

describe("EverJobsClient.openSearchStream -- NDJSON", () => {
  it("requests format=ndjson in list mode, without signals by default, and yields events in order", async () => {
    fetchMock.mockResolvedValue(
      ndjsonResponse([
        line({ type: "progress", sourcesDone: 1, sourcesTotal: 10, jobs: 0 }),
        job("1"),
        job("2", { dedupKey: "dk-2" }),
        END,
      ]),
    );
    const client = createClient();
    const stream = await client.openSearchStream(
      { ...LIST_INPUT, searchTerm: "  ", siteCategories: ["job-board", "remote"] },
      { dispatcher: null },
    );
    const { events, error } = await collect(stream);

    expect(error).toBeUndefined();
    expect(stream.legacy).toBe(false);
    expect(events.map((e) => e.type)).toEqual(["progress", "job", "job", "end"]);
    expect(events[0]).toEqual({ type: "progress", sourcesDone: 1, sourcesTotal: 10, jobs: 0 });
    const end = events[3] as Extract<JobStreamEvent, { type: "end" }>;
    expect(end).toEqual({ type: "end", total: 2, deduped: true, durationMs: 1234, legacy: false });
    expect(stream.stats).toMatchObject({ received: 2, jobs: 2, invalid: 0, progress: 1 });

    const [url, init] = fetchMock.mock.calls[0]!;
    // Pagination params only bound a pre-contract server; NDJSON mode ignores them (C3).
    expect(String(url)).toBe(
      `${BASE_URL}/api/jobs/search?format=ndjson&paginate=true&page=1&page_size=${LEGACY_FALLBACK_PAGE_SIZE}&dedup=false`,
    );
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).not.toHaveProperty("searchTerm");
    expect(body.siteCategories).toEqual(["job-board", "remote"]);
    expect(body.resultsWanted).toBe(1000);
    expect((init as RequestInit & { dispatcher?: unknown }).dispatcher).toBeUndefined();
  });

  it("reads the crawl-completeness fields of the end line; ill-typed values are dropped, never guessed", async () => {
    const endOf = async (fields: Record<string, unknown>) => {
      fetchMock.mockResolvedValueOnce(ndjsonResponse([job("1"), line({ type: "end", total: 1, ...fields })]));
      const { events, error } = await collect(await createClient().openSearchStream(LIST_INPUT, { dispatcher: null }));
      expect(error).toBeUndefined();
      return events[events.length - 1] as JobStreamEnd;
    };

    expect(await endOf({ complete: false, stopReason: "deadline", sourcesSkipped: 312, sourcesFailed: 7 })).toMatchObject({
      type: "end",
      complete: false,
      stopReason: "deadline",
      sourcesSkipped: 312,
      sourcesFailed: 7,
    });
    const whole = await endOf({ complete: true, stopReason: null, sourcesSkipped: 0, sourcesFailed: 2 });
    expect(whole).toMatchObject({ complete: true, stopReason: null, sourcesSkipped: 0, sourcesFailed: 2 });

    // An older producer: no fields at all → nothing reported (the consumer reads "not known complete").
    const older = await endOf({});
    expect(older.complete).toBeUndefined();
    expect(older.stopReason).toBeUndefined();

    // Ill-typed values are dropped instead of being coerced into a verdict.
    const garbled = await endOf({ complete: "true", stopReason: 42, sourcesSkipped: -1, sourcesFailed: 1.5 });
    expect(garbled.complete).toBeUndefined();
    expect(garbled.stopReason).toBeUndefined();
    expect(garbled.sourcesSkipped).toBeUndefined();
    expect(garbled.sourcesFailed).toBeUndefined();
  });

  it("opts out of the producer's cross-source dedup unless asked (dedup=false, always explicit)", async () => {
    const urlFor = async (options: { dedup?: boolean }) => {
      fetchMock.mockResolvedValueOnce(ndjsonResponse([END]));
      await collect(await createClient().openSearchStream(LIST_INPUT, { dispatcher: null, ...options }));
      return new URL(String(fetchMock.mock.calls.at(-1)![0]));
    };
    expect((await urlFor({})).searchParams.getAll("dedup")).toEqual(["false"]);
    expect((await urlFor({ dedup: false })).searchParams.getAll("dedup")).toEqual(["false"]);
    // Control: the flag is really driven by the option.
    expect((await urlFor({ dedup: true })).searchParams.getAll("dedup")).toEqual(["true"]);
  });

  it("adds liveness + legitimacy only when EVER_JOBS_REQUEST_SIGNALS=true", async () => {
    process.env.EVER_JOBS_REQUEST_SIGNALS = "true";
    fetchMock.mockResolvedValue(ndjsonResponse([END]));
    const stream = await createClient().openSearchStream(LIST_INPUT, { dispatcher: null });
    await collect(stream);
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("format=ndjson");
    expect(url).toContain("liveness=true");
    expect(url).toContain("legitimacy=true");
  });

  it("passes the provided dispatcher through to fetch", async () => {
    const dispatcher = { marker: "long-timeout" };
    fetchMock.mockResolvedValue(ndjsonResponse([END]));
    const stream = await createClient().openSearchStream(LIST_INPUT, { dispatcher });
    await collect(stream);
    const init = fetchMock.mock.calls[0]![1] as RequestInit & { dispatcher?: unknown };
    expect(init.dispatcher).toBe(dispatcher);
  });

  it("throws TruncatedStreamError(missing_end) when the end line is missing, after yielding the jobs", async () => {
    fetchMock.mockResolvedValue(ndjsonResponse([job("1"), job("2")]));
    const { events, error } = await collect(
      await createClient().openSearchStream(LIST_INPUT, { dispatcher: null }),
    );
    expect(events.map((e) => e.type)).toEqual(["job", "job"]);
    expect(error).toBeInstanceOf(TruncatedStreamError);
    expect((error as TruncatedStreamError).reason).toBe("missing_end");
    expect((error as TruncatedStreamError).received).toBe(2);
  });

  it("throws TruncatedStreamError(error_line) on an error line", async () => {
    fetchMock.mockResolvedValue(
      ndjsonResponse([job("1"), line({ type: "error", message: "fan-out crashed" }), END]),
    );
    const { events, error } = await collect(
      await createClient().openSearchStream(LIST_INPUT, { dispatcher: null }),
    );
    expect(events.map((e) => e.type)).toEqual(["job"]);
    expect(error).toBeInstanceOf(TruncatedStreamError);
    expect((error as TruncatedStreamError).reason).toBe("error_line");
    expect((error as TruncatedStreamError).message).toContain("fan-out crashed");
  });

  it("skips and counts invalid job lines and malformed lines, and keeps going", async () => {
    fetchMock.mockResolvedValue(
      ndjsonResponse([
        line({ type: "job", data: { id: "", site: "x", title: "t" } }),
        "{not json\n",
        job("ok"),
        END,
      ]),
    );
    const stream = await createClient().openSearchStream(LIST_INPUT, { dispatcher: null });
    const { events, error } = await collect(stream);
    expect(error).toBeUndefined();
    expect(events.map((e) => e.type)).toEqual(["invalid", "invalid", "job", "end"]);
    expect(stream.stats).toMatchObject({ received: 3, jobs: 1, invalid: 2 });
  });

  it("ignores unknown line types (forward compatibility) and lines after end", async () => {
    fetchMock.mockResolvedValue(
      ndjsonResponse([
        line({ type: "diagnostics", perSource: [] }),
        line({ nope: true }),
        job("1"),
        END,
        job("after-end"),
      ]),
    );
    const stream = await createClient().openSearchStream(LIST_INPUT, { dispatcher: null });
    const { events, error } = await collect(stream);
    expect(error).toBeUndefined();
    expect(events.map((e) => e.type)).toEqual(["job", "end"]);
    expect(stream.stats.unknown).toBe(2);
  });

  it("aborts a stalled stream at the overall timeout with TruncatedStreamError(aborted)", async () => {
    fetchMock.mockImplementation(async (_url, init) => {
      const signal = (init as RequestInit).signal!;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(enc.encode(job("1")));
          signal.addEventListener("abort", () =>
            controller.error(new DOMException("aborted", "AbortError")),
          );
        },
      });
      return new Response(body, { headers: { "content-type": "application/x-ndjson" } });
    });
    const stream = await createClient().openSearchStream(LIST_INPUT, {
      dispatcher: null,
      timeoutMs: 50,
    });
    const { events, error } = await collect(stream);
    expect(events.map((e) => e.type)).toEqual(["job"]);
    expect(error).toBeInstanceOf(TruncatedStreamError);
    expect((error as TruncatedStreamError).reason).toBe("aborted");
  });

  it("never retries a failed stream open: a 5xx is POSTed once (a retry would be a whole new fan-out)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "unavailable" }, 503));
    const error = await createClient()
      .openSearchStream(LIST_INPUT, { dispatcher: null })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EverJobsApiError);
    expect((error as InstanceType<typeof EverJobsApiError>).status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never retries a stream open that failed in transport (connection reset / pod restart)", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(
      createClient().openSearchStream(LIST_INPUT, { dispatcher: null }),
    ).rejects.toThrow("fetch failed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still counts a failed stream open against the circuit breaker", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 503));
    const client = new EverJobsClient(BASE_URL, "k", { failureThreshold: 2, resetTimeoutMs: 60_000 });
    await client.openSearchStream(LIST_INPUT, { dispatcher: null }).catch(() => undefined);
    await client.openSearchStream(LIST_INPUT, { dispatcher: null }).catch(() => undefined);
    expect(client.getCircuitState()).toBe("open");
    await expect(client.openSearchStream(LIST_INPUT, { dispatcher: null })).rejects.toThrow("Circuit breaker OPEN");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects the open with an API error on a non-2xx status (no stream, no retry on 4xx)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "bad category" }, 400));
    await expect(
      createClient().openSearchStream(LIST_INPUT, { dispatcher: null }),
    ).rejects.toBeInstanceOf(EverJobsApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// EverJobsClient.openSearchStream — legacy JSON fallback
// ---------------------------------------------------------------------------

describe("EverJobsClient.openSearchStream -- legacy JSON fallback", () => {
  it("adapts a { jobs } document into job events plus a legacy end", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        count: 3,
        jobs: [
          { id: "1", site: "s", title: "a" },
          { id: "", site: "s", title: "b" },
          { id: "3", site: "s", title: "c" },
        ],
        deduped: true,
      }),
    );
    const stream = await createClient().openSearchStream(LIST_INPUT, { dispatcher: null });
    const { events, error } = await collect(stream);
    expect(error).toBeUndefined();
    expect(stream.legacy).toBe(true);
    expect(events.map((e) => e.type)).toEqual(["job", "invalid", "job", "end"]);
    expect(events[3]).toEqual({ type: "end", total: 3, deduped: true, legacy: true });
  });

  it("reports the server's full result size for a paginated legacy page", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ count: 23456, total_pages: 235, current_page: 1, page_size: 100, jobs: [{ id: "1", site: "s", title: "a" }] }),
    );
    const { events } = await collect(
      await createClient().openSearchStream(LIST_INPUT, { dispatcher: null }),
    );
    expect(events[events.length - 1]).toEqual({ type: "end", total: 23456, legacy: true });
  });

  it("adapts a bare array document", async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ id: "1", site: "s", title: "a" }]));
    const { events } = await collect(
      await createClient().openSearchStream(LIST_INPUT, { dispatcher: null }),
    );
    expect(events.map((e) => e.type)).toEqual(["job", "end"]);
  });

  it("fails as truncated when the JSON has no jobs array", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "nope" }));
    const { events, error } = await collect(
      await createClient().openSearchStream(LIST_INPUT, { dispatcher: null }),
    );
    expect(events).toEqual([]);
    expect(error).toBeInstanceOf(TruncatedStreamError);
    expect((error as TruncatedStreamError).reason).toBe("read_failed");
  });
});

// ---------------------------------------------------------------------------
// streamSearchJobs (async generator convenience)
// ---------------------------------------------------------------------------

describe("EverJobsClient.streamSearchJobs", () => {
  it("opens and yields the same events", async () => {
    fetchMock.mockResolvedValue(ndjsonResponse([job("1"), END]));
    const { events, error } = await collect(
      createClient().streamSearchJobs(LIST_INPUT, { dispatcher: null }),
    );
    expect(error).toBeUndefined();
    expect(events.map((e) => e.type)).toEqual(["job", "end"]);
  });
});

// ---------------------------------------------------------------------------
// Long-timeout dispatcher
// ---------------------------------------------------------------------------

describe("createLongTimeoutDispatcher", () => {
  it("builds an Agent of the runtime's own undici class with raised timeouts", () => {
    class Agent {
      constructor(public readonly options: Record<string, unknown>) {}
    }
    const scope = { [UNDICI_GLOBAL_DISPATCHER]: new Agent({}) } as Record<
      PropertyKey,
      unknown
    >;
    const dispatcher = createLongTimeoutDispatcher(1_800_000, scope) as Agent;
    expect(dispatcher).toBeInstanceOf(Agent);
    expect(dispatcher.options).toEqual({ headersTimeout: 1_800_000, bodyTimeout: 1_800_000 });
  });

  it("returns undefined when the global dispatcher is not a plain Agent (e.g. a proxy agent)", () => {
    class ProxyAgent {}
    const scope = { [UNDICI_GLOBAL_DISPATCHER]: new ProxyAgent() } as Record<
      PropertyKey,
      unknown
    >;
    expect(createLongTimeoutDispatcher(1000, scope)).toBeUndefined();
  });
});
