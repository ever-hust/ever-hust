import { describe, it, expect, jest } from "@jest/globals";
import { TruncatedStreamError, type JobStreamEnd, type JobStreamEvent, type ScraperInput } from "@ever-hust/jobs-api";
import { buildSyncPlan, type SyncEnvConfig } from "./config";
import { formatSummaryLine, runJobsSync, type RunSyncDeps, type SyncProgress, type UpstreamStream } from "./run-sync";
import { UpstreamContractTracker } from "./upstream-contract";
import { FakeJobStore } from "./testing/fake-store";

const ENV: SyncEnvConfig = {
  fullResultsPerSource: 1000,
  keywordResultsPerSource: 100,
  keywordSiteCategories: ["job-board"],
  geocodeMaxCalls: 0,
  keywordGeocodeMaxCalls: 0,
};

const jobEvent = (id: string): JobStreamEvent => ({
  type: "job",
  job: { id, site: "lever", title: `Title ${id}`, dedupKey: `k-${id}` },
});
const END: JobStreamEvent = { type: "end", total: 2, deduped: true, legacy: false };

function streamOf(events: JobStreamEvent[], opts: { failWith?: Error; legacy?: boolean } = {}): UpstreamStream {
  const close = jest.fn();
  return {
    legacy: opts.legacy,
    close,
    async *[Symbol.asyncIterator]() {
      for (const e of events) yield e;
      if (opts.failWith) throw opts.failWith;
    },
  };
}

function logger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

function deps(openStream: RunSyncDeps["openStream"], extra: Partial<RunSyncDeps> = {}): RunSyncDeps {
  return {
    openStream,
    store: new FakeJobStore(),
    geocode: null,
    geocodeMaxCalls: 0,
    batchSize: 2,
    logger: logger(),
    ...extra,
  };
}

describe("runJobsSync — Ever Jobs contract observation (spec D18)", () => {
  it("records whether the opened stream was NDJSON or a legacy JSON answer", async () => {
    const tracker = new UpstreamContractTracker();
    await runJobsSync(
      buildSyncPlan({ mode: "keywords", searchTerms: ["a"] }, ENV, Date.now(), "unknown"),
      deps(async () => streamOf([END], { legacy: true }), { upstreamContract: tracker }),
    );
    expect(tracker.current).toBe("legacy");
    await runJobsSync(
      buildSyncPlan({ mode: "keywords", searchTerms: ["a"] }, ENV, Date.now(), "legacy"),
      deps(async () => streamOf([END], { legacy: false }), { upstreamContract: tracker }),
    );
    expect(tracker.current).toBe("v1");
  });

  it("a skipped plan opens nothing and reports ok with the reason", async () => {
    const openStream = jest.fn(async () => streamOf([END]));
    const log = logger();
    const summary = await runJobsSync(buildSyncPlan({ mode: "full" }, ENV, 0, "unknown"), deps(openStream, { logger: log }));
    expect(openStream).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ ok: true, received: 0, skipped: expect.any(String) });
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("full sync skipped"));
    expect(formatSummaryLine(summary)).toContain("skipped=true");
  });
});

describe("runJobsSync", () => {
  it("full mode: ingests a complete stream and reports ok with counters and one summary log line", async () => {
    const openStream = jest.fn(async (_input: ScraperInput) =>
      streamOf([{ type: "progress", sourcesDone: 1, sourcesTotal: 2 }, jobEvent("1"), jobEvent("2"), jobEvent("3"), END]),
    );
    const log = logger();
    const store = new FakeJobStore();
    const summary = await runJobsSync(buildSyncPlan({ mode: "full" }, ENV, Date.now(), "v1"), deps(openStream, { logger: log, store }));

    expect(openStream).toHaveBeenCalledTimes(1);
    expect(openStream.mock.calls[0]![0]).not.toHaveProperty("searchTerm");
    expect(summary).toMatchObject({
      ok: true,
      mode: "full",
      terms: [],
      received: 3,
      inserted: 3,
      truncated: false,
      upstreamFailed: false,
      upstreamTotal: 2,
    });
    expect(store.rows.size).toBe(3);
    const summaryLines = log.info.mock.calls.filter((c) => String(c[0]).includes("[jobs-sync] summary"));
    expect(summaryLines).toHaveLength(1);
    expect(String(summaryLines[0]![0])).toContain("mode=full term=<none>");
  });

  it("is NOT ok when the stream is truncated, but keeps the jobs received before the break", async () => {
    const openStream = async () =>
      streamOf([jobEvent("1"), jobEvent("2"), jobEvent("3")], {
        failWith: new TruncatedStreamError("missing_end", "ended without an end line", 3),
      });
    const store = new FakeJobStore();
    const summary = await runJobsSync(buildSyncPlan({ mode: "full" }, ENV, Date.now(), "v1"), deps(openStream, { store }));
    expect(summary.ok).toBe(false);
    expect(summary.truncated).toBe(true);
    expect(summary.inserted).toBe(3);
    expect(store.rows.size).toBe(3);
    expect(summary.errorMessages.join(" ")).toContain("ended without an end line");
  });

  it("is NOT ok on an error line", async () => {
    const openStream = async () =>
      streamOf([jobEvent("1")], {
        failWith: new TruncatedStreamError("error_line", "Ever Jobs stream error: boom", 1),
      });
    const summary = await runJobsSync(buildSyncPlan({ mode: "full" }, ENV, Date.now(), "v1"), deps(openStream));
    expect(summary).toMatchObject({ ok: false, truncated: true, inserted: 1 });
  });

  it("is NOT ok when an upstream request cannot be opened, and continues with the other terms", async () => {
    const openStream = jest.fn(async (input: ScraperInput) => {
      if (input.searchTerm === "a") throw new Error("ECONNREFUSED");
      return streamOf([jobEvent(`${input.searchTerm}-1`), END]);
    });
    const summary = await runJobsSync(
      buildSyncPlan({ mode: "keywords", searchTerms: ["a", "b"] }, ENV, Date.now(), "v1"),
      deps(openStream),
    );
    expect(openStream).toHaveBeenCalledTimes(2);
    expect(summary).toMatchObject({ ok: false, upstreamFailed: true, terms: ["a", "b"], inserted: 1 });
  });

  it("treats an adapter that ends without an end event as truncated", async () => {
    const summary = await runJobsSync(
      buildSyncPlan({ mode: "full" }, ENV, Date.now(), "v1"),
      deps(async () => streamOf([jobEvent("1")])),
    );
    expect(summary).toMatchObject({ ok: false, truncated: true });
  });

  it("keywords mode dedupes across terms within the run", async () => {
    const openStream = async () => streamOf([jobEvent("same"), END]);
    const summary = await runJobsSync(
      buildSyncPlan({ mode: "keywords", searchTerms: ["a", "b"] }, ENV, Date.now(), "v1"),
      deps(openStream),
    );
    expect(summary).toMatchObject({ ok: true, received: 2, inserted: 1, duplicatesMerged: 1 });
  });

  it("is NOT ok when every write failed (database down), and stops consuming", async () => {
    const store = new FakeJobStore();
    store.down = true;
    const events = Array.from({ length: 20 }, (_, i) => jobEvent(String(i)));
    const summary = await runJobsSync(
      buildSyncPlan({ mode: "full" }, ENV, Date.now(), "v1"),
      deps(async () => streamOf([...events, END]), { store, batchSize: 1 }),
    );
    expect(summary.ok).toBe(false);
    expect(summary.errors).toBe(3); // aborted after 3 consecutive failed batches
    expect(summary.received).toBeLessThan(20);
  });

  it("reports progress on upstream progress lines and after each batch; a throwing listener is ignored", async () => {
    const seen: SyncProgress[] = [];
    const onProgress = jest.fn((p: SyncProgress) => {
      seen.push(p);
      throw new Error("listener bug");
    });
    const summary = await runJobsSync(
      buildSyncPlan({ mode: "full" }, ENV, Date.now(), "v1"),
      deps(
        async () =>
          streamOf([
            { type: "progress", sourcesDone: 5, sourcesTotal: 10, jobs: 0 },
            jobEvent("1"),
            jobEvent("2"),
            END,
          ]),
        { onProgress },
      ),
    );
    expect(summary.ok).toBe(true);
    expect(seen[0]).toMatchObject({ upstream: { sourcesDone: 5, sourcesTotal: 10, jobs: 0 } });
    expect(seen.some((p) => p.inserted === 2)).toBe(true);
  });

  it("flags a legacy (pre-contract) server and warns that only one page was ingested", async () => {
    const log = logger();
    const summary = await runJobsSync(
      buildSyncPlan({ mode: "full" }, ENV, Date.now(), "v1"),
      deps(async () => streamOf([jobEvent("1"), { ...END, total: 23456, legacy: true }], { legacy: true }), {
        logger: log,
      }),
    );
    expect(summary).toMatchObject({ ok: true, legacyServer: true, received: 1, upstreamTotal: 23456 });
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("predates the streaming contract"));
  });
});

describe("runJobsSync — crawl completeness from the end line (spec D21)", () => {
  const BASE_END: JobStreamEnd = { type: "end", total: 2, deduped: true, legacy: false };
  const COMPLETE_END: JobStreamEnd = { ...BASE_END, complete: true, stopReason: null, sourcesSkipped: 0, sourcesFailed: 4 };
  const full = () => buildSyncPlan({ mode: "full" }, ENV, Date.now(), "v1");

  it("is complete only when the end line says complete: true", async () => {
    const log = logger();
    const summary = await runJobsSync(full(), deps(async () => streamOf([jobEvent("1"), COMPLETE_END]), { logger: log }));
    expect(summary).toMatchObject({ ok: true, complete: true, stopReason: null, sourcesSkipped: 0, sourcesFailed: 4 });
    expect(log.warn).not.toHaveBeenCalled();
    expect(formatSummaryLine(summary)).toContain("complete=true stopReason=- sourcesSkipped=0 sourcesFailed=4");
  });

  it("keeps a partial crawl ok, records the producer's stop reason and warns", async () => {
    const log = logger();
    const summary = await runJobsSync(
      full(),
      deps(
        async () =>
          streamOf([jobEvent("1"), jobEvent("2"), { ...BASE_END, complete: false, stopReason: "deadline", sourcesSkipped: 312, sourcesFailed: 9 }]),
        { logger: log },
      ),
    );
    expect(summary).toMatchObject({
      ok: true,
      inserted: 2,
      complete: false,
      stopReason: "deadline",
      sourcesSkipped: 312,
      sourcesFailed: 9,
    });
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("full sync incomplete: stopReason=deadline sourcesSkipped=312"));
    expect(formatSummaryLine(summary)).toContain("complete=false stopReason=deadline");
  });

  it("reads a missing or non-true complete as NOT known complete (older producer, legacy JSON)", async () => {
    for (const end of [BASE_END, { ...BASE_END, complete: false }, { ...BASE_END, legacy: true }]) {
      const summary = await runJobsSync(full(), deps(async () => streamOf([jobEvent("1"), end], { legacy: end.legacy })));
      expect(summary).toMatchObject({ ok: true, complete: false, stopReason: "not_reported", sourcesSkipped: 0 });
    }
  });

  it("keywords mode: complete only if every term's stream was; the first reason wins and counts add up", async () => {
    const openStream = async (input: ScraperInput) =>
      input.searchTerm === "a"
        ? streamOf([jobEvent("a1"), { ...COMPLETE_END, sourcesFailed: 1 }])
        : streamOf([jobEvent("b1"), { ...BASE_END, complete: false, stopReason: "job_ceiling", sourcesSkipped: 5, sourcesFailed: 2 }]);
    const summary = await runJobsSync(buildSyncPlan({ mode: "keywords", searchTerms: ["a", "b"] }, ENV, Date.now(), "v1"), deps(openStream));
    expect(summary).toMatchObject({ ok: true, complete: false, stopReason: "job_ceiling", sourcesSkipped: 5, sourcesFailed: 3 });

    const both = await runJobsSync(
      buildSyncPlan({ mode: "keywords", searchTerms: ["a", "b"] }, ENV, Date.now(), "v1"),
      deps(async () => streamOf([COMPLETE_END])),
    );
    expect(both).toMatchObject({ ok: true, complete: true, stopReason: null, sourcesFailed: 8 });
  });

  it("a failed, truncated or skipped run is never complete, and says why", async () => {
    const truncated = await runJobsSync(
      full(),
      deps(async () => streamOf([jobEvent("1")], { failWith: new TruncatedStreamError("missing_end", "no end", 1) })),
    );
    expect(truncated).toMatchObject({ ok: false, complete: false, stopReason: "truncated" });

    const refused = await runJobsSync(
      full(),
      deps(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    expect(refused).toMatchObject({ ok: false, complete: false, stopReason: "upstream_failed" });

    const skipped = await runJobsSync(buildSyncPlan({ mode: "full" }, ENV, 0, "unknown"), deps(async () => streamOf([COMPLETE_END])));
    expect(skipped).toMatchObject({ ok: true, complete: false, stopReason: "skipped" });
  });
});

describe("formatSummaryLine", () => {
  it("prints the keyword terms, or <none> in list mode", async () => {
    const base = await runJobsSync(buildSyncPlan({ mode: "keywords", searchTerms: ["quant"] }, ENV, Date.now(), "v1"), deps(async () => streamOf([END])));
    expect(formatSummaryLine(base)).toContain('term="quant"');
  });
});
