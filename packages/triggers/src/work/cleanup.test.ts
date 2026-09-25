import { sql, type SQL } from "drizzle-orm";
import { PgDialect, integer, pgTable } from "drizzle-orm/pg-core";
import * as schema from "@ever-hust/db/schema";
import { jobs } from "@ever-hust/db/schema";
import { CronWorkError } from "./errors";
import {
  JOB_REFERENCING_COLUMNS,
  assertJobReferencesCovered,
  cleanupExpiredJobs,
  expiredJobsRule,
  guardedReferenceNames,
  jobReferenceGuard,
  resolveCleanupMode,
  runCleanup,
  schemaJobReferenceNames,
  staleJobsRule,
  type CleanupDatabase,
  type SqlExecutor,
} from "./cleanup";

const dialect = new PgDialect();
const render = (q: SQL) => dialect.sqlToQuery(q);
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

const EXPECTED_REFERENCES = [
  "agent_instances.job_id",
  "applications.job_id",
  "email_messages.job_id",
  "evaluations.job_id",
  "user_jobs.job_id",
];

// ── Fake database ────────────────────────────────────────────────────────────

interface Stmt {
  sql: string;
  params: unknown[];
  inTransaction: boolean;
}

interface FakeOptions {
  liveReferences?: { table_name: string; column_name: string }[];
  counts?: { expired: number; stale: number; expiredMatched?: number; staleMatched?: number; simple?: number };
  /** Ids returned by successive `FOR UPDATE SKIP LOCKED` selects. */
  lockBatches?: number[][];
  /** Rows returned by successive agent/webhook delete statements. */
  simpleDeleteBatches?: number[];
  failOn?: RegExp;
}

function fakeDb(opts: FakeOptions = {}) {
  const statements: Stmt[] = [];
  const lockBatches = [...(opts.lockBatches ?? [])];
  const simpleBatches = [...(opts.simpleDeleteBatches ?? [])];
  let transactions = 0;
  const counts = { expired: 0, stale: 0, simple: 0, ...opts.counts };

  const exec = (inTransaction: boolean): SqlExecutor => ({
    async execute(query: SQL) {
      const { sql: text, params } = render(query);
      const s = oneLine(text);
      statements.push({ sql: s, params, inTransaction });
      if (opts.failOn?.test(s)) throw new Error(`boom: ${s.slice(0, 40)}`);
      if (s.includes("from pg_constraint")) {
        return opts.liveReferences ?? EXPECTED_REFERENCES.map((r) => {
          const [table_name, column_name] = r.split(".");
          return { table_name, column_name };
        });
      }
      if (s.startsWith("select count(*) filter")) {
        const guarded = s.includes("not exists");
        return [
          {
            expired: guarded ? counts.expired : (counts.expiredMatched ?? counts.expired),
            stale: guarded ? counts.stale : (counts.staleMatched ?? counts.stale),
          },
        ];
      }
      if (s.startsWith("select count(*)::int as n")) return [{ n: counts.simple }];
      if (s.includes("for update skip locked")) return (lockBatches.shift() ?? []).map((id) => ({ id }));
      if (s.startsWith('delete from "jobs"')) {
        const ids = params.filter((p) => typeof p === "number" && !Number.isNaN(p));
        // All params of this statement are the locked ids (the guard has none).
        return ids.map((id) => ({ id }));
      }
      if (s.startsWith("delete from")) {
        const n = simpleBatches.shift() ?? 0;
        return Array.from({ length: n }, (_, i) => ({ id: i }));
      }
      throw new Error(`unexpected statement: ${s}`);
    },
  });

  const db: CleanupDatabase & { statements: Stmt[]; transactions: () => number } = {
    ...exec(false),
    async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      transactions++;
      return fn(exec(true));
    },
    statements,
    transactions: () => transactions,
  };
  return db;
}

const NOW = new Date("2026-09-25T03:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

let errSpy: jest.SpyInstance;
let warnSpy: jest.SpyInstance;
beforeEach(() => {
  errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  errSpy.mockRestore();
  warnSpy.mockRestore();
});

// ── Reference guard ──────────────────────────────────────────────────────────

describe("reference guard covers every foreign key to jobs", () => {
  it("the Drizzle schema's foreign keys to jobs are exactly the guarded columns", () => {
    // If this fails, a table gained a FK to jobs.id: add its column to JOB_REFERENCING_COLUMNS in
    // work/cleanup.ts, or the daily cleanup could cascade-delete (or orphan) that data.
    expect(schemaJobReferenceNames()).toEqual(guardedReferenceNames());
  });

  it("the scan is not vacuous: it finds the five known references", () => {
    expect(schemaJobReferenceNames()).toEqual(EXPECTED_REFERENCES);
    expect(JOB_REFERENCING_COLUMNS).toHaveLength(5);
  });

  it("control: a new table with a FK to jobs is detected and fails the check", async () => {
    const shortlists = pgTable("shortlists", {
      id: integer("id").primaryKey(),
      jobId: integer("job_id").references(() => jobs.id, { onDelete: "cascade" }),
    });
    const withNewFk = { ...schema, shortlists };
    expect(schemaJobReferenceNames(withNewFk)).toContain("shortlists.job_id");
    await expect(assertJobReferencesCovered(fakeDb(), withNewFk)).rejects.toThrow("shortlists.job_id");
  });

  it("the guard renders one NOT EXISTS per referencing column, correlated on jobs.id", () => {
    const text = oneLine(render(jobReferenceGuard()).sql);
    for (const ref of EXPECTED_REFERENCES) {
      const [table, column] = ref.split(".");
      expect(text).toContain(`not exists (select 1 from "${table}" where "${table}"."${column}" = "jobs"."id")`);
    }
    expect(text.match(/not exists/g)).toHaveLength(5);
  });

  it("refuses to run when the LIVE database has a foreign key the guard does not cover", async () => {
    const db = fakeDb({
      liveReferences: [
        ...EXPECTED_REFERENCES.map((r) => ({ table_name: r.split(".")[0]!, column_name: r.split(".")[1]! })),
        { table_name: "public.job_notes", column_name: "job_id" },
      ],
      counts: { expired: 3, stale: 4 },
      lockBatches: [[1, 2, 3]],
    });
    const err = await runCleanup({ envMode: "delete", db, now: NOW }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CronWorkError);
    expect((err as Error).message).toContain("job_notes.job_id");
    expect(db.statements.some((s) => s.sql.startsWith("delete"))).toBe(false);
    expect(db.transactions()).toBe(0);
  });
});

// ── Retention rules (unchanged) ──────────────────────────────────────────────

describe("retention rules are unchanged", () => {
  it("expired: expires_at set and in the past", () => {
    const q = render(expiredJobsRule(NOW));
    expect(oneLine(q.sql)).toBe('("jobs"."expires_at" is not null and "jobs"."expires_at" < $1)');
    expect(q.params).toEqual([NOW.toISOString()]);
  });

  it("stale: posted > 90 days ago (or undated) and not updated for 90 days", () => {
    const q = render(staleJobsRule(NOW));
    expect(oneLine(q.sql)).toBe(
      '(("jobs"."date_posted" is null or "jobs"."date_posted" < $1) and "jobs"."updated_at" < $2)',
    );
    const cutoff = new Date(NOW.getTime() - 90 * DAY).toISOString();
    expect(q.params).toEqual([cutoff, cutoff]);
  });
});

// ── Mode ─────────────────────────────────────────────────────────────────────

describe("JOBS_CLEANUP_MODE", () => {
  it.each([
    [undefined, "dry-run"],
    ["", "dry-run"],
    ["dry-run", "dry-run"],
    ["DRY_RUN", "dry-run"],
    ["off", "off"],
    ["delete", "delete"],
    [" Delete ", "delete"],
    ["yes-please", "dry-run"],
  ])("%p resolves to %p (default dry-run)", (raw, expected) => {
    expect(resolveCleanupMode(raw)).toBe(expected);
  });

  it("a request can make a run safer but never escalate it", () => {
    expect(resolveCleanupMode("delete", "dry-run")).toBe("dry-run");
    expect(resolveCleanupMode("delete", "off")).toBe("off");
    expect(resolveCleanupMode("dry-run", "delete")).toBe("dry-run");
    expect(resolveCleanupMode("off", "dry-run")).toBe("off");
  });
});

// ── dry-run / off ────────────────────────────────────────────────────────────

describe("dry-run (the default) deletes nothing", () => {
  it("counts per rule, including what the guard protects, and issues no DELETE", async () => {
    const db = fakeDb({ counts: { expired: 7, stale: 11, expiredMatched: 9, staleMatched: 15, simple: 4 } });
    const result = await runCleanup({ envMode: undefined, db, now: NOW });

    expect(result.mode).toBe("dry-run");
    expect(result.jobs).toEqual({
      expired: { matched: 7, protectedByReference: 2, deleted: 0, truncated: false },
      stale: { matched: 11, protectedByReference: 4, deleted: 0, truncated: false },
    });
    expect(result.agentInstances).toEqual({ matched: 4, deleted: 0, truncated: false });
    expect(result.stripeWebhookEvents).toEqual({ matched: 4, deleted: 0, truncated: false });
    expect(result.deletedJobs + result.deletedAgents + result.deletedWebhookEvents).toBe(0);
    expect(db.statements.some((s) => /^delete|for update/.test(s.sql))).toBe(false);
    expect(db.statements.every((s) => s.sql.startsWith("select"))).toBe(true);
    expect(db.transactions()).toBe(0);
  });

  it("the deletable count applies the guard; the matched count does not", async () => {
    const db = fakeDb({ counts: { expired: 1, stale: 1 } });
    await runCleanup({ envMode: "dry-run", db, now: NOW });
    const counts = db.statements.filter((s) => s.sql.startsWith("select count(*) filter"));
    expect(counts).toHaveLength(2);
    expect(counts[0]!.sql.match(/not exists/g)).toHaveLength(5);
    expect(counts[1]!.sql).not.toContain("not exists");
  });

  it("cleanupExpiredJobs is also dry-run by default", async () => {
    const db = fakeDb({ counts: { expired: 2, stale: 3 } });
    const result = await cleanupExpiredJobs({ db, now: NOW, envMode: undefined });
    expect(result).toMatchObject({ mode: "dry-run", totalDeletedJobs: 0 });
    expect(db.statements.some((s) => s.sql.startsWith("delete"))).toBe(false);
  });

  it("off touches the database not at all", async () => {
    const db = fakeDb();
    const result = await runCleanup({ envMode: "off", db, now: NOW });
    expect(result).toMatchObject({ mode: "off", skipped: true, deletedJobs: 0 });
    expect(db.statements).toHaveLength(0);
  });

  it("a request for dry-run overrides a configured delete", async () => {
    const db = fakeDb({ counts: { expired: 5, stale: 0 }, lockBatches: [[1, 2, 3, 4, 5]] });
    const result = await runCleanup({ envMode: "delete", mode: "dry-run", db, now: NOW });
    expect(result.mode).toBe("dry-run");
    expect(db.statements.some((s) => s.sql.startsWith("delete"))).toBe(false);
  });
});

// ── delete mode ──────────────────────────────────────────────────────────────

describe("delete mode deletes in bounded, guarded batches", () => {
  it("locks candidates FOR UPDATE SKIP LOCKED, re-checks the guard in the DELETE, one transaction per batch", async () => {
    const db = fakeDb({
      counts: { expired: 5, stale: 1 },
      // expired: two full batches of 2 + a partial batch of 1; stale: one partial batch
      lockBatches: [[1, 2], [3, 4], [5], [9]],
      simpleDeleteBatches: [0, 0],
    });
    const result = await runCleanup({ envMode: "delete", db, now: NOW, batchSize: 2 });

    expect(result.mode).toBe("delete");
    expect(result.jobs!.expired).toMatchObject({ matched: 5, deleted: 5, truncated: false });
    expect(result.jobs!.stale).toMatchObject({ matched: 1, deleted: 1, truncated: false });
    expect(result.deletedJobs).toBe(6);
    expect(db.transactions()).toBe(4);

    const locks = db.statements.filter((s) => s.sql.includes("for update skip locked"));
    const deletes = db.statements.filter((s) => s.sql.startsWith('delete from "jobs"'));
    expect(locks).toHaveLength(4);
    expect(deletes).toHaveLength(4);
    for (const s of [...locks, ...deletes]) {
      expect(s.inTransaction).toBe(true);
      expect(s.sql.match(/not exists/g)).toHaveLength(5);
    }
    for (const s of locks) {
      expect(s.sql).toMatch(/order by "jobs"\."id" limit \$\d+ for update skip locked$/);
      expect(s.params.at(-1)).toBe(2);
    }
    expect(deletes.map((d) => d.params.filter((p) => typeof p === "number"))).toEqual([[1, 2], [3, 4], [5], [9]]);
    for (const d of deletes) expect(d.sql).toMatch(/returning "jobs"\."id" as id$/);
  });

  it("never puts more than the batch size in one DELETE (default 500)", async () => {
    const full = Array.from({ length: 500 }, (_, i) => i + 1);
    const db = fakeDb({ counts: { expired: 600, stale: 0 }, lockBatches: [full, [501, 502]], simpleDeleteBatches: [0, 0] });
    const result = await runCleanup({ envMode: "delete", db, now: NOW });
    const deletes = db.statements.filter((s) => s.sql.startsWith('delete from "jobs"'));
    expect(deletes.map((d) => d.params.filter((p) => typeof p === "number").length)).toEqual([500, 2]);
    expect(result.jobs!.expired.deleted).toBe(502);
  });

  it("agent_instances and stripe_webhook_events are deleted in batches too", async () => {
    const db = fakeDb({ counts: { expired: 0, stale: 0, simple: 5 }, simpleDeleteBatches: [2, 2, 1, 0] });
    const result = await runCleanup({ envMode: "delete", db, now: NOW, batchSize: 2 });
    expect(result.agentInstances).toEqual({ matched: 5, deleted: 5, truncated: false });
    expect(result.stripeWebhookEvents).toEqual({ matched: 5, deleted: 0, truncated: false });
    const agentDeletes = db.statements.filter((s) => s.sql.startsWith('delete from "agent_instances"'));
    expect(agentDeletes).toHaveLength(3);
    expect(agentDeletes[0]!.sql).toContain(
      'where "agent_instances"."id" in (select "agent_instances"."id" from "agent_instances" where ("agent_instances"."status" in ($1, $2) and "agent_instances"."updated_at" < $3) order by "agent_instances"."id" limit $4)',
    );
    const hook = db.statements.find((s) => s.sql.startsWith('delete from "stripe_webhook_events"'))!;
    expect(hook.sql).toContain('"stripe_webhook_events"."processed_at" < $1');
    expect(hook.params[0]).toBe(new Date(NOW.getTime() - 7 * DAY).toISOString());
  });

  it("stops at the time budget and reports truncated (the next run continues)", async () => {
    let t = 0;
    const db = fakeDb({ counts: { expired: 10, stale: 0 }, lockBatches: [[1, 2], [3, 4], [5, 6]] });
    const clock = () => (t += 1000);
    const result = await runCleanup({ envMode: "delete", db, now: NOW, batchSize: 2, budgetMs: 2_500, clock });
    expect(result.truncated).toBe(true);
    expect(result.jobs!.expired.truncated).toBe(true);
    expect(result.jobs!.expired.deleted).toBeLessThan(10);
  });

  it("a failing rule does not stop the others, but the run still fails (non-2xx) with counters", async () => {
    const db = fakeDb({ counts: { expired: 0, stale: 0, simple: 1 }, failOn: /^delete from "agent_instances"/, simpleDeleteBatches: [1] });
    const err = (await runCleanup({ envMode: "delete", db, now: NOW }).catch((e: unknown) => e)) as CronWorkError;
    expect(err).toBeInstanceOf(CronWorkError);
    expect(err.cronStatus).toBe(500);
    expect(err.message).toContain("agentInstances");
    const details = err.cronDetails as { stripeWebhookEvents?: { deleted: number }; jobs?: unknown };
    expect(details.jobs).toBeDefined();
    expect(details.stripeWebhookEvents).toEqual({ matched: 1, deleted: 1, truncated: false });
  });
});

describe("statement shapes", () => {
  it("never deletes jobs without the guard (no bare DELETE FROM jobs in any mode)", async () => {
    const db = fakeDb({ counts: { expired: 1, stale: 1 }, lockBatches: [[1], [2]], simpleDeleteBatches: [0, 0] });
    await runCleanup({ envMode: "delete", db, now: NOW });
    for (const s of db.statements.filter((x) => x.sql.includes('"jobs"') && x.sql.startsWith("delete"))) {
      expect(s.sql.match(/not exists/g)).toHaveLength(5);
    }
  });

  it("the live-catalog check reads pg_constraint for FKs pointing at jobs", async () => {
    const db = fakeDb();
    await assertJobReferencesCovered(db);
    const q = db.statements[0]!;
    expect(q.sql).toContain("from pg_constraint c");
    expect(q.sql).toContain("c.contype = 'f' and c.confrelid = to_regclass('jobs')");
  });

  it("the sql helper is the drizzle one (sanity for the fake renderer)", () => {
    expect(render(sql`select ${1}`).params).toEqual([1]);
  });
});
