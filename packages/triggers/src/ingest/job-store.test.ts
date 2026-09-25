import { describe, it, expect } from "@jest/globals";
import { drizzle } from "drizzle-orm/postgres-js";
import { PgDialect } from "drizzle-orm/pg-core";
import * as schema from "@ever-hust/db/schema";
import { jobsInsertSqlProblem, type Database, type JobsInsertTx } from "@ever-hust/db";
import { mapJobToDb } from "../map-job";
import {
  buildDedupCandidateQuery,
  buildDedupKeyQuery,
  buildLocationReuseQuery,
  buildUpsertQuery,
  CONTENT_COLUMNS,
  createDrizzleJobStore,
  MAX_UPSERT_ROWS_PER_STATEMENT,
  mergeMayTakeOver,
  MERGE_TAKEOVER_DAYS,
  type JobRow,
} from "./job-store";

const mockDb = () => drizzle.mock({ schema }) as unknown as Database;
/** The builder only renders SQL here; a mock database builds the same INSERT a transaction does. */
const mockTx = () => mockDb() as unknown as JobsInsertTx;

function row(id: string, extra: Partial<JobRow> = {}): JobRow {
  return { ...mapJobToDb({ id, site: "lever", title: `T ${id}` }), ...extra };
}

/**
 * A minimal postgres-js client double: records statements (and the BEGIN / COMMIT of a
 * transaction), answers queries from a queue. The jobs-insert bound (`select set_config(...)`) is
 * answered without consuming the queue.
 */
function fakeClient(responses: Array<{ rows?: unknown[]; values?: unknown[][] }>) {
  const statements: Array<{ query: string; params: unknown[] }> = [];
  const client = {
    options: { parsers: {}, serializers: {} },
    async begin(fn: (tx: unknown) => Promise<unknown>) {
      statements.push({ query: "BEGIN", params: [] });
      const value = await fn(client);
      statements.push({ query: "COMMIT", params: [] });
      return value;
    },
    unsafe(query: string, params: unknown[]) {
      statements.push({ query, params });
      const next = query.startsWith("select set_config(") ? {} : (responses.shift() ?? {});
      const promise = Promise.resolve(next.rows ?? []) as Promise<unknown[]> & {
        values: () => Promise<unknown[][]>;
      };
      promise.values = () => Promise.resolve(next.values ?? []);
      return promise;
    },
  };
  return { client, statements };
}

describe("buildUpsertQuery — one bulk statement that skips unchanged rows", () => {
  const { sql, params } = buildUpsertQuery(mockTx(), [row("a", { latitude: "1", longitude: "2" }), row("b")]).toSQL();

  it("inserts every row of the batch in one INSERT … ON CONFLICT (external_id) DO UPDATE", () => {
    expect(sql.startsWith('insert into "jobs"')).toBe(true);
    expect(sql).toContain('on conflict ("external_id") do update set');
    expect(sql.match(/insert into/g)).toHaveLength(1);
    expect(params).toContain("a");
    expect(params).toContain("b");
  });

  it("rewrites a row only WHERE its content IS DISTINCT FROM the incoming values", () => {
    const where = sql.slice(sql.indexOf(" where "));
    const current = CONTENT_COLUMNS.map((c) => `"jobs"."${c.name}"`).join(", ");
    const incoming = CONTENT_COLUMNS.map((c) => `excluded."${c.name}"`).join(", ");
    expect(where).toContain(`ELSE (${current}) IS DISTINCT FROM (${incoming})`);
    // backfills: missing coordinates and the dedup identity / career level in raw_data
    expect(where).toContain(`OR ("jobs"."latitude" IS NULL AND excluded."latitude" IS NOT NULL)`);
    expect(where).toContain(
      `OR ("jobs"."raw_data" -> 'dedupKey') IS DISTINCT FROM (excluded."raw_data" -> 'dedupKey')`,
    );
    expect(where).toContain(
      `OR ("jobs"."raw_data" -> 'careerLevel') IS DISTINCT FROM (excluded."raw_data" -> 'careerLevel')`,
    );
    // signal columns compare against their effective (sticky) incoming values
    expect(CONTENT_COLUMNS.map((c) => c.name)).not.toEqual(expect.arrayContaining(["liveness"]));
    expect(where).toContain(
      `OR ("jobs"."liveness", "jobs"."legitimacy", "jobs"."legitimacy_reasons") IS DISTINCT FROM (coalesce(excluded."liveness", "jobs"."liveness"), coalesce(excluded."legitimacy", "jobs"."legitimacy"), CASE WHEN excluded."legitimacy" IS NOT NULL THEN excluded."legitimacy_reasons" ELSE "jobs"."legitimacy_reasons" END)`,
    );
    // raw_data as a whole (volatile) is NOT part of the change test …
    expect(where).not.toMatch(/"jobs"\."raw_data"\s*\)/);
    // … but a stale last-seen marker is: the 90-day cleanup keys on updated_at.
    expect(where).toContain(`OR "jobs"."updated_at" < excluded."updated_at" - interval '7 days'`);
  });

  it("rewrites a cross-run merge row (raw_data.id ≠ external_id) only onto a stale owner", () => {
    const where = sql.slice(sql.indexOf(" where "));
    expect(where).toContain(
      `where CASE WHEN (excluded."raw_data" ->> 'id') IS NOT NULL AND (excluded."raw_data" ->> 'id') <> excluded."external_id"`,
    );
    expect(where).toContain(`THEN "jobs"."updated_at" < excluded."updated_at" - interval '${MERGE_TAKEOVER_DAYS} days'`);
    expect(MERGE_TAKEOVER_DAYS).toBe(14);
    expect(where.trimEnd()).toMatch(/END returning/);
  });

  it("never overwrites identity/created_at, and keeps stored coordinates when none were resolved", () => {
    const set = sql.slice(sql.indexOf(" do update set "), sql.indexOf(" where "));
    expect(set).not.toContain('"external_id" =');
    expect(set).not.toContain('"created_at" =');
    expect(set).not.toContain('"id" =');
    expect(set).toContain('"latitude" = coalesce(excluded."latitude", "jobs"."latitude")');
    expect(set).toContain('"longitude" = coalesce(excluded."longitude", "jobs"."longitude")');
    expect(set).toContain('"raw_data" = excluded."raw_data"');
    // signals were not necessarily requested: a missing verdict keeps the stored one
    expect(set).toContain('"liveness" = coalesce(excluded."liveness", "jobs"."liveness")');
    expect(set).toContain('"legitimacy" = coalesce(excluded."legitimacy", "jobs"."legitimacy")');
    expect(set).toContain(
      '"legitimacy_reasons" = CASE WHEN excluded."legitimacy" IS NOT NULL THEN excluded."legitimacy_reasons" ELSE "jobs"."legitimacy_reasons" END',
    );
    expect(set).toContain('"updated_at" = excluded."updated_at"');
  });

  it("returns only written rows, flagging inserts with xmax = 0", () => {
    expect(sql).toMatch(/returning "external_id", \(xmax = 0\)$/);
  });

  it("stamps created_at of EVERY row with the INSERT's statement_timestamp() (jobs-writer rule)", () => {
    expect(jobsInsertSqlProblem(sql)).toBeNull();
    const columns = sql.slice(sql.indexOf("(") + 1, sql.indexOf(")")).split(", ");
    const at = columns.indexOf('"created_at"');
    expect(at).toBeGreaterThanOrEqual(0);
    const values = sql.slice(sql.indexOf(" values ") + " values ".length, sql.indexOf(" on conflict "));
    const rows = values.slice(1, -1).split("), (").map((r) => r.split(", "));
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r).toHaveLength(columns.length);
      expect(r[at]).toBe("statement_timestamp()");
    }
    // Control: the same check fails on a row stamped any other way.
    expect(jobsInsertSqlProblem(sql.replace("statement_timestamp()", "$999"))).toMatch(/^row 1 sets created_at/);
  });
});

describe("mergeMayTakeOver", () => {
  const now = new Date("2026-09-25T00:00:00Z");
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
  it("allows a takeover only of an owner older than the takeover window", () => {
    expect(mergeMayTakeOver(daysAgo(MERGE_TAKEOVER_DAYS + 1), now)).toBe(true);
    expect(mergeMayTakeOver(daysAgo(MERGE_TAKEOVER_DAYS - 1), now)).toBe(false);
    expect(mergeMayTakeOver(daysAgo(0), now)).toBe(false);
  });
  it("never takes over when the owner's last-seen marker is unknown", () => {
    expect(mergeMayTakeOver(null, now)).toBe(false);
    expect(mergeMayTakeOver(undefined, now)).toBe(false);
    expect(mergeMayTakeOver(new Date("nope"), now)).toBe(false);
  });
});

describe("buildLocationReuseQuery", () => {
  it("looks up the newest stored coordinates per normalised location key in one query", () => {
    const { sql, params } = new PgDialect().sqlToQuery(buildLocationReuseQuery(["austin|tx|usa", "||de"]));
    expect(sql).toContain("SELECT DISTINCT ON (s.k)");
    expect(sql).toContain(`lower(btrim(coalesce("jobs"."location_city", '')))`);
    expect(sql).toContain('"jobs"."latitude" IS NOT NULL AND "jobs"."longitude" IS NOT NULL');
    expect(sql).toContain("WHERE s.k IN ($1, $2)");
    expect(sql).toContain("ORDER BY s.k, s.updated_at DESC");
    expect(params).toEqual(["austin|tx|usa", "||de"]);
  });
});

describe("buildDedupCandidateQuery", () => {
  it("narrows by the indexed title / company_name columns and never reads raw_data", () => {
    const { sql, params } = buildDedupCandidateQuery(mockDb(), ["Quant Researcher"], ["Acme"]).toSQL();
    expect(sql).toBe(
      'select "id", "external_id", "title", "company_name" from "jobs" where ("jobs"."title" in ($1) or "jobs"."company_name" in ($2))',
    );
    expect(sql).not.toContain("raw_data");
    expect(params).toEqual(["Quant Researcher", "Acme"]);
  });

  it("works with only titles", () => {
    const { sql } = buildDedupCandidateQuery(mockDb(), ["T"], []).toSQL();
    const where = sql.slice(sql.indexOf(" where "));
    expect(where).toBe(` where "jobs"."title" in ($1)`);
  });
});

describe("buildDedupKeyQuery", () => {
  it("reads raw_data->>'dedupKey' only for the given primary keys, oldest first", () => {
    const { sql, params } = buildDedupKeyQuery(mockDb(), [7, 3]).toSQL();
    expect(sql).toContain(`where ("jobs"."id" in ($1, $2) and "jobs"."raw_data" ->> 'dedupKey' IS NOT NULL)`);
    expect(sql).toContain('order by "jobs"."id" asc');
    expect(params).toEqual([7, 3]);
  });
});

describe("createDrizzleJobStore", () => {
  it("maps RETURNING rows to written rows (inserted vs updated) and skips empty batches", async () => {
    const { client, statements } = fakeClient([{ values: [["a", true], ["b", false]] }]);
    const store = createDrizzleJobStore(drizzle(client as never, { schema }) as unknown as Database);
    expect(await store.upsertBatch([])).toEqual([]);
    expect(statements).toHaveLength(0);
    const written = await store.upsertBatch([row("a"), row("b"), row("c")]);
    expect(written).toEqual([
      { externalId: "a", inserted: true },
      { externalId: "b", inserted: false },
    ]);
    // One bounded transaction holding exactly one INSERT (jobs-writer rule).
    const queries = statements.map((s) => s.query.replace(/\s+/g, " "));
    expect(queries).toHaveLength(4);
    expect(queries[0]).toBe("BEGIN");
    expect(queries[1]).toContain("set_config('statement_timeout'");
    expect(queries[2]).toMatch(/^insert into "jobs" /);
    expect(jobsInsertSqlProblem(queries[2]!)).toBeNull();
    expect(queries[3]).toBe("COMMIT");
  });

  it("refuses a batch larger than one bounded statement may hold, without touching the database", async () => {
    const { client, statements } = fakeClient([]);
    const store = createDrizzleJobStore(drizzle(client as never, { schema }) as unknown as Database);
    const rows = Array.from({ length: MAX_UPSERT_ROWS_PER_STATEMENT + 1 }, (_, i) => row(`r${i}`));
    await expect(store.upsertBatch(rows)).rejects.toThrow(RangeError);
    expect(statements).toHaveLength(0);
    // Control: exactly the cap is accepted, as one INSERT.
    const atCap = fakeClient([{ values: [] }]);
    const capped = createDrizzleJobStore(drizzle(atCap.client as never, { schema }) as unknown as Database);
    await expect(capped.upsertBatch(rows.slice(0, MAX_UPSERT_ROWS_PER_STATEMENT))).resolves.toEqual([]);
    expect(atCap.statements.filter((s) => s.query.startsWith("insert into"))).toHaveLength(1);
  });

  it("findExisting reports coordinates and the normalised location key", async () => {
    const { client } = fakeClient([
      {
        values: [
          ["x", "30.2", "-97.7", "Austin", "TX", "USA", "2026-09-01 10:00:00"],
          ["y", null, null, null, null, null, "2026-09-02 10:00:00"],
        ],
      },
    ]);
    const store = createDrizzleJobStore(drizzle(client as never, { schema }) as unknown as Database);
    const existing = await store.findExisting(["x", "y", "z"]);
    expect(existing.get("x")).toMatchObject({ externalId: "x", hasCoords: true, locationKey: "austin|tx|usa" });
    expect(existing.get("x")!.updatedAt).toBeInstanceOf(Date);
    expect(existing.get("y")).toMatchObject({ externalId: "y", hasCoords: false, locationKey: null });
    expect(existing.has("z")).toBe(false);
  });

  it("findCoordsForLocations returns string coordinates by key; no query for no keys", async () => {
    const { client, statements } = fakeClient([
      { rows: [{ key: "austin|tx|usa", latitude: 30.2, longitude: "-97.7" }] },
    ]);
    const store = createDrizzleJobStore(drizzle(client as never, { schema }) as unknown as Database);
    expect((await store.findCoordsForLocations([])).size).toBe(0);
    const coords = await store.findCoordsForLocations(["austin|tx|usa"]);
    expect(coords.get("austin|tx|usa")).toEqual({ latitude: "30.2", longitude: "-97.7" });
    expect(statements).toHaveLength(1);
  });

  it("findDedupCandidates returns narrow rows and skips the query when nothing to probe", async () => {
    const { client, statements } = fakeClient([{ values: [[1, "a", "T", "Acme"], [2, "b", "T", null]] }]);
    const store = createDrizzleJobStore(drizzle(client as never, { schema }) as unknown as Database);
    expect(await store.findDedupCandidates({ titles: [], companies: [] })).toEqual([]);
    expect(statements).toHaveLength(0);
    expect(await store.findDedupCandidates({ titles: ["T"], companies: [] })).toEqual([
      { id: 1, externalId: "a", title: "T", companyName: "Acme" },
      { id: 2, externalId: "b", title: "T", companyName: null },
    ]);
  });

  it("findDedupKeys drops rows without a key and skips the query for no ids", async () => {
    const { client, statements } = fakeClient([{ values: [[1, "a", "k1"], [2, "b", null]] }]);
    const store = createDrizzleJobStore(drizzle(client as never, { schema }) as unknown as Database);
    expect(await store.findDedupKeys([])).toEqual([]);
    expect(statements).toHaveLength(0);
    expect(await store.findDedupKeys([1, 2])).toEqual([{ id: 1, externalId: "a", dedupKey: "k1" }]);
  });
});
