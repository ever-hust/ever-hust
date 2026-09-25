import { describe, it, expect } from "@jest/globals";
import { drizzle } from "drizzle-orm/postgres-js";
import { PgDialect } from "drizzle-orm/pg-core";
import * as schema from "@ever-hust/db/schema";
import { jobsInsertSqlProblem, type Database, type JobsInsertTx } from "@ever-hust/db";
import { mapJobToDb } from "../map-job";
import {
  buildDedupCandidateQuery,
  buildDedupKeyQuery,
  buildLastSeenRefreshQuery,
  buildLocationReuseQuery,
  buildStoredCoordsQuery,
  buildUpsertQuery,
  buildWriteNeedsQuery,
  COMPARED_COLUMNS,
  CONTENT_COLUMNS,
  createDrizzleJobStore,
  MAX_UPSERT_ROWS_PER_STATEMENT,
  mergeMayTakeOver,
  MERGE_TAKEOVER_DAYS,
  newestCoordsPerKey,
  SYNC_READ_TIMEOUT_MS,
  SYNC_REFRESH_TIMEOUT_MS,
  type JobRow,
} from "./job-store";

/**
 * The columns whose change rewrites a row, spelled out: the SQL tests below must not derive their
 * expectation from CONTENT_COLUMNS itself, or dropping a column from it would pass them all
 * (review finding 5: removing `description` survived every test).
 */
const EXPECTED_CONTENT_COLUMNS = [
  "site", "title", "company_name", "company_url", "company_logo", "company_industry",
  "company_num_employees", "company_description", "job_url", "job_url_direct", "apply_url",
  "location_city", "location_state", "location_country", "is_remote", "job_type", "description",
  "skills", "department", "team", "employment_type", "job_level", "job_function", "salary_min",
  "salary_max", "salary_currency", "salary_interval", "date_posted", "expires_at",
];

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

  it("pins the content columns (every one of them makes a row count as changed)", () => {
    expect(CONTENT_COLUMNS.map((c) => c.name)).toEqual(EXPECTED_CONTENT_COLUMNS);
  });

  it("rewrites a row only WHERE its content IS DISTINCT FROM the incoming values", () => {
    const where = sql.slice(sql.indexOf(" where "));
    const current = EXPECTED_CONTENT_COLUMNS.map((c) => `"jobs"."${c}"`).join(", ");
    const incoming = EXPECTED_CONTENT_COLUMNS.map((c) => `excluded."${c}"`).join(", ");
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
    expect(sql).toMatch(/^select "id", "external_id", "site", "raw_data" ->> 'id', "raw_data" ->> 'dedupKey' from "jobs"/);
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
    expect(statements).toHaveLength(0);
    const coords = await store.findCoordsForLocations(["austin|tx|usa"]);
    expect(coords.get("austin|tx|usa")).toEqual({ latitude: "30.2", longitude: "-97.7" });
    expect(statements.filter((s) => s.query.startsWith("SELECT DISTINCT ON"))).toHaveLength(1);
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

  it("findDedupKeys returns each key with the row's source and content id; drops rows without a key", async () => {
    const { client, statements } = fakeClient([{ values: [[1, "a", "greenhouse", "a", "k1"], [2, "b", "lever", "b", null]] }]);
    const store = createDrizzleJobStore(drizzle(client as never, { schema }) as unknown as Database);
    expect(await store.findDedupKeys([])).toEqual([]);
    expect(statements).toHaveLength(0);
    expect(await store.findDedupKeys([1, 2])).toEqual([
      { id: 1, externalId: "a", site: "greenhouse", sourceId: "a", dedupKey: "k1" },
    ]);
  });
});

describe("buildWriteNeedsQuery — the upsert's WHERE, read ahead (spec D24)", () => {
  const dialect = new PgDialect();
  const withRaw = row("a", {
    rawData: { id: "a", dedupKey: "k", careerLevel: { level: "new_grad" }, description: "long text" },
    latitude: "1.5",
    longitude: "2.5",
  });
  const { sql, params } = dialect.sqlToQuery(buildWriteNeedsQuery([withRaw, row("b")]));

  it("sends the incoming rows as a typed VALUES list joined to jobs by external_id", () => {
    const names = COMPARED_COLUMNS.map((c) => `"${c.name}"`).join(", ");
    expect(sql).toContain(`) AS incoming (${names})`);
    expect(sql).toContain(`JOIN "jobs" ON "jobs"."external_id" = incoming."external_id"`);
    // every value is cast to its column's type, so incoming.x compares like the upsert's excluded.x
    expect(sql).toContain(`$1::text, $2::text, $3::text`);
    expect(sql).toMatch(/::numeric, \$\d+::jsonb, \$\d+::timestamp\), \(/);
    expect(COMPARED_COLUMNS).toHaveLength(1 + EXPECTED_CONTENT_COLUMNS.length + 3 + 3);
    expect(params).toHaveLength(2 * COMPARED_COLUMNS.length);
  });

  it("evaluates the same parts as the upsert: write = the CASE without the last-seen clause, refresh = that clause", () => {
    const current = EXPECTED_CONTENT_COLUMNS.map((c) => `"jobs"."${c}"`).join(", ");
    const incoming = EXPECTED_CONTENT_COLUMNS.map((c) => `incoming."${c}"`).join(", ");
    expect(sql).toContain(
      `CASE WHEN (incoming."raw_data" ->> 'id') IS NOT NULL AND (incoming."raw_data" ->> 'id') <> incoming."external_id" THEN "jobs"."updated_at" < incoming."updated_at" - interval '${MERGE_TAKEOVER_DAYS} days' ELSE (${current}) IS DISTINCT FROM (${incoming})`,
    );
    expect(sql).toContain(`OR ("jobs"."latitude" IS NULL AND incoming."latitude" IS NOT NULL)`);
    expect(sql).toContain(`OR ("jobs"."raw_data" -> 'dedupKey') IS DISTINCT FROM (incoming."raw_data" -> 'dedupKey')`);
    expect(sql).toContain(`OR ("jobs"."raw_data" -> 'careerLevel') IS DISTINCT FROM (incoming."raw_data" -> 'careerLevel') END`);
    expect(sql).toContain(
      `CASE WHEN (incoming."raw_data" ->> 'id') IS NOT NULL AND (incoming."raw_data" ->> 'id') <> incoming."external_id" THEN false ELSE "jobs"."updated_at" < incoming."updated_at" - interval '7 days' END`,
    );
    expect(sql).toMatch(/WHERE \(CASE .* END\) IS TRUE OR \(CASE .* END\) IS TRUE$/s);
    expect(sql).not.toMatch(/insert|update "jobs"/i);
  });

  it("sends exactly the values the INSERT sends for the same row (raw_data trimmed to the keys the predicate reads)", () => {
    const insert = buildUpsertQuery(mockTx(), [withRaw]).toSQL();
    const insertColumns = insert.sql.slice(insert.sql.indexOf("(") + 1, insert.sql.indexOf(")")).split(", ");
    const tuple = insert.sql.slice(insert.sql.indexOf(" values (") + " values (".length, insert.sql.indexOf(") on conflict"));
    const insertValues = tuple.split(", ");
    COMPARED_COLUMNS.forEach((column, i) => {
      const sent = params[i];
      if (column.name === "raw_data") {
        expect(JSON.parse(sent as string)).toEqual({ id: "a", dedupKey: "k", careerLevel: { level: "new_grad" } });
        return;
      }
      const at = insertColumns.indexOf(`"${column.name}"`);
      const placeholder = insertValues[at]!;
      expect(placeholder).toMatch(/^\$\d+$/);
      expect(sent).toEqual(insert.params[Number(placeholder.slice(1)) - 1]);
    });
  });

  it("sends NULL for coordinates a row does not carry (the INSERT's DEFAULT: neither column has one)", () => {
    const at = COMPARED_COLUMNS.findIndex((c) => c.name === "latitude");
    expect(params[COMPARED_COLUMNS.length + at]).toBeNull();
  });
});

describe("buildLastSeenRefreshQuery — the narrow weekly refresh (spec D14/D24)", () => {
  it("sets updated_at only, on the given rows, and only where it is still older than the refresh window", () => {
    const seenAt = new Date("2026-09-25T12:00:00.000Z");
    const { sql, params } = buildLastSeenRefreshQuery(mockDb(), ["a", "b"], seenAt).toSQL();
    expect(sql).toBe(
      'update "jobs" set "updated_at" = $1 where ("jobs"."external_id" in ($2, $3) and "jobs"."updated_at" < $4) returning "external_id"',
    );
    expect(params).toEqual(["2026-09-25T12:00:00.000Z", "a", "b", "2026-09-18T12:00:00.000Z"]);
  });
});

describe("buildStoredCoordsQuery / newestCoordsPerKey — one load of every stored location (spec D26)", () => {
  it("groups by location key and coordinates (no full sort), bounded by a LIMIT", () => {
    const { sql, params } = new PgDialect().sqlToQuery(buildStoredCoordsQuery(501));
    expect(sql).toContain("max(s.updated_at) AS seen");
    expect(sql).toContain(`lower(btrim(coalesce("jobs"."location_city", '')))`);
    expect(sql).toContain('"jobs"."latitude" IS NOT NULL AND "jobs"."longitude" IS NOT NULL');
    expect(sql).toContain("GROUP BY s.k, s.latitude, s.longitude");
    expect(sql).not.toContain("ORDER BY");
    expect(sql).toMatch(/LIMIT \$1$/);
    expect(params).toEqual([501]);
  });

  it("keeps, per key, the coordinates seen most recently", () => {
    const coords = newestCoordsPerKey([
      { key: "k", latitude: "1", longitude: "1", seen: "2026-09-01 00:00:00" },
      { key: "k", latitude: 2, longitude: 2, seen: new Date("2026-09-20T00:00:00Z") },
      { key: "k", latitude: "3", longitude: "3", seen: null },
      { key: "j", latitude: null, longitude: "9", seen: "2026-09-01 00:00:00" },
    ]);
    expect([...coords]).toEqual([["k", { latitude: "2", longitude: "2" }]]);
  });
});

describe("createDrizzleJobStore — statement bounds and the new calls (spec D24/D25)", () => {
  const storeOf = (responses: Parameters<typeof fakeClient>[0]) => {
    const fake = fakeClient(responses);
    return { ...fake, store: createDrizzleJobStore(drizzle(fake.client as never, { schema }) as unknown as Database) };
  };
  const shape = (statements: Array<{ query: string; params: unknown[] }>) =>
    statements.map((s) =>
      s.query.startsWith("select set_config(")
        ? `bound ${s.params[0]}`
        : s.query === "BEGIN" || s.query === "COMMIT"
          ? s.query
          : "statement",
    );

  it("runs every read in its own transaction bounded by SET LOCAL statement_timeout", async () => {
    const { store, statements } = storeOf([
      { values: [] }, // findExisting
      { values: [] }, // findDedupCandidates
      { values: [] }, // findDedupKeys
      { rows: [] }, // findWriteNeeds
      { rows: [] }, // findCoordsForLocations
      { rows: [] }, // loadStoredCoords
    ]);
    await store.findExisting(["a"]);
    await store.findDedupCandidates({ titles: ["T"], companies: [] });
    await store.findDedupKeys([1]);
    await store.findWriteNeeds([row("a")]);
    await store.findCoordsForLocations(["k"]);
    await store.loadStoredCoords!(10);
    const read = ["BEGIN", `bound ${SYNC_READ_TIMEOUT_MS}`, "statement", "COMMIT"];
    expect(shape(statements)).toEqual([...read, ...read, ...read, ...read, ...read, ...read]);
    expect(statements[1]!.query).toContain("set_config('idle_in_transaction_session_timeout', $2, true)");
  });

  it("findWriteNeeds maps the answer to write / refresh, and asks nothing for no rows", async () => {
    const { store, statements } = storeOf([
      {
        rows: [
          { external_id: "a", write: true, refresh: true },
          { external_id: "b", write: false, refresh: true },
        ],
      },
    ]);
    expect((await store.findWriteNeeds([])).size).toBe(0);
    expect(statements).toHaveLength(0);
    const needs = await store.findWriteNeeds([row("a"), row("b"), row("c")]);
    expect([...needs]).toEqual([
      ["a", "write"],
      ["b", "refresh"],
    ]);
    await expect(
      store.findWriteNeeds(Array.from({ length: MAX_UPSERT_ROWS_PER_STATEMENT + 1 }, (_, i) => row(`r${i}`))),
    ).rejects.toThrow(RangeError);
  });

  it("refreshLastSeen runs one UPDATE (ids sorted, deduplicated) bounded by its own timeout", async () => {
    const { store, statements } = storeOf([{ values: [["a"]] }]);
    expect(await store.refreshLastSeen([], new Date())).toEqual([]);
    expect(statements).toHaveLength(0);
    const refreshed = await store.refreshLastSeen(["c", "a", "c"], new Date("2026-09-25T00:00:00Z"));
    expect(refreshed).toEqual(["a"]);
    expect(shape(statements)).toEqual(["BEGIN", `bound ${SYNC_REFRESH_TIMEOUT_MS}`, "statement", "COMMIT"]);
    expect(statements[2]!.query).toMatch(/^update "jobs" set "updated_at" = \$1 where/);
    expect(statements[2]!.params.slice(1, 3)).toEqual(["a", "c"]);
  });

  it("loadStoredCoords answers null when there are more locations than the limit", async () => {
    const rows = [
      { key: "a", latitude: "1", longitude: "1", seen: "2026-09-01 00:00:00" },
      { key: "b", latitude: "2", longitude: "2", seen: "2026-09-01 00:00:00" },
      { key: "c", latitude: "3", longitude: "3", seen: "2026-09-01 00:00:00" },
    ];
    const tooMany = storeOf([{ rows }]);
    expect(await tooMany.store.loadStoredCoords!(2)).toBeNull();
    expect(tooMany.statements.find((s) => s.query.startsWith("SELECT s.k"))!.params).toEqual([3]);
    const fits = storeOf([{ rows }]);
    expect([...(await fits.store.loadStoredCoords!(3))!.keys()]).toEqual(["a", "b", "c"]);
  });
});
