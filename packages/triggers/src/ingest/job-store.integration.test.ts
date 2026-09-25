import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import * as postgresModule from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@ever-hust/db/schema";
import type { Database } from "@ever-hust/db";
import type { JobPostDto, JobStreamEvent } from "@ever-hust/jobs-api";
import { buildSyncPlan, type SyncEnvConfig } from "./config";
import type { GeocodeFn } from "./geocoder";
import { createDrizzleJobStore } from "./job-store";
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

  const sync = (jobs: JobPostDto[], batchSize = 2) =>
    runJobsSync(buildSyncPlan({ mode: "full" }, ENV, Date.now(), "v1"), {
      openStream: async () => streamOf(jobs),
      store: createDrizzleJobStore(db),
      geocode,
      geocodeMaxCalls: 100,
      batchSize,
      logger: quiet,
    });

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
    await sync([job("lever-1", { dedupKey: "acme|eng|austin", jobUrl: "https://old" })]);
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
  });

  it("keeps the first insert's created_at when a later run rewrites the row", async () => {
    await sync([job("a")]);
    const first = await client`SELECT created_at::text AS c FROM jobs WHERE external_id = 'a'`;
    await client`SELECT pg_sleep(0.05)`;
    expect(await sync([job("a", { title: "Staff Engineer a" })])).toMatchObject({ updated: 1 });
    const second = await client`SELECT created_at::text AS c, title FROM jobs WHERE external_id = 'a'`;
    expect(second[0]).toMatchObject({ c: first[0]!.c, title: "Staff Engineer a" });
  });
});

describe("job store integration guard", () => {
  it("only runs against a throwaway database (name ending in _it or _test)", () => {
    expect(/(_it|_test)$/.test("hust_it")).toBe(true);
    expect(/(_it|_test)$/.test("hust")).toBe(false);
  });
});
