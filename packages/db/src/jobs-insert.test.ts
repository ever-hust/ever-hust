import { drizzle } from "drizzle-orm/postgres-js";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Sql } from "postgres";
import {
  JOBS_INSERT_IDLE_TIMEOUT_MS,
  JOBS_INSERT_MAX_LATENCY_MS,
  JOBS_INSERT_STATEMENT_TIMEOUT_MS,
  JOBS_INSERT_UNGUARDED_SLACK_MS,
  jobsInsertBoundSql,
  withBoundedJobsInsert,
} from "./jobs-insert";
import * as schema from "./schema/index";
import { jobs } from "./schema/jobs";

type Logged = "BEGIN" | "COMMIT" | "ROLLBACK" | { sql: string; params: unknown[] };

/**
 * The real Drizzle postgres-js driver over a fake `postgres` client that records every statement,
 * so the tests see the exact SQL (and its order) that the writers send.
 */
function recordingDb(options: { failOn?: RegExp } = {}) {
  const log: Logged[] = [];
  const unsafe = (query: string, params: unknown[] = []) => {
    log.push({ sql: query.replace(/\s+/g, " "), params });
    const result =
      options.failOn && options.failOn.test(query)
        ? Promise.reject(new Error("canceling statement due to statement timeout"))
        : Promise.resolve([]);
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

/** The value written to each column of the first row of a rendered `insert into "jobs"`. */
function insertedColumns(statement: string): Map<string, string> {
  const m = /^insert into "jobs" \(([^)]*)\) values \((.*?)\)(?: on conflict| returning|$)/.exec(statement);
  if (!m) throw new Error(`not an insert into "jobs": ${statement}`);
  const columns = m[1]!.split(", ").map((c) => c.replace(/"/g, ""));
  const values = m[2]!.split(", ");
  expect(values).toHaveLength(columns.length);
  return new Map(columns.map((c, i) => [c, values[i]!]));
}

const row = { externalId: "li-1", site: "linkedin", title: "Engineer", updatedAt: new Date("2026-09-25T07:00:00Z") };

describe("jobs-insert latency bound", () => {
  it("is the INSERT's statement timeout, two idle gaps and the unguarded slack", () => {
    expect(JOBS_INSERT_STATEMENT_TIMEOUT_MS).toBe(60_000);
    expect(JOBS_INSERT_IDLE_TIMEOUT_MS).toBe(10_000);
    expect(JOBS_INSERT_UNGUARDED_SLACK_MS).toBe(40_000);
    expect(JOBS_INSERT_MAX_LATENCY_MS).toBe(
      JOBS_INSERT_STATEMENT_TIMEOUT_MS + 2 * JOBS_INSERT_IDLE_TIMEOUT_MS + JOBS_INSERT_UNGUARDED_SLACK_MS,
    );
    expect(JOBS_INSERT_MAX_LATENCY_MS).toBe(2 * 60_000);
  });

  it("the bound statement sets both timeouts (from the constants) and UTC, all LOCAL to the transaction", () => {
    const q = new PgDialect().sqlToQuery(jobsInsertBoundSql());
    expect(q.sql).toBe(
      "select set_config('statement_timeout', $1, true), set_config('idle_in_transaction_session_timeout', $2, true), set_config('TimeZone', 'UTC', true)",
    );
    expect(q.params).toEqual([String(JOBS_INSERT_STATEMENT_TIMEOUT_MS), String(JOBS_INSERT_IDLE_TIMEOUT_MS)]);
  });
});

describe("withBoundedJobsInsert", () => {
  it("runs BEGIN, the bound, the one INSERT, COMMIT, in that order", async () => {
    const { db, statements } = recordingDb();
    await withBoundedJobsInsert(db, (tx) => tx.insert(jobs).values(row));
    const s = statements();
    expect(s).toHaveLength(4);
    expect(s[0]).toBe("BEGIN");
    expect(s[1]).toMatch(/^select set_config\('statement_timeout', \$1, true\), set_config\('idle_in_transaction_session_timeout'/);
    expect(s[2]).toMatch(/^insert into "jobs" /);
    expect(s[3]).toBe("COMMIT");
  });

  it("leaves created_at to the database: the column gets DEFAULT (now(), the transaction start)", async () => {
    const { db, statements } = recordingDb();
    await withBoundedJobsInsert(db, (tx) => tx.insert(jobs).values(row));
    const columns = insertedColumns(statements()[2]!);
    expect(columns.get("created_at")).toBe("default");
    // Control: a column the row does set is a parameter, so the parser reads the right slots.
    expect(columns.get("external_id")).toMatch(/^\$\d+$/);
    expect(columns.get("updated_at")).toMatch(/^\$\d+$/);
  });

  it("the writers' upsert never touches created_at on conflict", async () => {
    const { db, statements } = recordingDb();
    const update = { site: row.site, title: row.title, updatedAt: row.updatedAt };
    await withBoundedJobsInsert(db, (tx) =>
      tx.insert(jobs).values(row).onConflictDoUpdate({ target: jobs.externalId, set: update }),
    );
    const insert = statements()[2]!;
    const set = insert.slice(insert.indexOf(" do update set "));
    expect(set).toContain('"updated_at" = ');
    expect(set).not.toContain("created_at");
    expect(insertedColumns(insert).get("created_at")).toBe("default");
  });

  it("returns what the INSERT returns", async () => {
    const { db } = recordingDb();
    const result = await withBoundedJobsInsert(db, () => Promise.resolve("inserted"));
    expect(result).toBe("inserted");
  });

  it("a failed INSERT (e.g. its statement timeout) rolls the transaction back and rejects", async () => {
    const { db, statements } = recordingDb({ failOn: /^insert into "jobs"/ });
    const error = await withBoundedJobsInsert(db, (tx) => tx.insert(jobs).values(row)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/^Failed query: insert into "jobs"/);
    expect(((error as Error).cause as Error).message).toBe("canceling statement due to statement timeout");
    expect(statements()[0]).toBe("BEGIN");
    expect(statements().at(-1)).toBe("ROLLBACK");
    expect(statements()).not.toContain("COMMIT");
  });

  it("never runs the INSERT unbounded: if the bound cannot be set, nothing is inserted", async () => {
    const { db, statements } = recordingDb({ failOn: /set_config/ });
    const insert = jest.fn((tx: Parameters<Parameters<typeof withBoundedJobsInsert>[1]>[0]) =>
      tx.insert(jobs).values(row),
    );
    await expect(withBoundedJobsInsert(db, insert)).rejects.toThrow();
    expect(insert).not.toHaveBeenCalled();
    expect(statements().some((s) => s.startsWith("insert into"))).toBe(false);
    expect(statements().at(-1)).toBe("ROLLBACK");
  });
});
