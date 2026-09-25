import { describe, it, expect, jest } from "@jest/globals";
import type { JobStreamEvent } from "@ever-hust/jobs-api";
import {
  createDefaultSyncDeps,
  processGeocodeMemo,
  readSyncEnv,
  routeDeadlineMs,
  SyncRunFailedError,
  UpstreamContractTracker,
  runSyncViaRoute,
} from "./ingest";
import { FakeJobStore } from "./ingest/testing/fake-store";
import {
  FULL_SYNC_MAX_DURATION_S,
  KEYWORD_SYNC_MAX_DURATION_S,
  maxDurationFor,
  runInProcessSync,
  runScheduledSync,
} from "./sync-runner";

const enc = new TextEncoder();
const quiet = { info: jest.fn(), warn: jest.fn() };

function ndjson(lines: unknown[], status = 200): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const l of lines) controller.enqueue(enc.encode(`${JSON.stringify(l)}\n`));
      controller.close();
    },
  });
  return new Response(body, {
    status,
    headers: { "content-type": "application/x-ndjson; charset=utf-8" },
  });
}

const OK_SUMMARY = {
  type: "summary",
  ok: true,
  mode: "full",
  terms: [],
  received: 10,
  inserted: 4,
  updated: 1,
  unchanged: 5,
  invalid: 0,
  duplicatesMerged: 0,
  geocodeCalls: 0,
  geocodeReused: 0,
  errors: 0,
  durationMs: 1000,
  truncated: false,
  upstreamFailed: false,
  legacyServer: false,
  upstreamTotal: 10,
  complete: true,
  stopReason: null,
  sourcesSkipped: 0,
  sourcesFailed: 2,
  errorMessages: [],
};

function fetchReturning(res: Response) {
  return jest.fn<typeof fetch>(async () => res);
}

describe("runScheduledSync (what the Trigger schedules run)", () => {
  it("POSTs the route with the mode, secret and identity encoding, and returns the summary", async () => {
    const fetchImpl = fetchReturning(
      ndjson([{ type: "start", mode: "full", terms: [] }, { type: "progress", received: 3 }, OK_SUMMARY]),
    );
    const result = await runScheduledSync("full", {
      baseUrl: "http://hust-web:3000/",
      secret: "s3cret",
      fetchImpl,
      dispatcher: null,
      logger: quiet,
    });
    expect(result).toMatchObject({ ok: true, inserted: 4, unchanged: 5 });
    expect(result).not.toHaveProperty("type");

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe("http://hust-web:3000/api/jobs/sync");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer s3cret");
    expect(headers["Accept-Encoding"]).toBe("identity");
    // The route is told a budget a little shorter than the call's own timeout.
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      mode: "full",
      deadlineMs: FULL_SYNC_MAX_DURATION_S * 1000 - 30_000 - 20_000,
    });
  });

  it("THROWS when the summary says ok:false (so the run is FAILED)", async () => {
    const fetchImpl = fetchReturning(
      ndjson([{ ...OK_SUMMARY, ok: false, truncated: true, errorMessages: ["ended without an end line"] }]),
    );
    const error = await runScheduledSync("keywords", { fetchImpl, dispatcher: null, logger: quiet }).catch((e) => e);
    expect(error).toBeInstanceOf(SyncRunFailedError);
    expect((error as SyncRunFailedError).message).toContain("truncated=true");
    expect((error as SyncRunFailedError).message).toContain("ended without an end line");
    expect((error as SyncRunFailedError).summary).toMatchObject({ ok: false });
  });

  it("THROWS when the route stream ends without a summary line", async () => {
    const fetchImpl = fetchReturning(ndjson([{ type: "start" }, { type: "progress", received: 1 }]));
    await expect(
      runScheduledSync("full", { fetchImpl, dispatcher: null, logger: quiet }),
    ).rejects.toThrow("without a summary line");
  });

  it("THROWS on a non-2xx answer before streaming, carrying the status", async () => {
    const fetchImpl = fetchReturning(
      new Response(JSON.stringify({ type: "summary", ok: false, error: "Ever Jobs unreachable" }), {
        status: 502,
        headers: { "content-type": "application/json" },
      }),
    );
    const error = await runScheduledSync("full", { fetchImpl, dispatcher: null, logger: quiet }).catch((e) => e);
    expect(error).toBeInstanceOf(SyncRunFailedError);
    expect((error as SyncRunFailedError).status).toBe(502);
    expect((error as SyncRunFailedError).message).toContain("Ever Jobs unreachable");
  });

  it("THROWS on a transport error", async () => {
    const fetchImpl = jest.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(
      runScheduledSync("full", { fetchImpl, dispatcher: null, logger: quiet }),
    ).rejects.toThrow("sync route request failed: fetch failed");
  });

  it("accepts an app that predates the streaming route, but fails on its reported errors", async () => {
    const legacyOk = fetchReturning(
      new Response(JSON.stringify({ searchTerms: ["x"], totalUpserted: 7 }), {
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(
      runScheduledSync("keywords", { fetchImpl: legacyOk, dispatcher: null, logger: quiet }),
    ).resolves.toMatchObject({ ok: true, legacyRoute: true, received: 7, complete: false, stopReason: "not_reported" });

    const legacyFailed = fetchReturning(
      new Response(JSON.stringify({ searchTerms: ["x"], totalUpserted: 0, errors: ["Failed to sync"] }), {
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(
      runScheduledSync("keywords", { fetchImpl: legacyFailed, dispatcher: null, logger: quiet }),
    ).rejects.toBeInstanceOf(SyncRunFailedError);
  });

  it("returns (does not throw) a skipped run and logs why", async () => {
    const info = jest.fn();
    const fetchImpl = fetchReturning(
      ndjson([{ type: "start" }, { ...OK_SUMMARY, received: 0, inserted: 0, unchanged: 0, updated: 0, skipped: "Ever Jobs predates contract v1" }]),
    );
    const warn = jest.fn();
    const result = await runScheduledSync("full", { fetchImpl, dispatcher: null, logger: { info, warn } });
    expect(result).toMatchObject({ ok: true, skipped: "Ever Jobs predates contract v1" });
    expect(info).toHaveBeenCalledWith(expect.stringContaining("full sync skipped"), expect.anything());
    expect(warn).not.toHaveBeenCalled();
  });

  it("returns a complete ok run with its completeness fields, logged as ok (no warning)", async () => {
    const info = jest.fn();
    const warn = jest.fn();
    const result = await runScheduledSync("full", {
      fetchImpl: fetchReturning(ndjson([OK_SUMMARY])),
      dispatcher: null,
      logger: { info, warn },
    });
    expect(result).toMatchObject({ ok: true, complete: true, stopReason: null, sourcesSkipped: 0, sourcesFailed: 2 });
    expect(info).toHaveBeenCalledWith("[jobs-sync] full sync ok", expect.anything());
    expect(warn).not.toHaveBeenCalled();
  });

  it("returns (does not throw) an ok run on a PARTIAL crawl, and logs a warning with the stop reason", async () => {
    const info = jest.fn();
    const warn = jest.fn();
    const partial = { ...OK_SUMMARY, complete: false, stopReason: "deadline", sourcesSkipped: 312, sourcesFailed: 7 };
    const result = await runScheduledSync("full", {
      fetchImpl: fetchReturning(ndjson([partial])),
      dispatcher: null,
      logger: { info, warn },
    });
    expect(result).toMatchObject({ ok: true, complete: false, stopReason: "deadline", sourcesSkipped: 312, sourcesFailed: 7 });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toMatch(/full sync ok but INCOMPLETE: stopReason=deadline sourcesSkipped=312 sourcesFailed=7/);
    expect(info).not.toHaveBeenCalledWith("[jobs-sync] full sync ok", expect.anything());
  });

  it("reads a summary without completeness fields (an older app) as NOT known complete", async () => {
    const warn = jest.fn();
    const older: Record<string, unknown> = { ...OK_SUMMARY };
    for (const k of ["complete", "stopReason", "sourcesSkipped", "sourcesFailed"]) delete older[k];
    const result = await runScheduledSync("keywords", {
      fetchImpl: fetchReturning(ndjson([older])),
      dispatcher: null,
      logger: { info: jest.fn(), warn },
    });
    expect(result).toMatchObject({ ok: true, complete: false, stopReason: "not_reported", sourcesSkipped: 0, sourcesFailed: 0 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("stopReason=not_reported"), expect.anything());
    // Anything but a literal true is not complete.
    const truthy = await runScheduledSync("keywords", {
      fetchImpl: fetchReturning(ndjson([{ ...OK_SUMMARY, complete: "true" }])),
      dispatcher: null,
      logger: quiet,
    });
    expect(truthy).toMatchObject({ complete: false, stopReason: "not_reported" });
  });

  it("budgets the call below each schedule's maxDuration", () => {
    expect(maxDurationFor("keywords")).toBe(KEYWORD_SYNC_MAX_DURATION_S);
    expect(maxDurationFor("full")).toBe(FULL_SYNC_MAX_DURATION_S);
    expect(FULL_SYNC_MAX_DURATION_S).toBe(3600);
  });

  it("forwards extra body fields but the mode always wins", async () => {
    const fetchImpl = fetchReturning(ndjson([OK_SUMMARY]));
    await runSyncViaRoute({
      mode: "keywords",
      body: { mode: "full", searchTerms: ["quant"] },
      timeoutMs: 1000,
      fetchImpl,
      dispatcher: null,
    });
    expect(JSON.parse((fetchImpl.mock.calls[0]![1] as RequestInit).body as string)).toEqual({
      mode: "keywords",
      searchTerms: ["quant"],
      deadlineMs: 1_000,
    });
  });
});

describe("routeDeadlineMs", () => {
  it("leaves headroom below the call timeout and stays within the route's bounds", () => {
    expect(routeDeadlineMs(570_000)).toBe(550_000);
    expect(routeDeadlineMs(5_000)).toBe(1_000);
    expect(routeDeadlineMs(10 * 60 * 60 * 1000)).toBe(2 * 60 * 60 * 1000);
  });
});

describe("createDefaultSyncDeps", () => {
  it("opens each upstream stream with at most the time left before the deadline, and none after it", async () => {
    let t = 1_000_000;
    const calls: Array<{ timeoutMs?: number }> = [];
    const client = {
      openSearchStream: async (_input: unknown, options?: { timeoutMs?: number }) => {
        calls.push({ ...options });
        return { legacy: false, async *[Symbol.asyncIterator]() {} };
      },
    };
    const deps = createDefaultSyncDeps({
      env: readSyncEnv({}),
      store: new FakeJobStore(),
      client: client as never,
      deadlineAt: t + 60_000,
      now: () => t,
    });
    await deps.openStream({} as never, 0);
    expect(calls[0]!.timeoutMs).toBe(60_000);
    // Ever Jobs' own cross-source dedup is off; the ingestor dedupes by dedupKey (spec D22).
    expect(calls[0]).toMatchObject({ dedup: false });
    t += 59_000;
    await deps.openStream({} as never, 1);
    expect(calls[1]!.timeoutMs).toBe(1_000);
    t += 1_000;
    await expect(deps.openStream({} as never, 2)).rejects.toThrow("deadline");
    expect(calls).toHaveLength(2);

    const unbounded = createDefaultSyncDeps({ env: readSyncEnv({}), store: new FakeJobStore(), client: client as never });
    await unbounded.openStream({} as never, 0);
    expect(calls[2]!.timeoutMs).toBeUndefined();
    expect(calls[2]).toEqual({ dedup: false });
  });

  it("uses the per-mode Google cap and the process-level geocoding memo", () => {
    const env = readSyncEnv({});
    const common = { env, store: new FakeJobStore(), client: {} as never };
    expect(createDefaultSyncDeps({ ...common, mode: "keywords" }).geocodeMaxCalls).toBe(100);
    expect(createDefaultSyncDeps({ ...common, mode: "full" }).geocodeMaxCalls).toBe(500);
    expect(createDefaultSyncDeps(common).geocodeMemo).toBe(processGeocodeMemo);
  });
});

describe("runInProcessSync (the sync-jobs task)", () => {
  const stream = (events: JobStreamEvent[]) => ({
    async *[Symbol.asyncIterator]() {
      for (const e of events) yield e;
    },
  });
  const v1 = new UpstreamContractTracker();
  v1.observe(false);
  const baseDeps = {
    store: new FakeJobStore(),
    geocode: null,
    geocodeMaxCalls: 0,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    upstreamContract: v1,
  };

  it("returns the summary when ok", async () => {
    const summary = await runInProcessSync(
      { mode: "full" },
      {
        ...baseDeps,
        openStream: async () =>
          stream([
            { type: "job", job: { id: "1", site: "s", title: "t" } },
            { type: "end", legacy: false },
          ]),
      },
    );
    expect(summary).toMatchObject({ ok: true, inserted: 1 });
  });

  it("returns (does not throw) a partial crawl, warning with the producer's stop reason", async () => {
    const warn = jest.fn();
    const partial = await runInProcessSync(
      { mode: "full" },
      {
        ...baseDeps,
        logger: { info: () => {}, warn, error: () => {} },
        openStream: async () =>
          stream([
            { type: "job", job: { id: "p1", site: "s", title: "t" } },
            { type: "end", legacy: false, complete: false, stopReason: "job_ceiling", sourcesSkipped: 40, sourcesFailed: 1 },
          ]),
      },
    );
    expect(partial).toMatchObject({ ok: true, complete: false, stopReason: "job_ceiling", sourcesSkipped: 40, sourcesFailed: 1 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("full sync incomplete: stopReason=job_ceiling"));

    const whole = await runInProcessSync(
      { mode: "full" },
      {
        ...baseDeps,
        openStream: async () => stream([{ type: "end", legacy: false, complete: true, stopReason: null, sourcesSkipped: 0, sourcesFailed: 3 }]),
      },
    );
    expect(whole).toMatchObject({ ok: true, complete: true, stopReason: null, sourcesFailed: 3 });
  });

  it("skips a full run (no upstream call, no throw) while the contract is unknown", async () => {
    const openStream = jest.fn(async () => stream([{ type: "end", legacy: false }]));
    const summary = await runInProcessSync(
      { mode: "full" },
      { ...baseDeps, upstreamContract: new UpstreamContractTracker(), openStream },
    );
    expect(openStream).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ ok: true, skipped: expect.any(String) });
  });

  it("THROWS when the run is not ok", async () => {
    await expect(
      runInProcessSync(
        { mode: "full" },
        {
          ...baseDeps,
          openStream: async () => {
            throw new Error("ECONNREFUSED");
          },
        },
      ),
    ).rejects.toBeInstanceOf(SyncRunFailedError);
  });
});
