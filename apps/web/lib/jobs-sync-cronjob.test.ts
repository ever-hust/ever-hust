import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import type { JobStreamEvent } from "@ever-hust/jobs-api";
import {
  UpstreamContractTracker,
  type JobStore,
  type RunSyncDeps,
  type StaleSource,
  type UpstreamStream,
} from "@ever-hust/triggers/ingest";
import { TruncatedStreamError } from "@ever-hust/jobs-api";
import { handleJobsSync, MAX_SYNC_DEADLINE_MS, syncRequestSchema } from "./jobs-sync-route";

/**
 * The `SCHEDULER=cron` CronJobs (`.deploy/k8s/sync-cronjob.yaml`, `sync-full-cronjob.yaml`; spec
 * 01a, PR #106 review). The route answers 200 once its stream starts, so a Job that only looks at
 * the HTTP status (`curl -f`) is green on a failed run. These tests pin the manifests' budgets and
 * run their check scripts (with a stub `curl`) against what the real route streams.
 */

const ROOT = resolve(__dirname, "../../..");
const manifest = (name: string) => readFileSync(join(ROOT, ".deploy/k8s", name), "utf8");

/** The `sh -c` script: the `- |` block scalar under `command:`, de-indented. */
function scriptOf(yaml: string): string {
  const lines = yaml.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === "- |");
  if (start < 0) throw new Error("no block scalar");
  const indent = lines[start + 1]!.match(/^ */)![0].length;
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() !== "" && line.match(/^ */)![0].length < indent) break;
    body.push(line.slice(indent));
  }
  return body.join("\n");
}

function field(yaml: string, key: string): string {
  const m = yaml.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, "m"));
  if (!m) throw new Error(`no ${key}`);
  return m[1]!.trim().replace(/^"(.*)"$/, "$1");
}

/** The JSON the script POSTs (`-d '…'`), and curl's `-m`. */
function request(script: string): { body: Record<string, unknown>; maxTimeS: number } {
  const body = script.match(/-d '(\{[^']*\})'/);
  const maxTime = script.match(/curl [^\n]*-m (\d+)/);
  if (!body || !maxTime) throw new Error("no request");
  return { body: JSON.parse(body[1]!) as Record<string, unknown>, maxTimeS: Number(maxTime[1]) };
}

const FULL = manifest("sync-full-cronjob.yaml");
const KEYWORDS = manifest("sync-cronjob.yaml");

describe("the SCHEDULER=cron CronJobs: budgets and requests", () => {
  it("the full sync has its own six-hour CronJob, in mode full", () => {
    const script = scriptOf(FULL);
    const { body, maxTimeS } = request(script);
    expect(field(FULL, "name")).toBe("hust-jobs-sync-full");
    expect(field(FULL, "schedule")).toBe("20 */6 * * *"); // the Trigger full schedule
    expect(field(FULL, "suspend")).toBe("true"); // Trigger.dev stays the active scheduler
    expect(field(FULL, "concurrencyPolicy")).toBe("Forbid");
    expect(field(FULL, "backoffLimit")).toBe("0"); // spec D7: a retry would re-scrape every source
    expect(body.mode).toBe("full");
    expect(syncRequestSchema.safeParse(body).success).toBe(true);
    // The route stops before curl gives up, and curl before the Job's deadline (pod start-up included).
    const deadlineMs = body.deadlineMs as number;
    expect(deadlineMs).toBeLessThanOrEqual(MAX_SYNC_DEADLINE_MS);
    expect(deadlineMs).toBeGreaterThanOrEqual(55 * 60_000); // a full crawl, not the 300 s of the old CronJob
    expect(deadlineMs + 15_000).toBeLessThanOrEqual(maxTimeS * 1000);
    expect(maxTimeS + 60).toBeLessThanOrEqual(Number(field(FULL, "activeDeadlineSeconds")));
  });

  it("the keyword sync says its mode and budget too", () => {
    const { body, maxTimeS } = request(scriptOf(KEYWORDS));
    expect(field(KEYWORDS, "schedule")).toBe("*/15 * * * *");
    expect(body).toEqual({ mode: "keywords", deadlineMs: 550_000 });
    expect(syncRequestSchema.safeParse(body).success).toBe(true);
    expect((body.deadlineMs as number) + 15_000).toBeLessThanOrEqual(maxTimeS * 1000);
    expect(maxTimeS + 60).toBeLessThanOrEqual(Number(field(KEYWORDS, "activeDeadlineSeconds")));
    expect(maxTimeS).toBeLessThan(15 * 60); // done before the next tick
  });

  it("both check the stream's summary line instead of trusting the HTTP status", () => {
    for (const script of [scriptOf(FULL), scriptOf(KEYWORDS)]) {
      expect(script).not.toMatch(/curl -f/);
      expect(script).toContain(`grep '^{"type":"summary"'`);
      expect(script).toContain(`'{"type":"summary","ok":true,'*) ;;`);
    }
    expect(scriptOf(FULL)).toContain(`*'"staleSources":[{'*)`);
  });
});

// ---------------------------------------------------------------------------
// The scripts, run against the real route's output (needs a POSIX `sh`)
// ---------------------------------------------------------------------------

const hasSh = spawnSync("sh", ["-c", "exit 0"], { encoding: "utf8" }).status === 0;
const withSh = hasSh ? describe : describe.skip;

const job = (id: string): JobStreamEvent => ({ type: "job", job: { id, site: "lever", title: `Title ${id}` } });

function streamOf(events: JobStreamEvent[], failWith?: Error): UpstreamStream {
  return {
    legacy: false,
    async *[Symbol.asyncIterator]() {
      for (const e of events) yield e;
      if (failWith) throw failWith;
    },
  };
}

function store(stale: StaleSource[] = []): JobStore {
  return {
    findExisting: async () => new Map(),
    findDedupCandidates: async () => [],
    findDedupKeys: async () => [],
    findWriteNeeds: async () => new Map(),
    refreshLastSeen: async () => [],
    findCoordsForLocations: async () => new Map(),
    upsertBatch: async (rows) => rows.map((r) => ({ externalId: r.externalId, inserted: true })),
    findStaleSources: async () => stale,
  };
}

/** What `POST /api/jobs/sync` answers (status + body) for this upstream and store. */
async function routeOutput(
  mode: "full" | "keywords",
  upstream: () => UpstreamStream,
  opts: { stale?: StaleSource[]; secret?: string; contract?: "v1" | "unknown" } = {},
): Promise<{ status: number; body: string }> {
  const env = process.env as Record<string, string | undefined>;
  const saved = env.CRON_SECRET;
  env.CRON_SECRET = "s3cret";
  try {
    const tracker = new UpstreamContractTracker();
    if ((opts.contract ?? "v1") === "v1") tracker.observe(false);
    const res = await handleJobsSync(
      new Request("http://localhost/api/jobs/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.secret ?? "s3cret"}` },
        body: JSON.stringify({ mode }),
      }),
      {
        openGraceMs: 1_000,
        heartbeatMs: 60_000,
        logger: { error: () => {} },
        inFlight: new Map(),
        upstreamContract: tracker,
        createRunDeps: (onProgress): RunSyncDeps => ({
          openStream: async () => upstream(),
          store: store(opts.stale),
          geocode: null,
          geocodeMaxCalls: 0,
          batchSize: 2,
          logger: { info: () => {}, warn: () => {}, error: () => {} },
          onProgress,
          upstreamContract: tracker,
        }),
      },
    );
    return { status: res.status, body: await res.text() };
  } finally {
    if (saved === undefined) delete env.CRON_SECRET;
    else env.CRON_SECRET = saved;
  }
}

withSh("the CronJob check scripts, run with a stub curl against the route's real output", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "hust-cronjob-"));
    // The stub: records its arguments, writes the canned body to `-o`, prints the status for `-w`.
    const stub = [
      "#!/bin/sh",
      'printf "%s\\n" "$@" > "$STUB_DIR/args"',
      'out=""',
      'while [ $# -gt 0 ]; do case "$1" in -o) out="$2"; shift 2 ;; *) shift ;; esac; done',
      'cp "$STUB_DIR/body" "$out"',
      'printf "%s" "$STUB_STATUS"',
      'exit "${STUB_EXIT:-0}"',
      "",
    ].join("\n");
    writeFileSync(join(dir, "curl"), stub);
    chmodSync(join(dir, "curl"), 0o755);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  function run(yaml: string, out: { status: number; body: string }, curlExit = 0) {
    const script = scriptOf(yaml);
    expect(script.split("/tmp/jobs-sync.ndjson")).toHaveLength(2);
    writeFileSync(join(dir, "body"), out.body);
    // As a file (`sh -c` would take it through the platform's argument quoting).
    writeFileSync(join(dir, "check.sh"), script.replace("/tmp/jobs-sync.ndjson", `${dir.replace(/\\/g, "/")}/out.ndjson`));
    // The stub first on the search path (whatever the variable's case: `Path` on Windows).
    const inherited = Object.entries(process.env);
    const searchPath = inherited.find(([k]) => k.toUpperCase() === "PATH")?.[1] ?? "";
    const env: Record<string, string | undefined> = {
      ...Object.fromEntries(inherited.filter(([k]) => k.toUpperCase() !== "PATH")),
      PATH: `${dir}${delimiter}${searchPath}`,
      STUB_DIR: dir.replace(/\\/g, "/"),
      STUB_STATUS: String(out.status),
      STUB_EXIT: String(curlExit),
      CRON_SECRET: "the-secret",
    };
    const result = spawnSync("sh", [join(dir, "check.sh").replace(/\\/g, "/")], {
      encoding: "utf8",
      env: env as NodeJS.ProcessEnv,
    });
    return { code: result.status, log: `${result.stdout}${result.stderr}` };
  }

  const complete: JobStreamEvent = { type: "end", total: 2, legacy: false, complete: true, sourcesFailed: 0 };
  const partial: JobStreamEvent = { type: "end", total: 2, legacy: false, complete: false, stopReason: "deadline", sourcesSkipped: 3 };
  const stale = [{ site: "workday", lastSeen: "2026-09-01T00:00:00Z", rows: 12 }];

  it("passes an ok run, and sends the full mode with the secret from the environment", async () => {
    const out = await routeOutput("full", () => streamOf([job("a"), job("b"), complete]));
    expect(out.status).toBe(200);
    const { code, log } = run(FULL, out);
    expect(log).toContain('"ok":true');
    expect(code).toBe(0);
    const args = readFileSync(join(dir, "args"), "utf8");
    expect(args).toContain("Authorization: Bearer the-secret");
    expect(args).toContain('{"mode":"full","deadlineMs":3550000}');
    expect(log).not.toContain("the-secret");
  });

  it("FAILS on HTTP 200 whose summary line says ok:false (what curl -f cannot see)", async () => {
    const out = await routeOutput("full", () =>
      streamOf([job("a")], new TruncatedStreamError("missing_end", "Ever Jobs stream ended without its end line", 1)),
    );
    expect(out.status).toBe(200);
    expect(out.body).toContain('"type":"summary","ok":false');
    for (const yaml of [FULL, KEYWORDS]) {
      const { code, log } = run(yaml, out);
      expect(code).toBe(1);
      expect(log).toContain("FAILED: the sync reported ok:false");
    }
  });

  it("FAILS when the stream ends without its summary line", async () => {
    const out = await routeOutput("full", () => streamOf([job("a"), complete]));
    const cut = { status: 200, body: out.body.split("\n").filter((l) => !l.includes('"type":"summary"')).join("\n") };
    expect(cut.body).toContain('"type":"start"');
    const { code, log } = run(FULL, cut);
    expect(code).toBe(1);
    expect(log).toContain("without a summary line");
  });

  it("FAILS on a non-2xx answer and on a curl error", async () => {
    const refused = await routeOutput("full", () => streamOf([complete]), { secret: "wrong" });
    expect(refused.status).toBe(401);
    expect(run(FULL, refused)).toMatchObject({ code: 1 });
    const ok = await routeOutput("full", () => streamOf([job("a"), complete]));
    const timedOut = run(FULL, ok, 28);
    expect(timedOut.code).toBe(1);
    expect(timedOut.log).toContain("curl exit 28");
  });

  it("FAILS when a source went unseen for days while the crawl was not complete (spec D27)", async () => {
    const out = await routeOutput("full", () => streamOf([job("a"), partial]), { stale });
    expect(out.body).toContain('"ok":true');
    const { code, log } = run(FULL, out);
    expect(code).toBe(1);
    expect(log).toContain("spec 01a D27");
  });

  it("only WARNS about an unseen source after a complete crawl with no failed source", async () => {
    const out = await routeOutput("full", () => streamOf([job("a"), complete]), { stale });
    const { code, log } = run(FULL, out);
    expect(log).toContain("WARNING");
    expect(code).toBe(0);
    // Control: the same stale source with a failed source is the alarm again.
    const failedSource = await routeOutput("full", () => streamOf([job("a"), { ...complete, sourcesFailed: 2 } as JobStreamEvent]), { stale });
    expect(run(FULL, failedSource).code).toBe(1);
  });

  it("passes a partial crawl without stale sources, and a skipped full run (gated off, spec D18)", async () => {
    const partialRun = await routeOutput("full", () => streamOf([job("a"), partial]));
    expect(run(FULL, partialRun).code).toBe(0);
    const skipped = await routeOutput("full", () => streamOf([complete]), { contract: "unknown" });
    expect(skipped.body).toContain('"skipped"');
    expect(run(FULL, skipped).code).toBe(0);
  });

  it("the keyword CronJob passes an ok keyword run", async () => {
    const out = await routeOutput("keywords", () => streamOf([job("a"), complete]));
    const { code, log } = run(KEYWORDS, out);
    expect(code).toBe(0);
    expect(readFileSync(join(dir, "args"), "utf8")).toContain('{"mode":"keywords","deadlineMs":550000}');
    expect(log).toContain("[jobs-sync] ok");
  });
});
