import { randomBytes } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import * as postgresModule from "postgres";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@ever-hust/db/schema";
import type { Database } from "@ever-hust/db";
import type { JobPostDto, JobStreamEvent } from "@ever-hust/jobs-api";
import { buildSyncPlan, type SyncEnvConfig } from "./config";
import type { GeocodeFn } from "./geocoder";
import { errorText } from "./errors";
import { DEDUP_CANDIDATE_PAGE_ROWS, MAX_DEDUP_PROBE_CACHE_ROWS } from "./ingestor";
import { createDrizzleJobStore, type JobStore } from "./job-store";
import { runJobsSync, type UpstreamStream } from "./run-sync";

/**
 * Opt-in integration test of the Drizzle store + ingest core against a REAL Postgres
 * (the SQL the unit tests only assert by shape: the skip-unchanged upsert, RETURNING xmax,
 * the stored-coordinate reuse query and the dedup-candidate probe).
 *
 *   JOBS_SYNC_IT_DATABASE_URL=postgres://postgres@127.0.0.1:55439/hust_it
 *
 * The database must be a throwaway one whose name ends in `_it` or `_test` (the test TRUNCATEs
 * `jobs`); the schema must already be pushed (`DATABASE_URL=… pnpm db:push`). Skipped when unset.
 */

// `postgres` is CommonJS (`export =`); jest runs without esModuleInterop, tsc with it.
type Sql = import("postgres").Sql;
const postgres = ((postgresModule as unknown as { default?: unknown }).default ??
  postgresModule) as unknown as (url: string, options?: Record<string, unknown>) => Sql;

const url = process.env.JOBS_SYNC_IT_DATABASE_URL;
const dbName = url ? new URL(url).pathname.replace(/^\//, "") : "";
const enabled = Boolean(url) && /(_it|_test)$/.test(dbName);
const suite = enabled ? describe : describe.skip;

const ENV: SyncEnvConfig = {
  fullResultsPerSource: 1000,
  keywordResultsPerSource: 100,
  keywordSiteCategories: ["job-board"],
  geocodeMaxCalls: 100,
  keywordGeocodeMaxCalls: 100,
};
const quiet = { info: () => {}, warn: () => {}, error: () => {} };

/**
 * Jest timeout of the tests that load or sync hundreds to tens of thousands of rows: the default
 * 5 s is too little on a slow CI runner (the spec D29 test ran out of it there).
 */
const HEAVY_TEST_TIMEOUT_MS = 120_000;

function job(id: string, extra: Partial<JobPostDto> = {}): JobPostDto {
  return {
    id,
    site: "greenhouse",
    title: `Engineer ${id}`,
    companyName: "Acme",
    location: { city: "Austin", state: "TX", country: "USA" },
    datePosted: "2026-09-01T00:00:00.000Z",
    ...extra,
  };
}

function streamOf(jobs: JobPostDto[]): UpstreamStream {
  const events: JobStreamEvent[] = [
    ...jobs.map((j) => ({ type: "job" as const, job: j })),
    { type: "end", total: jobs.length, legacy: false },
  ];
  return {
    async *[Symbol.asyncIterator]() {
      for (const e of events) yield e;
    },
  };
}

suite("job store against Postgres (opt-in)", () => {
  let client: Sql;
  let db: Database;
  let geocodeCalls: string[] = [];
  const geocode: GeocodeFn = async (address) => {
    geocodeCalls.push(address);
    return { status: "ok", coords: { latitude: "30.2672", longitude: "-97.7431" } };
  };

  const syncWith = (store: JobStore, jobs: JobPostDto[], batchSize = 2) =>
    runJobsSync(buildSyncPlan({ mode: "full" }, ENV, Date.now(), "v1"), {
      openStream: async () => streamOf(jobs),
      store,
      geocode,
      geocodeMaxCalls: 100,
      batchSize,
      logger: quiet,
    });
  const sync = (jobs: JobPostDto[], batchSize = 2) => syncWith(createDrizzleJobStore(db), jobs, batchSize);

  /** Rows whose xmax is set: rewritten, deleted, or LOCKED by an ON CONFLICT that did not update. */
  const lockedOrTouched = async () =>
    (await client<Array<{ n: number }>>`SELECT count(*)::int AS n FROM jobs WHERE xmax::text <> '0'`)[0]!.n;
  const toastBytes = async () =>
    Number(
      (
        await client<Array<{ b: string }>>`
          SELECT pg_relation_size(reltoastrelid)::text AS b FROM pg_class WHERE relname = 'jobs' AND relkind = 'r'`
      )[0]!.b,
    );
  const walBytesSince = async (lsn: string) =>
    Number((await client<Array<{ d: string }>>`SELECT pg_wal_lsn_diff(pg_current_wal_insert_lsn(), ${lsn}::pg_lsn)::text AS d`)[0]!.d);
  const walNow = async () => (await client<Array<{ l: string }>>`SELECT pg_current_wal_insert_lsn()::text AS l`)[0]!.l;

  const rowVersions = async () =>
    Object.fromEntries(
      (
        await client<Array<{ external_id: string; xmin: string }>>`
          SELECT external_id, xmin::text AS xmin FROM jobs ORDER BY external_id`
      ).map((r) => [r.external_id, r.xmin]),
    );

  beforeAll(() => {
    client = postgres(url!, { prepare: false, max: 2, onnotice: () => {} });
    db = drizzle(client, { schema }) as unknown as Database;
  });

  afterAll(async () => {
    await client?.end({ timeout: 5 });
  });

  beforeEach(async () => {
    geocodeCalls = [];
    await client`TRUNCATE jobs RESTART IDENTITY CASCADE`;
  });

  it("inserts, then leaves an unchanged corpus untouched (no tuple rewritten), then updates only what changed", async () => {
    const first = await sync([
      job("a", { careerLevel: { level: "new_grad", confidence: "high" }, dedupKey: "k-a" }),
      job("b"),
      job("c"),
    ]);
    expect(first).toMatchObject({ ok: true, inserted: 3, updated: 0, unchanged: 0 });
    // One Google call for the shared location, the other rows reuse it.
    expect(geocodeCalls).toEqual(["Austin, TX, USA"]);

    const stored = await client`SELECT job_level, raw_data->>'dedupKey' AS dedup, latitude::text AS lat FROM jobs WHERE external_id = 'a'`;
    expect(stored[0]).toMatchObject({ job_level: "new_grad", dedup: "k-a", lat: "30.2672" });

    const before = await rowVersions();
    const second = await sync([
      job("a", { careerLevel: { level: "new_grad", confidence: "high" }, dedupKey: "k-a" }),
      job("b"),
      job("c"),
    ]);
    expect(second).toMatchObject({ ok: true, inserted: 0, updated: 0, unchanged: 3 });
    expect(await rowVersions()).toEqual(before); // xmin unchanged ⇒ no rewrite at all
    expect(geocodeCalls).toHaveLength(1); // stored coordinates kept, no new call

    const third = await sync([
      job("a", { careerLevel: { level: "new_grad", confidence: "high" }, dedupKey: "k-a" }),
      job("b", { title: "Staff Engineer b" }),
      job("c"),
    ]);
    expect(third).toMatchObject({ inserted: 0, updated: 1, unchanged: 2 });
    const after = await rowVersions();
    expect(after.a).toBe(before.a);
    expect(after.b).not.toBe(before.b);
    expect(after.c).toBe(before.c);
    const coords = await client`SELECT latitude::text AS lat FROM jobs WHERE external_id = 'b'`;
    expect(coords[0]!.lat).toBe("30.2672"); // coalesce kept the stored coordinates
  });

  it("refreshes a stale last-seen marker once, even when nothing else changed", async () => {
    await sync([job("a")]);
    await client`UPDATE jobs SET updated_at = now() - interval '30 days' WHERE external_id = 'a'`;
    const refreshed = await sync([job("a")]);
    expect(refreshed).toMatchObject({ updated: 1, unchanged: 0 });
    const again = await sync([job("a")]);
    expect(again).toMatchObject({ updated: 0, unchanged: 1 });
  });

  it("merges a new external id onto the stored row that owns its dedupKey (no second row)", async () => {
    await sync([job("lever-1", { site: "lever", dedupKey: "acme|eng|austin", jobUrl: "https://old" })]);
    const owner = await client`SELECT id FROM jobs WHERE external_id = 'lever-1'`;

    const merged = await sync([
      job("greenhouse-9", { title: "Engineer lever-1", dedupKey: "acme|eng|austin", jobUrl: "https://new" }),
    ]);
    expect(merged).toMatchObject({ ok: true, inserted: 0, duplicatesMerged: 1, mergedWrites: 0 });
    const rows = await client`SELECT id, external_id, job_url, raw_data->>'id' AS source_id FROM jobs`;
    expect(rows).toHaveLength(1);
    // The owner was refreshed recently: its content is kept (spec D2).
    expect(rows[0]).toMatchObject({
      id: owner[0]!.id,
      external_id: "lever-1",
      job_url: "https://old",
      source_id: "lever-1",
    });
  });

  it("keeps stored liveness / legitimacy verdicts when a run did not request signals (no rewrite)", async () => {
    const withSignals = job("sig", {
      liveness: { state: "active" },
      legitimacy: { state: "verified", reasons: ["ats-direct"] },
    } as Partial<JobPostDto>);
    await sync([withSignals]);
    const v = await rowVersions();

    const plain = await sync([job("sig")]); // signals off: the DTO carries none
    expect(plain).toMatchObject({ ok: true, updated: 0, unchanged: 1 });
    expect(await rowVersions()).toEqual(v);
    const kept = await client`SELECT liveness, legitimacy, legitimacy_reasons FROM jobs WHERE external_id = 'sig'`;
    expect(kept[0]).toMatchObject({ liveness: "active", legitimacy: "verified", legitimacy_reasons: ["ats-direct"] });

    // A new verdict still lands, and its reasons replace the old ones.
    const newer = await sync([job("sig", { liveness: { state: "expired" }, legitimacy: { state: "uncertain" } } as Partial<JobPostDto>)]);
    expect(newer).toMatchObject({ updated: 1 });
    const after = await client`SELECT liveness, legitimacy, legitimacy_reasons FROM jobs WHERE external_id = 'sig'`;
    expect(after[0]).toMatchObject({ liveness: "expired", legitimacy: "uncertain", legitimacy_reasons: null });
  });

  it("does not flip a row between two sources of the same posting (A, B, A, B keeps one tuple)", async () => {
    const A = job("gh-9", { site: "greenhouse", dedupKey: "acme|eng|austin", jobUrl: "https://ats/gh-9", description: "full ATS copy" });
    const B = job("in-1", { site: "indeed", title: "Engineer gh-9", dedupKey: "acme|eng|austin", jobUrl: "https://board/in-1", description: "short" });

    const r1 = await sync([A]);
    expect(r1).toMatchObject({ ok: true, inserted: 1 });
    const v1 = await rowVersions();

    const r2 = await sync([B]);
    const r3 = await sync([A]);
    const r4 = await sync([B]);
    for (const r of [r2, r4]) {
      expect(r).toMatchObject({ ok: true, inserted: 0, updated: 0, duplicatesMerged: 1, mergedWrites: 0 });
    }
    expect(r3).toMatchObject({ ok: true, inserted: 0, updated: 0, unchanged: 1 });
    expect(await rowVersions()).toEqual(v1); // xmin stable: no rewrite after the first run

    const rows = await client`SELECT site, job_url, description, raw_data->>'id' AS source_id FROM jobs`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ site: "greenhouse", job_url: "https://ats/gh-9", description: "full ATS copy", source_id: "gh-9" });
  });

  it("finds the owner through the two-step probe when the company differs only by its suffix", async () => {
    await sync([job("gh-1", { title: "Quant Researcher", companyName: "Acme", dedupKey: "acme|quant|austin" })]);
    // Another employer's postings under the same exact title must not have their keys read.
    await sync([job("other-1", { title: "Quant Researcher", companyName: "Globex", dedupKey: "globex|quant|austin" })]);
    const res = await sync([job("in-7", { site: "indeed", title: "Quant Researcher", companyName: "Acme, Inc.", dedupKey: "acme|quant|austin" })]);
    expect(res).toMatchObject({ ok: true, inserted: 0, duplicatesMerged: 1 });
    const n = await client`SELECT count(*)::int AS n FROM jobs`;
    expect(n[0]!.n).toBe(2);
  });

  it("lets another source take over a row its owner has not refreshed for the takeover window", async () => {
    const A = job("gh-9", { dedupKey: "acme|eng|austin", jobUrl: "https://ats/gh-9" });
    const B = job("in-1", { site: "indeed", title: "Engineer gh-9", dedupKey: "acme|eng|austin", jobUrl: "https://board/in-1" });
    await sync([A]);
    await client`UPDATE jobs SET updated_at = now() - interval '30 days'`;

    const takeover = await sync([B]);
    expect(takeover).toMatchObject({ ok: true, duplicatesMerged: 1, mergedWrites: 1, updated: 0 });
    // (a day of tolerance: updated_at is a timestamp without time zone written from JS)
    const rows = await client`SELECT external_id, site, job_url, raw_data->>'id' AS source_id, updated_at > (now() - interval '1 day')::timestamp AS fresh FROM jobs`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ external_id: "gh-9", site: "indeed", job_url: "https://board/in-1", source_id: "in-1", fresh: true });

    const v = await rowVersions();
    expect(await sync([B])).toMatchObject({ duplicatesMerged: 1, mergedWrites: 0 });
    expect(await rowVersions()).toEqual(v);

    // The owner source returns: its own id wins the content back (one rewrite).
    expect(await sync([A])).toMatchObject({ updated: 1 });
    const back = await client`SELECT site, raw_data->>'id' AS source_id FROM jobs`;
    expect(back[0]).toMatchObject({ site: "greenhouse", source_id: "gh-9" });
  });

  it("reuses coordinates stored for the same normalised location instead of calling Google", async () => {
    await client`
      INSERT INTO jobs (external_id, site, title, location_city, location_state, location_country, latitude, longitude)
      VALUES ('seed', 'x', 'Seed', ' austin ', 'tx', 'usa', 30.1, -97.1)`;
    const res = await sync([job("new")]);
    expect(res).toMatchObject({ inserted: 1, geocodeCalls: 0, geocodeReused: 1 });
    expect(geocodeCalls).toEqual([]);
    const rows = await client`SELECT latitude::text AS lat FROM jobs WHERE external_id = 'new'`;
    expect(rows[0]!.lat).toBe("30.1");
  });

  it("handles a batch of 250 with mixed nulls in one statement", async () => {
    const jobs = Array.from({ length: 250 }, (_, i) =>
      job(`bulk-${String(i).padStart(3, "0")}`, i % 2 ? { location: undefined, datePosted: undefined } : {}),
    );
    const res = await sync(jobs, 250);
    expect(res).toMatchObject({ ok: true, received: 250, inserted: 250, errors: 0 });
    const count = await client`SELECT count(*)::int AS n FROM jobs`;
    expect(count[0]!.n).toBe(250);
    // Jobs-writer rule: one INSERT, so one statement_timestamp() for every row, stored as UTC
    // (the bound pins TimeZone, whatever the server's default) and never after this read.
    const stamps = await client`
      SELECT count(DISTINCT created_at)::int AS n,
             bool_and(created_at BETWEEN (now() AT TIME ZONE 'UTC') - interval '2 minutes' AND (now() AT TIME ZONE 'UTC')) AS recent
      FROM jobs`;
    expect(stamps[0]).toMatchObject({ n: 1, recent: true });
  }, HEAVY_TEST_TIMEOUT_MS);

  it("keeps the first insert's created_at when a later run rewrites the row", async () => {
    await sync([job("a")]);
    const first = await client`SELECT created_at::text AS c FROM jobs WHERE external_id = 'a'`;
    await client`SELECT pg_sleep(0.05)`;
    expect(await sync([job("a", { title: "Staff Engineer a" })])).toMatchObject({ updated: 1 });
    const second = await client`SELECT created_at::text AS c, title FROM jobs WHERE external_id = 'a'`;
    expect(second[0]).toMatchObject({ c: first[0]!.c, title: "Staff Engineer a" });
  });

  // --- review round of 2026-09-26 -------------------------------------------------------------

  it("keeps one source's two postings that share a dedupKey, across runs; another source's copy merges (spec D23, E2E R1)", async () => {
    const key = "jane street|software engineer|new york";
    const js = (id: string, extra: Partial<JobPostDto> = {}) =>
      job(id, { title: "Software Engineer", companyName: "Jane Street", location: { city: "New York", state: "NY" }, dedupKey: key, ...extra });
    expect(await sync([js("js-intern", { employmentType: "internship" })])).toMatchObject({ inserted: 1 });
    const second = await sync([js("js-intern", { employmentType: "internship" }), js("js-newgrad", { employmentType: "new_grad" })]);
    expect(second).toMatchObject({ ok: true, inserted: 1, unchanged: 1, duplicatesMerged: 0 });
    const board = await sync([js("in-1", { site: "indeed" })]);
    expect(board).toMatchObject({ ok: true, inserted: 0, duplicatesMerged: 1, mergedWrites: 0 });
    const rows = await client`SELECT external_id, employment_type FROM jobs ORDER BY external_id`;
    expect(rows.map((r) => [r.external_id, r.employment_type])).toEqual([
      ["js-intern", "internship"],
      ["js-newgrad", "new_grad"],
    ]);
  });

  it("an unchanged re-sync neither rewrites NOR locks a row (xmax stays 0); bypassing the read-ahead locks them all (spec D24)", async () => {
    const corpus = Array.from({ length: 40 }, (_, i) =>
      job(`u-${String(i).padStart(2, "0")}`, {
        isRemote: i % 2 === 0,
        jobType: ["fulltime", "internship"],
        skills: ["go", "sql"],
        compensation: { minAmount: 100000 + i, maxAmount: 150000.5, currency: "USD", interval: "yearly" },
        careerLevel: { level: "new_grad", confidence: "high" },
        dedupKey: `acme|engineer ${i}|austin`,
        expiresAt: "2026-12-31T23:59:59.000Z",
      } as Partial<JobPostDto>),
    );
    expect(await sync(corpus, 250)).toMatchObject({ ok: true, inserted: 40 });
    expect(await lockedOrTouched()).toBe(0);

    const again = await sync(corpus, 250);
    expect(again).toMatchObject({ ok: true, inserted: 0, updated: 0, unchanged: 40 });
    expect(await lockedOrTouched()).toBe(0);

    // Control: the same re-sync through the upsert alone (its WHERE is false for every row).
    const bypass: JobStore = {
      ...createDrizzleJobStore(db),
      findWriteNeeds: async () => {
        throw new Error("read-ahead bypassed");
      },
    };
    const control = await syncWith(bypass, corpus, 250);
    expect(control).toMatchObject({ ok: true, inserted: 0, updated: 0, unchanged: 40 });
    expect(await lockedOrTouched()).toBe(40);
  }, HEAVY_TEST_TIMEOUT_MS);

  it("detects a description-only change (review finding 5)", async () => {
    await sync([job("d", { description: "first text" })]);
    const v = await rowVersions();
    const res = await sync([job("d", { description: "second text" })]);
    expect(res).toMatchObject({ ok: true, updated: 1, unchanged: 0 });
    expect((await rowVersions()).d).not.toBe(v.d);
    const stored = await client`SELECT description FROM jobs WHERE external_id = 'd'`;
    expect(stored[0]!.description).toBe("second text");
  });

  it("refreshes a stale unchanged row's last-seen marker without rewriting its TOASTed content (spec D14/D24, finding 7)", async () => {
    const big = randomBytes(48 * 1024).toString("base64"); // ~64 KB, incompressible: stored out of line
    await sync([job("big", { description: big })]);
    const created = await client`SELECT created_at::text AS c FROM jobs WHERE external_id = 'big'`;
    await client`UPDATE jobs SET updated_at = (now() AT TIME ZONE 'UTC') - interval '30 days' WHERE external_id = 'big'`;

    const toast0 = await toastBytes();
    const wal0 = await walNow();
    const refreshed = await sync([job("big", { description: big })]);
    expect(refreshed).toMatchObject({ ok: true, updated: 1, unchanged: 0 });
    expect(await toastBytes()).toBe(toast0); // no new TOAST chunk
    expect(await walBytesSince(wal0)).toBeLessThan(24 * 1024); // a heap tuple (+ at most a page image), not 64 KB
    const after = await client`
      SELECT created_at::text AS c, updated_at > (now() AT TIME ZONE 'UTC') - interval '1 day' AS fresh, description = ${big} AS same
      FROM jobs WHERE external_id = 'big'`;
    expect(after[0]).toMatchObject({ c: created[0]!.c, fresh: true, same: true });
    expect(await sync([job("big", { description: big })])).toMatchObject({ updated: 0, unchanged: 1 });

    // Control: a content change does rewrite the TOASTed value.
    const wal1 = await walNow();
    expect(await sync([job("big", { description: randomBytes(48 * 1024).toString("base64") })])).toMatchObject({ updated: 1 });
    expect(await toastBytes()).toBeGreaterThan(toast0 + 48 * 1024);
    expect(await walBytesSince(wal1)).toBeGreaterThan(48 * 1024);
  });

  it("bounds every read with a statement timeout: a read waiting on a lock fails instead of hanging (spec D25)", async () => {
    await sync([job("locked")]);
    const store = createDrizzleJobStore(db, { readTimeoutMs: 300 });
    const locker = postgres(url!, { prepare: false, max: 1, onnotice: () => {} });
    try {
      await locker.begin(async (tx) => {
        await tx.unsafe("LOCK TABLE jobs IN ACCESS EXCLUSIVE MODE");
        const started = Date.now();
        const err = await store.findExisting(["locked"]).then(() => null, (e: unknown) => e);
        expect(errorText(err)).toBe("canceling statement due to statement timeout");
        expect(Date.now() - started).toBeLessThan(5_000);
      });
    } finally {
      await locker.end({ timeout: 5 });
    }
    expect((await store.findExisting(["locked"])).has("locked")).toBe(true); // the lock is gone
  });

  it("loads every stored location's newest coordinates in one read, or null above the limit (spec D26)", async () => {
    await client`
      INSERT INTO jobs (external_id, site, title, location_city, location_state, location_country, latitude, longitude, updated_at)
      VALUES ('old', 'x', 'T', 'Austin', 'TX', 'USA', 1.5, 2.5, now() - interval '10 days'),
             ('new', 'x', 'T', ' austin ', 'tx', 'usa', 30.25, -97.75, now()),
             ('ber', 'x', 'T', 'Berlin', NULL, 'DE', 52.5, 13.4, now()),
             ('none', 'x', 'T', 'Paris', NULL, 'FR', NULL, NULL, now())`;
    const store = createDrizzleJobStore(db);
    const all = await store.loadStoredCoords!(10);
    expect(all && Object.fromEntries(all)).toEqual({
      "austin|tx|usa": { latitude: "30.25", longitude: "-97.75" },
      "berlin||de": { latitude: "52.5", longitude: "13.4" },
    });
    expect(await store.loadStoredCoords!(2)).toBeNull(); // three (key, coordinates) groups
  });

  // --- finisher round of 2026-09-26 -----------------------------------------------------------

  it("one board copy absorbs at most one of an employer's postings, and none once it has rows of its own (review F1)", async () => {
    const key = "amazon|warehouse associate|seattle";
    const az = (id: string, extra: Partial<JobPostDto> = {}) =>
      job(id, { site: "amazon", title: "Warehouse Associate", companyName: "Amazon", location: { city: "Seattle", state: "WA" }, dedupKey: key, ...extra });
    expect(await sync([az("li-1", { site: "linkedin" })])).toMatchObject({ inserted: 1 });
    const postings = [1, 2, 3, 4, 5].map((n) => az(`amzn-${n}`));
    expect(await sync(postings, 250)).toMatchObject({ ok: true, inserted: 4, duplicatesMerged: 1, mergedWrites: 0 });
    expect(await sync([...postings].reverse(), 1)).toMatchObject({ ok: true, inserted: 1, unchanged: 4, duplicatesMerged: 0 });
    expect(await sync([...postings, az("li-1", { site: "linkedin" })], 250)).toMatchObject({ ok: true, inserted: 0, unchanged: 6 });
    const ids = (await client`SELECT external_id FROM jobs ORDER BY external_id`).map((r) => r.external_id);
    expect(ids).toEqual(["amzn-1", "amzn-2", "amzn-3", "amzn-4", "amzn-5", "li-1"]);
  });

  it("stores a row again when it was deleted between the existence lookup and the read-ahead (review F3)", async () => {
    await sync([job("gone"), job("kept")]);
    const real = createDrizzleJobStore(db);
    const racing: JobStore = {
      ...real,
      findWriteNeeds: async (rows) => {
        await client`DELETE FROM jobs WHERE external_id = 'gone'`; // e.g. the daily cleanup
        return real.findWriteNeeds(rows);
      },
    };
    expect(await syncWith(racing, [job("gone"), job("kept")], 10)).toMatchObject({ ok: true, inserted: 1, unchanged: 1, errors: 0 });
    expect((await client`SELECT count(*)::int AS n FROM jobs WHERE external_id = 'gone'`)[0]!.n).toBe(1);
  });

  // --- PR #106 review (Greptile) -------------------------------------------------------------

  it("re-inserts a row deleted between the read-ahead and the last-seen refresh (spec D28)", async () => {
    const batch = () => [job("gone"), job("raced"), job("stale"), job("kept")];
    await sync(batch());
    await client`UPDATE jobs SET updated_at = (now() AT TIME ZONE 'UTC') - interval '30 days' WHERE external_id IN ('gone', 'raced', 'stale')`;
    const real = createDrizzleJobStore(db);
    const refreshed: string[][] = [];
    const racing: JobStore = {
      ...real,
      findWriteNeeds: async (rows) => {
        const needs = await real.findWriteNeeds(rows); // "gone", "raced", "stale": refresh
        // Between the two steps: the daily cleanup deletes one row, a concurrent run refreshes another.
        await client`DELETE FROM jobs WHERE external_id = 'gone'`;
        await client`UPDATE jobs SET updated_at = now() AT TIME ZONE 'UTC' WHERE external_id = 'raced'`;
        return needs;
      },
      refreshLastSeen: async (ids, seenAt) => {
        const done = await real.refreshLastSeen(ids, seenAt);
        refreshed.push([...done].sort());
        return done;
      },
    };
    const before = await rowVersions();
    const run = await syncWith(racing, batch(), 10);
    expect(refreshed).toEqual([["stale"]]); // the UPDATE found neither "gone" nor a stale "raced"
    // "gone" is stored again (inserted), "raced" is left alone by the INSERT's WHERE (unchanged).
    expect(run).toMatchObject({ ok: true, inserted: 1, updated: 1, unchanged: 2, errors: 0 });
    const gone = await client`SELECT title, updated_at > (now() AT TIME ZONE 'UTC') - interval '1 day' AS fresh FROM jobs WHERE external_id = 'gone'`;
    expect(gone).toHaveLength(1);
    expect(gone[0]).toMatchObject({ title: "Engineer gone", fresh: true });
    const after = await rowVersions();
    expect(after.kept).toBe(before.kept);
    // Control: without the race the same batch writes nothing but the re-inserted row's coordinates
    // (the batch did not geocode it: its stored ones were usable until the row vanished).
    expect(await sync(batch(), 10)).toMatchObject({ ok: true, inserted: 0, updated: 1, unchanged: 3 });
    expect(await sync(batch(), 10)).toMatchObject({ ok: true, inserted: 0, updated: 0, unchanged: 4 });
  });

  it("pages a candidate set larger than the probe cache and still merges the copy (spec D29)", async () => {
    // One employer with more rows than the probe may cache; one of them is the posting the job copies.
    const rows = MAX_DEDUP_PROBE_CACHE_ROWS + 10_000;
    // One INSERT … SELECT, with the secondary indexes dropped and rebuilt around it in the same
    // transaction: building each once over 60 000 rows takes about half the time of maintaining
    // them row by row. Their definitions come from the catalog, so the table ends with exactly the
    // indexes it had (and a failure rolls the drop back).
    const indexDefs = async () =>
      (
        await client<Array<{ def: string }>>`
          SELECT pg_get_indexdef(indexrelid) AS def FROM pg_index WHERE indrelid = 'jobs'::regclass ORDER BY 1`
      ).map((r) => r.def);
    const indexesBefore = await indexDefs();
    await client.begin(async (tx) => {
      const indexes = (await tx.unsafe(`
        SELECT i.indexrelid::regclass::text AS name, pg_get_indexdef(i.indexrelid) AS def
        FROM pg_index i
        WHERE i.indrelid = 'jobs'::regclass
          AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid)`)) as unknown as Array<{
        name: string;
        def: string;
      }>;
      for (const ix of indexes) await tx.unsafe(`DROP INDEX ${ix.name}`);
      await tx.unsafe(
        `INSERT INTO jobs (external_id, site, title, company_name, location_city, raw_data, updated_at)
         SELECT 'big-' || g, 'workday', 'Role ' || (g % 5000), 'BigCo', 'City ' || g,
                jsonb_build_object('id', 'big-' || g, 'dedupKey', 'bigco|role ' || (g % 5000) || '|city ' || g),
                now() AT TIME ZONE 'UTC'
         FROM generate_series(1, $1::int) AS g`,
        [rows],
      );
      for (const ix of indexes) await tx.unsafe(ix.def);
    });
    expect(await indexDefs()).toEqual(indexesBefore); // every index is back, as it was
    await client`ANALYZE jobs`;
    const real = createDrizzleJobStore(db);
    const pages: number[] = [];
    const counting: JobStore = {
      ...real,
      findDedupCandidates: async (q) => {
        const page = await real.findDedupCandidates(q);
        pages.push(page.length);
        return page;
      },
    };
    const started = Date.now();
    const run = await syncWith(
      counting,
      [
        // "BigCo" verbatim: every stored row is a candidate of this batch; the copy of big-4242.
        job("board-1", { site: "indeed", title: "Role 4242", companyName: "BigCo", location: { city: "City 4242" }, dedupKey: "bigco|role 4242|city 4242" }),
        job("board-2", { site: "indeed", title: "Something New", companyName: "BigCo", dedupKey: "bigco|something new|x" }),
      ],
      10,
    );
    expect(run).toMatchObject({ ok: true, received: 2, duplicatesMerged: 1, inserted: 1, errors: 0 });
    expect(pages.reduce((a, b) => a + b, 0)).toBe(rows); // every candidate read …
    expect(Math.max(...pages)).toBeLessThanOrEqual(DEDUP_CANDIDATE_PAGE_ROWS); // … one page at a time
    const ids = await client`SELECT external_id FROM jobs WHERE external_id LIKE 'board-%' ORDER BY 1`;
    expect(ids.map((r) => r.external_id)).toEqual(["board-2"]); // board-1 merged onto big-4242
    expect(Date.now() - started).toBeLessThan(30_000);
  }, HEAVY_TEST_TIMEOUT_MS);

  it("the last-seen refresh locks its rows in external_id byte order, as the upsert does (review F4)", async () => {
    // Byte order: "Zeta" < "_mid" < "alpha". A linguistic collation (and this insertion order)
    // puts "alpha" first, which is where a plain UPDATE … WHERE external_id IN (…) starts locking.
    await client`
      INSERT INTO jobs (external_id, site, title, updated_at)
      VALUES ('alpha', 'x', 'T', (now() AT TIME ZONE 'UTC') - interval '30 days'),
             ('_mid', 'x', 'T', (now() AT TIME ZONE 'UTC') - interval '30 days'),
             ('Zeta', 'x', 'T', (now() AT TIME ZONE 'UTC') - interval '30 days')`;
    const store = createDrizzleJobStore(db, { refreshTimeoutMs: 20_000 });
    const locker = postgres(url!, { prepare: false, max: 1, onnotice: () => {} });
    const checker = postgres(url!, { prepare: false, max: 1, onnotice: () => {} });
    try {
      let pending: Promise<string[]> | undefined;
      await locker.begin(async (tx) => {
        await tx.unsafe("SELECT 1 FROM jobs WHERE external_id = '_mid' FOR UPDATE");
        pending = store.refreshLastSeen(["alpha", "_mid", "Zeta"], new Date());
        // Wait until the refresh is blocked on "_mid".
        for (let i = 0; i < 100; i++) {
          const waiting = await checker`
            SELECT count(*)::int AS n FROM pg_stat_activity
            WHERE wait_event_type = 'Lock' AND query ILIKE 'update "jobs"%'`;
          if (waiting[0]!.n > 0) break;
          await new Promise((r) => setTimeout(r, 50));
        }
        // What the refresh already holds: the rows before "_mid" in byte order, i.e. "Zeta" only.
        const free = (await checker.begin((c) =>
          c.unsafe("SELECT external_id FROM jobs WHERE external_id IN ('alpha', 'Zeta') FOR UPDATE SKIP LOCKED"),
        )) as unknown as Array<{ external_id: string }>;
        expect(free.map((r) => r.external_id)).toEqual(["alpha"]);
      });
      expect((await pending!).sort()).toEqual(["Zeta", "_mid", "alpha"]);
    } finally {
      await locker.end({ timeout: 5 });
      await checker.end({ timeout: 5 });
    }
  });

  it("lists the sources no sync has seen for STALE_SOURCE_DAYS, with their last-seen time in UTC (spec D27, review F2)", async () => {
    await sync([job("wd-1", { site: "workday" }), job("wd-2", { site: "Workday " }), job("gh-1")]);
    // Through the column's encoder, like every updated_at the sync writes.
    await db.update(schema.jobs).set({ updatedAt: new Date("2026-08-01T10:20:30.000Z") }).where(eq(schema.jobs.externalId, "wd-1"));
    await db.update(schema.jobs).set({ updatedAt: new Date("2026-07-01T00:00:00.000Z") }).where(eq(schema.jobs.externalId, "wd-2"));

    const stale = await createDrizzleJobStore(db).findStaleSources!(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), 20);
    expect(stale).toEqual([{ site: "workday", lastSeen: "2026-08-01T10:20:30Z", rows: 2 }]);

    // At the end of a full run (the stub's end line does not say complete): reported and alarming.
    const run = await sync([job("gh-2")]);
    expect(run).toMatchObject({ ok: true, complete: false, staleSources: stale });
  });
});

describe("job store integration guard", () => {
  it("only runs against a throwaway database (name ending in _it or _test)", () => {
    expect(/(_it|_test)$/.test("hust_it")).toBe(true);
    expect(/(_it|_test)$/.test("hust")).toBe(false);
  });
});
