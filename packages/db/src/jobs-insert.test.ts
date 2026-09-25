import { drizzle } from "drizzle-orm/postgres-js";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { Sql } from "postgres";
import {
  JOBS_CREATED_AT,
  JOBS_INSERT_IDLE_TIMEOUT_MS,
  JOBS_INSERT_MAX_LATENCY_MS,
  JOBS_INSERT_STATEMENT_TIMEOUT_MS,
  JOBS_INSERT_UNGUARDED_SLACK_MS,
  jobsInsertBoundSql,
  jobsInsertSqlProblem,
  withBoundedJobsInsert,
} from "./jobs-insert";
import * as schema from "./schema/index";
import { jobs } from "./schema/jobs";
import { userAlerts } from "./schema/index";

type Logged = "BEGIN" | "COMMIT" | "ROLLBACK" | { sql: string; params: unknown[] };

/**
 * The real Drizzle postgres-js driver over a fake `postgres` client that records every statement,
 * so the tests see the exact SQL (and its order) that the writers send.
 */
function recordingDb(options: { failOn?: RegExp; rows?: unknown[][] } = {}) {
  const log: Logged[] = [];
  const unsafe = (query: string, params: unknown[] = []) => {
    log.push({ sql: query.replace(/\s+/g, " "), params });
    const result =
      options.failOn && options.failOn.test(query)
        ? Promise.reject(new Error("canceling statement due to statement timeout"))
        : Promise.resolve(/^insert into/.test(query) ? (options.rows ?? []) : []);
    result.catch(() => undefined);
    return Object.assign(result, { values: () => result });
  };
  const client = {
    options: { parsers: {}, serializers: {} },
    unsafe,
    begin: async (fn: (c: unknown) => Promise<unknown>) => {
      log.push("BEGIN");
      try {
        const value = await fn(client);
        log.push("COMMIT");
        return value;
      } catch (error) {
        log.push("ROLLBACK");
        throw error;
      }
    },
  };
  const db = drizzle(client as unknown as Sql, { schema });
  const statements = () => log.map((e) => (typeof e === "string" ? e : e.sql));
  return { db, log, statements };
}

/** The value written to each column of every row of a rendered `insert into "jobs"`. */
function insertedRows(statement: string): Map<string, string>[] {
  const m = /^insert into "jobs" \(([^)]*)\) values (\(.*?\))(?: on conflict| returning|$)/.exec(statement);
  if (!m) throw new Error(`not an insert into "jobs": ${statement}`);
  const columns = m[1]!.split(", ").map((c) => c.replace(/"/g, ""));
  return m[2]!
    .slice(1, -1)
    .split("), (")
    .map((tuple) => {
      const values = tuple.split(", ");
      expect(values).toHaveLength(columns.length);
      return new Map(columns.map((c, i) => [c, values[i]!]));
    });
}

const row = { externalId: "li-1", site: "linkedin", title: "Engineer", updatedAt: new Date("2026-09-25T07:00:00Z") };
const stamped = { ...row, createdAt: JOBS_CREATED_AT };
const dialect = new PgDialect();

describe("jobs-insert latency bound", () => {
  it("is the INSERT's statement timeout, the idle gap before the COMMIT and the unguarded slack (the COMMIT)", () => {
    expect(JOBS_INSERT_STATEMENT_TIMEOUT_MS).toBe(60_000);
    expect(JOBS_INSERT_IDLE_TIMEOUT_MS).toBe(10_000);
    expect(JOBS_INSERT_UNGUARDED_SLACK_MS).toBe(50_000);
    expect(JOBS_INSERT_MAX_LATENCY_MS).toBe(JOBS_INSERT_STATEMENT_TIMEOUT_MS + JOBS_INSERT_IDLE_TIMEOUT_MS + JOBS_INSERT_UNGUARDED_SLACK_MS);
    // Nothing before the INSERT is in it (the stamp is the INSERT's own statement_timestamp()).
    expect(JOBS_INSERT_MAX_LATENCY_MS).toBe(2 * 60_000);
  });

  it("the bound statement sets both timeouts (from the constants), a local-only commit and UTC, all LOCAL to the transaction", () => {
    const q = dialect.sqlToQuery(jobsInsertBoundSql());
    expect(q.sql).toBe(
      "select set_config('statement_timeout', $1, true), set_config('idle_in_transaction_session_timeout', $2, true), set_config('synchronous_commit', 'local', true), set_config('TimeZone', 'UTC', true)",
    );
    expect(q.params).toEqual([String(JOBS_INSERT_STATEMENT_TIMEOUT_MS), String(JOBS_INSERT_IDLE_TIMEOUT_MS)]);
  });

  it("JOBS_CREATED_AT is the database's statement_timestamp() (not now(), the transaction start)", () => {
    expect(dialect.sqlToQuery(JOBS_CREATED_AT)).toEqual({ sql: "statement_timestamp()", params: [] });
  });
});

describe("withBoundedJobsInsert", () => {
  it("runs BEGIN, the bound, the one INSERT, COMMIT, in that order", async () => {
    const { db, statements } = recordingDb();
    await withBoundedJobsInsert(db, (tx) => tx.insert(jobs).values(stamped));
    const s = statements();
    expect(s).toHaveLength(4);
    expect(s[0]).toBe("BEGIN");
    expect(s[1]).toMatch(/^select set_config\('statement_timeout', \$1, true\), set_config\('idle_in_transaction_session_timeout'/);
    expect(s[2]).toMatch(/^insert into "jobs" /);
    expect(s[3]).toBe("COMMIT");
  });

  it("stamps created_at with the INSERT's statement_timestamp(), in every row", async () => {
    const { db, statements } = recordingDb();
    await withBoundedJobsInsert(db, (tx) => tx.insert(jobs).values(stamped));
    const [only] = insertedRows(statements()[2]!);
    expect(only!.get("created_at")).toBe("statement_timestamp()");
    // Control: a column the row does set is a parameter, one it does not is DEFAULT, so the parser
    // reads the right slots.
    expect(only!.get("external_id")).toMatch(/^\$\d+$/);
    expect(only!.get("company_name")).toBe("default");

    const batch = recordingDb();
    const rows = ["a", "b", "c"].map((id) => ({ ...row, externalId: id, createdAt: JOBS_CREATED_AT }));
    await withBoundedJobsInsert(batch.db, (tx) => tx.insert(jobs).values(rows).onConflictDoNothing());
    const inserted = insertedRows(batch.statements()[2]!);
    expect(inserted).toHaveLength(3);
    expect(inserted.map((r) => r.get("created_at"))).toEqual(["statement_timestamp()", "statement_timestamp()", "statement_timestamp()"]);
  });

  it("the writers' upsert never touches created_at on conflict", async () => {
    const { db, statements } = recordingDb();
    const update = { site: row.site, title: row.title, updatedAt: row.updatedAt };
    await withBoundedJobsInsert(db, (tx) =>
      tx.insert(jobs).values(stamped).onConflictDoUpdate({ target: jobs.externalId, set: update }),
    );
    const insert = statements()[2]!;
    const set = insert.slice(insert.indexOf(" do update set "));
    expect(set).toContain('"updated_at" = ');
    expect(set).not.toContain("created_at");
    expect(insertedRows(insert)[0]!.get("created_at")).toBe("statement_timestamp()");
  });

  it("returns what the INSERT returns", async () => {
    const { db } = recordingDb({ rows: [["li-1"]] });
    const result = await withBoundedJobsInsert(db, (tx) => tx.insert(jobs).values(stamped).returning({ externalId: jobs.externalId }));
    expect(result).toEqual([{ externalId: "li-1" }]);
  });

  it.each([
    ["no createdAt (the column default now() is the transaction's start)", row, undefined, /row 1 sets created_at to `default`/],
    ["createdAt from the app's clock", { ...row, createdAt: new Date() }, undefined, /row 1 sets created_at to `\$\d+`/],
    ["createdAt = now()", { ...row, createdAt: sql`now()` }, undefined, /row 1 sets created_at to `now\(\)`/],
    ["the stamp in the conflict set", stamped, { title: "x", createdAt: JOBS_CREATED_AT }, /ON CONFLICT DO UPDATE sets created_at/],
  ])("refuses a statement with %s: nothing is inserted, the transaction rolls back", async (_label, values, set, message) => {
    const { db, statements } = recordingDb();
    const error = await withBoundedJobsInsert(db, (tx) => {
      const q = tx.insert(jobs).values(values);
      return set ? q.onConflictDoUpdate({ target: jobs.externalId, set }) : q;
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/^withBoundedJobsInsert refused the statement: /);
    expect((error as Error).message).toMatch(message);
    expect(statements().some((s) => s.startsWith("insert into"))).toBe(false);
    expect(statements().at(-1)).toBe("ROLLBACK");
  });

  it("refuses a batch where one row is not stamped", async () => {
    const { db, statements } = recordingDb();
    const rows = [stamped, { ...row, externalId: "li-2", createdAt: new Date() }];
    await expect(withBoundedJobsInsert(db, (tx) => tx.insert(jobs).values(rows))).rejects.toThrow(/row 2 sets created_at/);
    expect(statements().some((s) => s.startsWith("insert into"))).toBe(false);
  });

  it("a failed INSERT (e.g. its statement timeout) rolls the transaction back and rejects", async () => {
    const { db, statements } = recordingDb({ failOn: /^insert into "jobs"/ });
    const error = await withBoundedJobsInsert(db, (tx) => tx.insert(jobs).values(stamped)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/^Failed query: insert into "jobs"/);
    expect(((error as Error).cause as Error).message).toBe("canceling statement due to statement timeout");
    expect(statements()[0]).toBe("BEGIN");
    expect(statements().at(-1)).toBe("ROLLBACK");
    expect(statements()).not.toContain("COMMIT");
  });

  it("never runs the INSERT unbounded: if the bound cannot be set, nothing is inserted", async () => {
    const { db, statements } = recordingDb({ failOn: /set_config/ });
    const insert = jest.fn((tx: Parameters<Parameters<typeof withBoundedJobsInsert>[1]>[0]) => tx.insert(jobs).values(stamped));
    await expect(withBoundedJobsInsert(db, insert)).rejects.toThrow();
    expect(insert).not.toHaveBeenCalled();
    expect(statements().some((s) => s.startsWith("insert into"))).toBe(false);
    expect(statements().at(-1)).toBe("ROLLBACK");
  });
});

describe("jobsInsertSqlProblem (the run-time check, on the SQL Drizzle renders)", () => {
  const { db } = recordingDb();
  const render = (q: { toSQL(): { sql: string } }) => q.toSQL().sql;

  it("accepts stamped rows with any conflict clause, a setWhere and a returning that read created_at", () => {
    const q = db
      .insert(jobs)
      .values([stamped, { ...row, externalId: "li-2", createdAt: JOBS_CREATED_AT }])
      .onConflictDoUpdate({
        target: jobs.externalId,
        set: { title: sql`excluded."title"`, updatedAt: sql`excluded."updated_at"` },
        setWhere: sql`${jobs.createdAt} < excluded."updated_at"`,
      })
      .returning({ externalId: jobs.externalId, createdAt: jobs.createdAt, inserted: sql<boolean>`(xmax = 0)` });
    expect(jobsInsertSqlProblem(render(q))).toBeNull();
    expect(jobsInsertSqlProblem(render(db.insert(jobs).values(stamped).onConflictDoNothing()))).toBeNull();
  });

  it("reads quoted values with commas and parentheses", () => {
    const q = db.insert(jobs).values({ ...row, title: sql`'it''s (a, b)'`, companyName: sql`"x"`, createdAt: JOBS_CREATED_AT });
    expect(jobsInsertSqlProblem(render(q))).toBeNull();
    // Control: the same row without the stamp is refused, so the reader did find the column.
    const bad = db.insert(jobs).values({ ...row, title: sql`'it''s (a, b)'`, companyName: sql`"x"` });
    expect(jobsInsertSqlProblem(render(bad))).toMatch(/row 1 sets created_at to `default`/);
  });

  it("refuses another table, and SQL it cannot read", () => {
    expect(jobsInsertSqlProblem(render(db.insert(userAlerts).values({ userId: "u", frequency: "daily", email: "e@example.com" })))).toBe(
      "it is not an INSERT into the jobs table",
    );
    expect(jobsInsertSqlProblem('insert into "jobs" ("external_id", "created_at") select 1, now()')).toBe("it has no VALUES list");
    expect(jobsInsertSqlProblem('insert into "jobs" ("external_id") values ($1)')).toBe("it does not list created_at");
    expect(jobsInsertSqlProblem('insert into "jobs" ("external_id", "created_at") values ($1)')).toBe("its VALUES list could not be read");
  });
});
