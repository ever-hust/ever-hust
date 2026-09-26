import { TruncatedStreamError, type JobStreamEvent, type ScraperInput } from "@ever-hust/jobs-api";
import {
  UpstreamContractTracker,
  type JobStore,
  type RunSyncDeps,
  type UpstreamStream,
} from "@ever-hust/triggers/ingest";
import {
  handleJobsSync,
  MAX_SYNC_DEADLINE_MS,
  STALE_RUN_GRACE_MS,
  type JobsSyncRouteDeps,
} from "./jobs-sync-route";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

/** Store double: every row is new and accepted. */
function acceptingStore(): JobStore & { written: string[] } {
  const written: string[] = [];
  return {
    written,
    findExisting: async () => new Map(),
    findDedupCandidates: async () => [],
    findDedupKeys: async () => [],
    findWriteNeeds: async () => new Map(),
    refreshLastSeen: async () => [],
    findCoordsForLocations: async () => new Map(),
    upsertBatch: async (rows) => {
      written.push(...rows.map((r) => r.externalId));
      return rows.map((r) => ({ externalId: r.externalId, inserted: true }));
    },
  };
}

const jobEvent = (id: string): JobStreamEvent => ({
  type: "job",
  job: { id, site: "lever", title: `Title ${id}` },
});
const END: JobStreamEvent = { type: "end", total: 2, legacy: false };

function streamOf(
  events: JobStreamEvent[],
  opts: { failWith?: Error; delayMs?: number; legacy?: boolean } = {},
): UpstreamStream {
  return {
    legacy: opts.legacy ?? false,
    async *[Symbol.asyncIterator]() {
      for (const e of events) {
        if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
        yield e;
      }
      if (opts.failWith) throw opts.failWith;
    },
  };
}

type OpenStream = (input: ScraperInput, index: number) => Promise<UpstreamStream>;

/** A tracker that has already seen Ever Jobs answer in NDJSON (contract v1). */
function v1Tracker(): UpstreamContractTracker {
  const t = new UpstreamContractTracker();
  t.observe(false);
  return t;
}

// The route runs the shared cron guard (verifyCronRequest), which reads CRON_SECRET / NODE_ENV.
const env = process.env as Record<string, string | undefined>;
const savedEnv = { CRON_SECRET: env.CRON_SECRET, NODE_ENV: env.NODE_ENV };
function restoreEnv(key: keyof typeof savedEnv) {
  if (savedEnv[key] === undefined) delete env[key];
  else env[key] = savedEnv[key];
}
beforeEach(() => {
  env.CRON_SECRET = "s3cret";
});
afterEach(() => {
  restoreEnv("CRON_SECRET");
  restoreEnv("NODE_ENV");
});

function routeDeps(
  openStream: OpenStream,
  extra: Partial<JobsSyncRouteDeps> = {},
): Partial<JobsSyncRouteDeps> & { store: ReturnType<typeof acceptingStore>; upstreamContract: UpstreamContractTracker } {
  const store = acceptingStore();
  const upstreamContract = extra.upstreamContract ?? v1Tracker();
  return {
    store,
    openGraceMs: 1_000,
    heartbeatMs: 60_000,
    logger: { error: () => {} },
    inFlight: new Map(),
    createRunDeps: (onProgress): RunSyncDeps => ({
      openStream,
      store,
      geocode: null,
      geocodeMaxCalls: 0,
      batchSize: 2,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      onProgress,
      upstreamContract,
    }),
    ...extra,
    upstreamContract,
  };
}

function post(body?: unknown, headers: Record<string, string> = { Authorization: "Bearer s3cret" }) {
  return new Request("http://localhost/api/jobs/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function readLines(res: Response): Promise<Array<Record<string, unknown>>> {
  const text = await res.text();
  return text
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Failing before streaming → non-2xx
// ---------------------------------------------------------------------------

describe("POST /api/jobs/sync — failures before streaming are non-2xx", () => {
  it("401 without the cron secret, and never touches the upstream", async () => {
    const openStream = jest.fn<Promise<UpstreamStream>, [ScraperInput, number]>();
    const res = await handleJobsSync(post({}, {}), routeDeps(openStream));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ type: "summary", ok: false, error: "Unauthorized" });
    expect(openStream).not.toHaveBeenCalled();
  });

  it("accepts the x-cron-secret header too", async () => {
    const res = await handleJobsSync(
      post({}, { "x-cron-secret": "s3cret" }),
      routeDeps(async () => streamOf([END])),
    );
    expect(res.status).toBe(200);
    await res.text();
  });

  it("401 with a wrong secret or a prefix of it (the shared constant-time guard)", async () => {
    const openStream = jest.fn<Promise<UpstreamStream>, [ScraperInput, number]>();
    const attempts: Array<Record<string, string>> = [
      { Authorization: "Bearer nope" },
      { Authorization: "Bearer s3cre" },
      { "x-cron-secret": "s3cret!" },
    ];
    for (const headers of attempts) {
      const res = await handleJobsSync(post({}, headers), routeDeps(openStream));
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ type: "summary", ok: false, error: "Unauthorized" });
    }
    expect(openStream).not.toHaveBeenCalled();
  });

  it("503 (fail closed) without CRON_SECRET in production, and never touches the upstream", async () => {
    delete env.CRON_SECRET;
    env.NODE_ENV = "production";
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const openStream = jest.fn<Promise<UpstreamStream>, [ScraperInput, number]>();
      const res = await handleJobsSync(post({}, {}), routeDeps(openStream));
      expect(res.status).toBe(503);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toMatchObject({ type: "summary", ok: false });
      expect(String(body.error)).toContain("CRON_SECRET");
      expect(openStream).not.toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
  });

  it("stays open without CRON_SECRET outside production (local development)", async () => {
    delete env.CRON_SECRET;
    env.NODE_ENV = "development";
    const res = await handleJobsSync(post({}, {}), routeDeps(async () => streamOf([END])));
    expect(res.status).toBe(200);
    await res.text();
  });

  it("answers with the injected guard's status (the dependency the production wiring fills with verifyCronRequest)", async () => {
    const openStream = jest.fn<Promise<UpstreamStream>, [ScraperInput, number]>();
    const res = await handleJobsSync(
      post(),
      routeDeps(openStream, { authorize: () => new Response(JSON.stringify({ error: "nope" }), { status: 403 }) }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ type: "summary", ok: false, error: "nope" });
    expect(openStream).not.toHaveBeenCalled();
  });

  it("400 on malformed JSON, an unknown mode or an unknown site category", async () => {
    const openStream = jest.fn<Promise<UpstreamStream>, [ScraperInput, number]>();
    for (const body of [
      "{not json",
      { mode: "everything" },
      { siteCategories: ["made-up"] },
      { resultsWanted: -1 },
      { resultsWanted: 1001 }, // per source, 1..1000 (spec §7.2)
      { mode: "full", siteCategories: ["job-board"] }, // keywords mode only
      { mode: "full", searchTerms: ["quant"] },
      { deadlineMs: 10 },
    ]) {
      const res = await handleJobsSync(post(body), routeDeps(openStream));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ ok: false });
    }
    expect(openStream).not.toHaveBeenCalled();
  });

  it("502 when the upstream stream cannot be opened", async () => {
    const res = await handleJobsSync(
      post({ mode: "full" }),
      routeDeps(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({
      type: "summary",
      ok: false,
      mode: "full",
      error: expect.stringContaining("ECONNREFUSED"),
    });
  });
});

// ---------------------------------------------------------------------------
// Single flight per mode + the caller's deadline
// ---------------------------------------------------------------------------

describe("POST /api/jobs/sync — no overlapping runs, bounded by the caller's budget", () => {
  it("answers 409 to a second run of the same mode while one is in flight; other modes still run", async () => {
    let releaseUpstream!: () => void;
    const gate = new Promise<void>((r) => (releaseUpstream = r));
    const slow: OpenStream = async () => ({
      legacy: false,
      async *[Symbol.asyncIterator]() {
        await gate;
        yield END;
      },
    });
    const deps = routeDeps(slow);
    const first = await handleJobsSync(post({}), deps);
    expect(first.status).toBe(200);

    const second = await handleJobsSync(post({}), deps);
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({
      type: "summary",
      ok: false,
      mode: "keywords",
      error: expect.stringContaining("already running"),
    });

    const other = await handleJobsSync(post({ mode: "full" }), { ...deps, createRunDeps: routeDeps(async () => streamOf([END])).createRunDeps });
    expect(other.status).toBe(200);
    await other.text();

    releaseUpstream();
    expect((await readLines(first)).at(-1)).toMatchObject({ type: "summary", ok: true });
    // Released once the run finished.
    const third = await handleJobsSync(post({}), { ...deps, createRunDeps: routeDeps(async () => streamOf([END])).createRunDeps });
    expect(third.status).toBe(200);
    await third.text();
    expect(deps.inFlight!.size).toBe(0);
  });

  it("frees the slot after a failure before streaming and after a skipped run", async () => {
    const deps = routeDeps(async () => {
      throw new Error("ECONNREFUSED");
    });
    expect((await handleJobsSync(post({}), deps)).status).toBe(502);
    expect(deps.inFlight!.size).toBe(0);

    const skipped = routeDeps(async () => streamOf([END]), { upstreamContract: new UpstreamContractTracker() });
    await (await handleJobsSync(post({ mode: "full" }), skipped)).text();
    expect(skipped.inFlight!.size).toBe(0);
  });

  it("passes the caller's budget (deadlineMs) to the run as an absolute deadline; 2 h without one", async () => {
    const contexts: Array<{ mode: string; deadlineAt: number }> = [];
    const base = routeDeps(async () => streamOf([END]));
    const deps = {
      ...base,
      createRunDeps: (onProgress: Parameters<JobsSyncRouteDeps["createRunDeps"]>[0], ctx: { mode: "keywords" | "full"; deadlineAt: number }) => {
        contexts.push(ctx);
        return base.createRunDeps!(onProgress, ctx);
      },
    };
    const before = Date.now();
    await (await handleJobsSync(post({ deadlineMs: 550_000 }), deps)).text();
    await (await handleJobsSync(post({}), deps)).text();
    expect(contexts[0]!.deadlineAt).toBeGreaterThanOrEqual(before + 550_000);
    expect(contexts[0]!.deadlineAt).toBeLessThanOrEqual(Date.now() + 550_000);
    expect(contexts[1]!.deadlineAt).toBeGreaterThanOrEqual(before + MAX_SYNC_DEADLINE_MS);
    expect(contexts[1]!.deadlineAt).toBeLessThanOrEqual(Date.now() + MAX_SYNC_DEADLINE_MS);
  });

  it("records the slot's expiry as the run's deadline plus the grace period", async () => {
    let releaseUpstream!: () => void;
    const gate = new Promise<void>((r) => (releaseUpstream = r));
    const deps = routeDeps(async () => ({
      legacy: false,
      async *[Symbol.asyncIterator]() {
        await gate;
        yield END;
      },
    }));
    const before = Date.now();
    const res = await handleJobsSync(post({ deadlineMs: 550_000 }), deps);
    const slot = deps.inFlight!.get("keywords")!;
    expect(slot.expiresAt).toBeGreaterThanOrEqual(before + 550_000 + STALE_RUN_GRACE_MS);
    expect(slot.expiresAt).toBeLessThanOrEqual(Date.now() + 550_000 + STALE_RUN_GRACE_MS);
    releaseUpstream();
    await res.text();
    expect(deps.inFlight!.size).toBe(0);
  });

  it("does not let a hung run block its mode past its deadline + grace (and its late release keeps the new slot)", async () => {
    const errors: string[] = [];
    const deps = routeDeps(async () => streamOf([END]), { logger: { error: (m: string) => errors.push(m) } });
    const hungToken = Symbol("hung");
    const longAgo = Date.now() - 3 * 60 * 60 * 1000;
    // Still within its window: 409.
    deps.inFlight!.set("keywords", { startedAt: longAgo, expiresAt: Date.now() + 60_000, token: hungToken });
    expect((await handleJobsSync(post({}), deps)).status).toBe(409);
    expect(errors).toHaveLength(0);

    // Past deadline + grace: the slot is stale, the new run starts and owns the slot.
    let releaseUpstream!: () => void;
    const gate = new Promise<void>((r) => (releaseUpstream = r));
    deps.inFlight!.set("keywords", { startedAt: longAgo, expiresAt: Date.now() - 1, token: hungToken });
    const res = await handleJobsSync(post({}), {
      ...deps,
      createRunDeps: routeDeps(async () => ({
        legacy: false,
        async *[Symbol.asyncIterator]() {
          await gate;
          yield END;
        },
      })).createRunDeps,
    });
    expect(res.status).toBe(200);
    expect(errors.join("\n")).toContain("treating it as hung");
    const slot = deps.inFlight!.get("keywords")!;
    expect(slot.token).not.toBe(hungToken);
    // Meanwhile the new run holds the slot: a third request is refused.
    expect((await handleJobsSync(post({}), deps)).status).toBe(409);

    releaseUpstream();
    expect((await readLines(res)).at(-1)).toMatchObject({ type: "summary", ok: true });
    expect(deps.inFlight!.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Ever Jobs that predates contract v1 (spec 01a D18)
// ---------------------------------------------------------------------------

describe("POST /api/jobs/sync — full mode waits for Ever Jobs contract v1", () => {
  it("skips a full run (ok, skipped, no upstream call) until the process has seen NDJSON", async () => {
    const openStream = jest.fn<Promise<UpstreamStream>, [ScraperInput, number]>();
    for (const tracker of [new UpstreamContractTracker(), (() => { const t = new UpstreamContractTracker(); t.observe(true); return t; })()]) {
      const res = await handleJobsSync(post({ mode: "full" }), routeDeps(openStream, { upstreamContract: tracker }));
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/x-ndjson; charset=utf-8");
      const lines = await readLines(res);
      expect(lines.map((l) => l.type)).toEqual(["start", "summary"]);
      expect(lines[1]).toMatchObject({ ok: true, mode: "full", received: 0, skipped: expect.stringContaining("contract v1") });
    }
    expect(openStream).not.toHaveBeenCalled();
  });

  it("keeps keyword runs at the legacy per-source count until then, and learns the contract from the stream", async () => {
    const tracker = new UpstreamContractTracker();
    const seen: ScraperInput[] = [];
    const deps = routeDeps(
      async (input) => {
        seen.push(input);
        return streamOf([END], { legacy: false });
      },
      { upstreamContract: tracker },
    );
    await (await handleJobsSync(post({}), deps)).text();
    expect(seen[0]!.resultsWanted).toBe(80);
    expect(tracker.current).toBe("v1");

    // Now known: keyword runs get the configured count and full runs go ahead.
    await (await handleJobsSync(post({}), deps)).text();
    expect(seen[1]!.resultsWanted).toBe(100);
    const full = await readLines(await handleJobsSync(post({ mode: "full" }), deps));
    expect(full.at(-1)).toMatchObject({ ok: true });
    expect(full.at(-1)).not.toHaveProperty("skipped");
    expect(seen[2]).not.toHaveProperty("searchTerm");
  });

  it("records a legacy answer, which gates the next full run again", async () => {
    const tracker = v1Tracker();
    const deps = routeDeps(async () => streamOf([END], { legacy: true }), { upstreamContract: tracker });
    await (await handleJobsSync(post({}), deps)).text();
    expect(tracker.current).toBe("legacy");
    const lines = await readLines(await handleJobsSync(post({ mode: "full" }), deps));
    expect(lines.at(-1)).toMatchObject({ ok: true, skipped: expect.stringContaining("predates contract v1") });
  });
});

// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------

describe("POST /api/jobs/sync — NDJSON progress stream", () => {
  it("streams start → summary (last line) with counters, uncompressed and uncached", async () => {
    const deps = routeDeps(async () => streamOf([jobEvent("1"), jobEvent("2"), jobEvent("3"), END]));
    const res = await handleJobsSync(post({ mode: "full" }), deps);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/x-ndjson; charset=utf-8");
    expect(res.headers.get("cache-control")).toContain("no-transform");

    const lines = await readLines(res);
    expect(lines[0]).toMatchObject({ type: "start", mode: "full", terms: [] });
    const last = lines[lines.length - 1]!;
    expect(last).toMatchObject({
      type: "summary",
      ok: true,
      mode: "full",
      received: 3,
      inserted: 3,
      updated: 0,
      unchanged: 0,
      invalid: 0,
      duplicatesMerged: 0,
      errors: 0,
      geocodeCalls: 0,
      geocodeReused: 0,
      truncated: false,
    });
    expect(typeof last.durationMs).toBe("number");
    expect(lines.filter((l) => l.type === "summary")).toHaveLength(1);
    expect(deps.store.written.sort()).toEqual(["1", "2", "3"]);
  });

  it("carries the upstream crawl completeness in the summary: a partial crawl is ok, complete:false with its reason", async () => {
    const partial = routeDeps(async () =>
      streamOf([
        jobEvent("1"),
        { type: "end", total: 1, legacy: false, complete: false, stopReason: "deadline", sourcesSkipped: 12, sourcesFailed: 3 },
      ]),
    );
    const last = (await readLines(await handleJobsSync(post({ mode: "full" }), partial))).pop()!;
    expect(last).toMatchObject({ type: "summary", ok: true, complete: false, stopReason: "deadline", sourcesSkipped: 12, sourcesFailed: 3 });

    const whole = routeDeps(async () =>
      streamOf([{ type: "end", total: 0, legacy: false, complete: true, stopReason: null, sourcesSkipped: 0, sourcesFailed: 0 }]),
    );
    const done = (await readLines(await handleJobsSync(post({ mode: "full" }), whole))).pop()!;
    expect(done).toMatchObject({ type: "summary", ok: true, complete: true, stopReason: null });

    // END carries no completeness (an older Ever Jobs): not known complete.
    const older = (await readLines(await handleJobsSync(post({ mode: "full" }), routeDeps(async () => streamOf([END]))))).pop()!;
    expect(older).toMatchObject({ type: "summary", ok: true, complete: false, stopReason: "not_reported" });
  });

  it("reports ok:false (HTTP 200 already sent) when the upstream stream is truncated", async () => {
    const deps = routeDeps(async () =>
      streamOf([jobEvent("1")], {
        failWith: new TruncatedStreamError("missing_end", "ended without an end line", 1),
      }),
    );
    const res = await handleJobsSync(post({ mode: "full" }), deps);
    expect(res.status).toBe(200);
    const last = (await readLines(res)).pop()!;
    expect(last).toMatchObject({ type: "summary", ok: false, truncated: true, inserted: 1 });
    expect(deps.store.written).toEqual(["1"]); // partial results are kept (spec D3)
  });

  it("emits heartbeat progress lines while the run is in flight", async () => {
    const deps = routeDeps(async () => streamOf([jobEvent("1"), jobEvent("2"), END], { delayMs: 40 }), {
      heartbeatMs: 10,
    });
    const lines = await readLines(await handleJobsSync(post({ mode: "full" }), deps));
    expect(lines.filter((l) => l.type === "progress").length).toBeGreaterThan(0);
    expect(lines[lines.length - 1]).toMatchObject({ type: "summary", ok: true });
  });

  it("starts streaming after the grace period when the upstream is slow, and still reports a late failure", async () => {
    const slowFailure: OpenStream = () =>
      new Promise((_, reject) => setTimeout(() => reject(new Error("upstream 503")), 60));
    const res = await handleJobsSync(post({ mode: "full" }), routeDeps(slowFailure, { openGraceMs: 5 }));
    expect(res.status).toBe(200);
    const last = (await readLines(res)).pop()!;
    expect(last).toMatchObject({ type: "summary", ok: false, upstreamFailed: true });
  });

  it("defaults to keywords mode (rotation term, keyword categories) for an empty or legacy body", async () => {
    const seen: ScraperInput[] = [];
    const openStream: OpenStream = async (input) => {
      seen.push(input);
      return streamOf([END]);
    };
    for (const body of [undefined, { resultsWanted: 80 }]) {
      const res = await handleJobsSync(post(body), routeDeps(openStream));
      expect(res.status).toBe(200);
      const lines = await readLines(res);
      expect(lines[0]).toMatchObject({ type: "start", mode: "keywords" });
    }
    expect(seen[0]!.searchTerm).toEqual(expect.any(String));
    expect(seen[0]!.siteCategories).toEqual([
      "job-board",
      "niche",
      "regional",
      "remote",
      "government",
      "freelance",
    ]);
    expect(seen[1]!.resultsWanted).toBe(80);
  });

  it("full mode sends a keyword-less list request", async () => {
    const seen: ScraperInput[] = [];
    const res = await handleJobsSync(
      post({ mode: "full" }),
      routeDeps(async (input) => {
        seen.push(input);
        return streamOf([END]);
      }),
    );
    await res.text();
    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toHaveProperty("searchTerm");
    expect(seen[0]).not.toHaveProperty("siteCategories");
    expect(seen[0]!.resultsWanted).toBe(1000);
  });

  it("runs each explicit keyword term once and reuses the pre-opened first stream", async () => {
    const openStream = jest.fn<Promise<UpstreamStream>, [ScraperInput, number]>(async () => streamOf([END]));
    const res = await handleJobsSync(post({ mode: "keywords", searchTerms: ["quant", "intern"] }), routeDeps(openStream));
    const last = (await readLines(res)).pop()!;
    expect(last).toMatchObject({ ok: true, terms: ["quant", "intern"] });
    expect(openStream).toHaveBeenCalledTimes(2);
    expect(openStream.mock.calls.map((c) => c[0].searchTerm)).toEqual(["quant", "intern"]);
  });
});
