import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { JobStreamEvent } from "@ever-hust/jobs-api";
import { UpstreamContractTracker, type RunSyncDeps, type UpstreamStream } from "@ever-hust/triggers/ingest";
import {
  fileInFlightMarker,
  IN_FLIGHT_MARKER_PREFIX,
  inFlightMarkerContents,
  inFlightMarkerPath,
  type InFlightMarker,
} from "./jobs-sync-inflight-marker";
import { handleJobsSync, type JobsSyncRouteDeps } from "./jobs-sync-route";

/**
 * The in-flight marker file (handover H-12 / FS-5): a hust-web pod's preStop hook waits while
 * `/tmp/hust-jobs-sync-inflight-*` exists, so a rollout no longer kills a running full sync.
 */

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "hust-inflight-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("the in-flight marker file", () => {
  it("is named for the preStop glob: <tmpdir>/hust-jobs-sync-inflight-<mode>", () => {
    expect(IN_FLIGHT_MARKER_PREFIX).toBe("hust-jobs-sync-inflight-");
    expect(inFlightMarkerPath("full", "/tmp")).toMatch(/[\\/]tmp[\\/]hust-jobs-sync-inflight-full$/);
    expect(inFlightMarkerPath("keywords", "/tmp")).toMatch(/hust-jobs-sync-inflight-keywords$/);
    expect(inFlightMarkerPath("full")).toBe(join(tmpdir(), "hust-jobs-sync-inflight-full"));
  });

  it("create writes the start time and the token; remove deletes it", () => {
    const marker = fileInFlightMarker(dir);
    const startedAt = Date.parse("2026-10-08T12:20:00.000Z");
    marker.create("full", "tok-1", startedAt);
    const path = inFlightMarkerPath("full", dir);
    expect(readFileSync(path, "utf8")).toBe("2026-10-08T12:20:00.000Z tok-1\n");
    expect(inFlightMarkerContents("tok-1", startedAt)).toBe("2026-10-08T12:20:00.000Z tok-1\n");
    marker.remove("full", "tok-1");
    expect(existsSync(path)).toBe(false);
  });

  it("remove leaves another run's marker alone (token mismatch)", () => {
    const marker = fileInFlightMarker(dir);
    marker.create("full", "old-run", 0);
    // A hung run outlived its slot; the next run took the slot and wrote its own marker.
    marker.create("full", "new-run", 1_000);
    marker.remove("full", "old-run"); // the hung run's late release
    const path = inFlightMarkerPath("full", dir);
    expect(readFileSync(path, "utf8")).toContain(" new-run");
    marker.remove("full", "new-run");
    expect(existsSync(path)).toBe(false);
  });

  it("modes have their own markers", () => {
    const marker = fileInFlightMarker(dir);
    marker.create("full", "f", 0);
    marker.create("keywords", "k", 0);
    marker.remove("keywords", "k");
    expect(existsSync(inFlightMarkerPath("full", dir))).toBe(true);
    expect(existsSync(inFlightMarkerPath("keywords", dir))).toBe(false);
  });

  it("never throws: a missing marker is fine, an unwritable directory is one warning", () => {
    const warn = jest.fn();
    const marker = fileInFlightMarker(dir, warn);
    expect(() => marker.remove("full", "never-written")).not.toThrow();
    expect(warn).not.toHaveBeenCalled();

    const missing = fileInFlightMarker(join(dir, "does", "not", "exist"), warn);
    expect(() => missing.create("full", "t", 0)).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain("could not write the in-flight marker");

    // A directory where the marker should be: removing it fails (not ENOENT) → a warning, no throw.
    const blocked = fileInFlightMarker(dir, warn);
    const path = inFlightMarkerPath("keywords", dir);
    mkdirSync(path);
    expect(() => blocked.remove("keywords", "t")).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// The route keeps the marker with its single-flight slot
// ---------------------------------------------------------------------------

const env = process.env as Record<string, string | undefined>;
const savedSecret = env.CRON_SECRET;
beforeEach(() => {
  env.CRON_SECRET = "s3cret";
});
afterEach(() => {
  if (savedSecret === undefined) delete env.CRON_SECRET;
  else env.CRON_SECRET = savedSecret;
});

const job = (id: string): JobStreamEvent => ({ type: "job", job: { id, site: "lever", title: `T ${id}` } });
const END: JobStreamEvent = { type: "end", total: 1, legacy: false, complete: true };

function gatedStream(gate: Promise<void>): UpstreamStream {
  return {
    legacy: false,
    async *[Symbol.asyncIterator]() {
      yield job("a");
      await gate;
      yield END;
    },
  };
}

function deps(marker: InFlightMarker, openStream: RunSyncDeps["openStream"], contract: "v1" | "unknown" = "v1"): Partial<JobsSyncRouteDeps> {
  const tracker = new UpstreamContractTracker();
  if (contract === "v1") tracker.observe(false);
  return {
    openGraceMs: 1_000,
    heartbeatMs: 60_000,
    logger: { error: () => {} },
    inFlight: new Map(),
    upstreamContract: tracker,
    inFlightMarker: marker,
    createRunDeps: (onProgress): RunSyncDeps => ({
      openStream,
      store: {
        findExisting: async () => new Map(),
        findDedupCandidates: async () => [],
        findDedupKeys: async () => [],
        findWriteNeeds: async () => new Map(),
        refreshLastSeen: async () => [],
        findCoordsForLocations: async () => new Map(),
        upsertBatch: async (rows) => rows.map((r) => ({ externalId: r.externalId, inserted: true })),
      },
      geocode: null,
      geocodeMaxCalls: 0,
      batchSize: 2,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      onProgress,
      upstreamContract: tracker,
    }),
  };
}

const post = (body: unknown) =>
  new Request("http://localhost/api/jobs/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer s3cret" },
    body: JSON.stringify(body),
  });

describe("POST /api/jobs/sync keeps an in-flight marker while a run holds its slot", () => {
  it("the marker exists from the start of the run until its summary, then it is gone", async () => {
    const marker = fileInFlightMarker(dir);
    const path = inFlightMarkerPath("full", dir);
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    const res = await handleJobsSync(post({ mode: "full" }), deps(marker, async () => gatedStream(gate)));
    expect(res.status).toBe(200);
    // Streaming, the run is still waiting on the upstream: the marker is there, with a token.
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf8")).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z [0-9a-f-]{36}\n$/);
    open();
    const text = await res.text();
    expect(text).toContain('"type":"summary","ok":true');
    expect(existsSync(path)).toBe(false);
  });

  it("is removed after a failure before streaming (502) and after a skipped run, and never written for a 409", async () => {
    const calls: string[] = [];
    const recording: InFlightMarker = {
      create: (mode, token) => calls.push(`create ${mode} ${token.length}`),
      remove: (mode, token) => calls.push(`remove ${mode} ${token.length}`),
    };
    const refused = await handleJobsSync(
      post({ mode: "full" }),
      deps(recording, async () => {
        throw new Error("connect ECONNREFUSED");
      }),
    );
    expect(refused.status).toBe(502);
    expect(calls).toEqual(["create full 36", "remove full 36"]);

    calls.length = 0;
    const skipped = await handleJobsSync(post({ mode: "full" }), deps(recording, async () => gatedStream(Promise.resolve()), "unknown"));
    expect(await skipped.text()).toContain('"skipped"');
    expect(calls).toEqual(["create full 36", "remove full 36"]);

    calls.length = 0;
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    const shared = deps(recording, async () => gatedStream(gate));
    const first = await handleJobsSync(post({ mode: "keywords", searchTerms: ["a"] }), shared);
    const second = await handleJobsSync(post({ mode: "keywords", searchTerms: ["b"] }), shared);
    expect(second.status).toBe(409);
    expect(calls).toEqual(["create keywords 36"]);
    open();
    await first.text();
    expect(calls).toEqual(["create keywords 36", "remove keywords 36"]);
  });

  it("a marker that throws never fails or blocks the sync", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const broken: InFlightMarker = {
        create: () => {
          throw new Error("EROFS: read-only file system");
        },
        remove: () => {
          throw new Error("EROFS: read-only file system");
        },
      };
      const res = await handleJobsSync(post({ mode: "full" }), deps(broken, async () => gatedStream(Promise.resolve())));
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('"type":"summary","ok":true');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("in-flight marker failed (ignored)"));
    } finally {
      warn.mockRestore();
    }
  });
});
