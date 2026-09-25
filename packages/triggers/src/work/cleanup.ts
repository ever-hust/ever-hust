import { and, getTableName, inArray, is, isNotNull, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { PgTable, getTableConfig, type PgColumn } from "drizzle-orm/pg-core";
import * as schema from "@ever-hust/db/schema";
import {
  db as defaultDb,
  agentInstances,
  applications,
  emailMessages,
  evaluations,
  jobs,
  stripeWebhookEvents,
  userJobs,
} from "@ever-hust/db";
import { CronWorkError, deadlineFrom } from "./errors";

/**
 * Daily cleanup (app-runtime work behind `POST /api/cron/cleanup`).
 *
 * RETENTION RULES (unchanged from the original Trigger task; only the reference guard is new):
 *  - jobs "expired": `expires_at IS NOT NULL AND expires_at < now`
 *  - jobs "stale":   `(date_posted IS NULL OR date_posted < now - 90d) AND updated_at < now - 90d`
 *  - agent_instances: `status IN ('completed','failed') AND updated_at < now - 7d`
 *  - stripe_webhook_events: `processed_at < now - 7d`
 *
 * DATA SAFETY: in the Drizzle schema `user_jobs`, `applications` and `evaluations` reference
 * `jobs.id` with ON DELETE CASCADE (and `agent_instances` / `email_messages` with SET NULL), so
 * deleting a job silently deletes users' saved/applied jobs, application tracking and evaluations.
 * (The live hust databases were found on 2026-09-25 to have NO foreign-key constraints at all, so
 * there a delete would orphan those rows instead — the saved/applied job vanishes from every join.
 * Same loss either way.) A job referenced from ANY of those columns is therefore never deleted:
 * every jobs delete carries a `NOT EXISTS` guard per referencing column
 * ({@link JOB_REFERENCING_COLUMNS}). Before touching anything, the run also checks the Drizzle
 * schema AND the live database catalog for a foreign key to `jobs` that the guard does not cover,
 * and refuses to run if it finds one.
 *
 * MODE (`JOBS_CLEANUP_MODE`, read in the app runtime): `off` | `dry-run` (DEFAULT) | `delete`.
 * The mode governs every rule above. `dry-run` only counts. `delete` deletes in bounded batches
 * (`DELETE_BATCH_SIZE` rows per statement, one short transaction per batch) to keep locks short on
 * the shared Postgres cluster.
 */

export type CleanupMode = "off" | "dry-run" | "delete";

export const CLEANUP_MODES: readonly CleanupMode[] = ["off", "dry-run", "delete"];

/** Rows per DELETE statement. */
export const DELETE_BATCH_SIZE = 500;
/** Hard cap on batches per rule per run (500 x 400 = 200k rows); the next run continues. */
export const MAX_BATCHES_PER_RULE = 400;

const DAY_MS = 24 * 60 * 60 * 1000;
export const STALE_JOB_AGE_DAYS = 90;
export const AGENT_INSTANCE_RETENTION_DAYS = 7;
export const WEBHOOK_EVENT_RETENTION_DAYS = 7;

/**
 * Every column that references `jobs.id`. A job referenced from any of these is never deleted.
 * `cleanup.test.ts` fails if a foreign key to `jobs` is added to the schema without being listed
 * here, and {@link assertJobReferencesCovered} refuses to run against a database that has one.
 */
export const JOB_REFERENCING_COLUMNS: readonly PgColumn[] = [
  userJobs.jobId, // ON DELETE CASCADE: saved / favorited / applied jobs
  applications.jobId, // ON DELETE CASCADE: application tracking pipeline
  evaluations.jobId, // ON DELETE CASCADE: fit evaluations
  agentInstances.jobId, // ON DELETE SET NULL: agent runs about the job
  emailMessages.jobId, // ON DELETE SET NULL: inbox threads linked to the job
];

/** `table.column` names of {@link JOB_REFERENCING_COLUMNS}, sorted. */
export function guardedReferenceNames(): string[] {
  return JOB_REFERENCING_COLUMNS.map((c) => `${getTableName(c.table)}.${c.name}`).sort();
}

/** Every `table.column` in the Drizzle schema that has a foreign key to `jobs`, sorted. */
export function schemaJobReferenceNames(tables: Record<string, unknown> = schema): string[] {
  const found = new Set<string>();
  for (const value of Object.values(tables)) {
    if (!is(value, PgTable)) continue;
    for (const fk of getTableConfig(value).foreignKeys) {
      const ref = fk.reference();
      if (getTableName(ref.foreignTable) !== getTableName(jobs)) continue;
      for (const col of ref.columns) found.add(`${getTableName(value)}.${col.name}`);
    }
  }
  return [...found].sort();
}

/** `NOT EXISTS (...)` for every referencing column, AND-ed. Correlates on the outer `jobs` row. */
export function jobReferenceGuard(): SQL {
  return sql.join(
    JOB_REFERENCING_COLUMNS.map(
      (col) => sql`not exists (select 1 from ${col.table} where ${col} = ${jobs.id})`,
    ),
    sql` and `,
  );
}

/** Retention rule 1: the job's own expiry has passed. */
export function expiredJobsRule(now: Date): SQL {
  return and(isNotNull(jobs.expiresAt), lt(jobs.expiresAt, now))!;
}

/** Retention rule 2: posted > 90 days ago (or undated) and not updated for 90 days. */
export function staleJobsRule(now: Date): SQL {
  const cutoff = new Date(now.getTime() - STALE_JOB_AGE_DAYS * DAY_MS);
  return and(or(isNull(jobs.datePosted), lt(jobs.datePosted, cutoff)), lt(jobs.updatedAt, cutoff))!;
}

export function agentInstancesRule(now: Date): SQL {
  const cutoff = new Date(now.getTime() - AGENT_INSTANCE_RETENTION_DAYS * DAY_MS);
  return and(inArray(agentInstances.status, ["completed", "failed"]), lt(agentInstances.updatedAt, cutoff))!;
}

export function webhookEventsRule(now: Date): SQL {
  const cutoff = new Date(now.getTime() - WEBHOOK_EVENT_RETENTION_DAYS * DAY_MS);
  return lt(stripeWebhookEvents.processedAt, cutoff);
}

// ── Mode ─────────────────────────────────────────────────────────────────────

/**
 * Resolve `JOBS_CLEANUP_MODE`. Unset or unrecognised → `dry-run` (the safe default: count, never
 * delete). A caller may only make a run SAFER than the configured mode (`requested`), never
 * escalate it: `delete` requires the environment to say so.
 */
export function resolveCleanupMode(
  raw: string | undefined = process.env.JOBS_CLEANUP_MODE,
  requested?: CleanupMode,
): CleanupMode {
  const normalized = (raw ?? "").trim().toLowerCase().replace(/[_ ]/g, "-");
  let configured: CleanupMode;
  if (normalized === "" || normalized === "dry-run" || normalized === "dryrun") configured = "dry-run";
  else if (normalized === "off" || normalized === "delete") configured = normalized;
  else {
    console.warn(`[cleanup] Unrecognised JOBS_CLEANUP_MODE="${raw}"; using dry-run.`);
    configured = "dry-run";
  }
  if (!requested) return configured;
  const rank: Record<CleanupMode, number> = { off: 0, "dry-run": 1, delete: 2 };
  return rank[requested] < rank[configured] ? requested : configured;
}

// ── Database access ──────────────────────────────────────────────────────────

/** The slice of the Drizzle client the cleanup needs (kept narrow so tests can fake it). */
export interface SqlExecutor {
  execute(query: SQL): Promise<unknown>;
}
export interface CleanupDatabase extends SqlExecutor {
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

type Row = Record<string, unknown>;

function rowsOf(result: unknown): Row[] {
  if (Array.isArray(result)) return result as Row[];
  const rows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as Row[]) : [];
}

function toCount(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeRelName(name: string): string {
  const last = name.split(".").pop() ?? name;
  return last.replace(/"/g, "");
}

/**
 * Foreign keys to `jobs` in the LIVE database (catalog read, no locks of note). Catches a
 * constraint added outside the Drizzle schema (hand-written SQL, another tool).
 */
export async function liveJobReferenceNames(database: SqlExecutor): Promise<string[]> {
  const rows = rowsOf(
    await database.execute(sql`
      select c.conrelid::regclass::text as table_name, a.attname as column_name
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
      where c.contype = 'f' and c.confrelid = to_regclass('jobs')
    `),
  );
  return rows
    .map((r) => `${normalizeRelName(String(r.table_name))}.${String(r.column_name)}`)
    .sort();
}

/**
 * Throws (before anything is counted or deleted) when a foreign key to `jobs` exists — in the
 * schema or in the live database — that {@link JOB_REFERENCING_COLUMNS} does not guard.
 */
export async function assertJobReferencesCovered(
  database: SqlExecutor,
  tables: Record<string, unknown> = schema,
): Promise<void> {
  const guarded = new Set(guardedReferenceNames());
  const live = await liveJobReferenceNames(database);
  const uncovered = [...new Set([...schemaJobReferenceNames(tables), ...live])].filter(
    (name) => !guarded.has(name),
  );
  if (uncovered.length > 0) {
    throw new CronWorkError(
      `Refusing to clean up jobs: foreign key(s) to jobs not covered by the reference guard: ${uncovered.join(", ")}. ` +
        "Add them to JOB_REFERENCING_COLUMNS in packages/triggers/src/work/cleanup.ts.",
      { uncoveredReferences: uncovered },
    );
  }
}

// ── Counting (every mode except off) ─────────────────────────────────────────

export interface JobRuleCounts {
  expiredDeletable: number;
  expiredProtected: number;
  staleDeletable: number;
  staleProtected: number;
}

/**
 * How many rows each rule would delete and how many the reference guard keeps. "stale" excludes
 * rows already matched by "expired", mirroring the delete order. Two statements so the guard sits
 * in WHERE (planned as anti-joins) rather than inside an aggregate FILTER (a per-row sub-plan) —
 * this runs on the Postgres cluster shared with production.
 */
export async function countJobRules(database: SqlExecutor, now: Date): Promise<JobRuleCounts> {
  const expired = expiredJobsRule(now);
  const stale = staleJobsRule(now);
  const guard = jobReferenceGuard();
  const countBoth = async (where: SQL) =>
    rowsOf(
      await database.execute(sql`
        select
          count(*) filter (where ${expired})::int as expired,
          count(*) filter (where not (${expired}))::int as stale
        from ${jobs}
        where ${where}
      `),
    )[0] ?? {};
  const deletable = await countBoth(sql`(${expired} or ${stale}) and ${guard}`);
  const matched = await countBoth(sql`${expired} or ${stale}`);
  const expiredDeletable = toCount(deletable.expired);
  const staleDeletable = toCount(deletable.stale);
  return {
    expiredDeletable,
    expiredProtected: Math.max(0, toCount(matched.expired) - expiredDeletable),
    staleDeletable,
    staleProtected: Math.max(0, toCount(matched.stale) - staleDeletable),
  };
}

async function countWhere(database: SqlExecutor, table: PgTable, rule: SQL): Promise<number> {
  const rows = rowsOf(await database.execute(sql`select count(*)::int as n from ${table} where ${rule}`));
  return toCount(rows[0]?.n);
}

// ── Deleting (delete mode only) ──────────────────────────────────────────────

export interface BatchDeleteOutcome {
  deleted: number;
  batches: number;
  /** True when the time budget or batch cap stopped the rule early; the next run continues. */
  truncated: boolean;
}

interface BatchOptions {
  batchSize: number;
  maxBatches: number;
  deadline: number;
  clock: () => number;
}

/**
 * Delete guarded jobs matching `rule`, `batchSize` at a time. Each batch is one short transaction:
 *  1. `SELECT id ... FOR UPDATE SKIP LOCKED` locks the candidates (rows another transaction holds
 *     are skipped). Where the FK constraints exist, a concurrent favorite/apply/evaluate INSERT
 *     that references a locked job must wait for us (its FK check takes a KEY SHARE lock) and then
 *     fails loudly instead of being cascaded away.
 *  2. `DELETE ... WHERE id IN (locked) AND <guard>` re-checks the guard with a FRESH snapshot, so a
 *     reference committed between our scan and our lock is still honoured. Without FK constraints
 *     (the live hust DBs today) the only remaining window is a reference committed during this one
 *     DELETE statement.
 */
export async function deleteJobsInBatches(
  database: CleanupDatabase,
  rule: SQL,
  opts: BatchOptions,
): Promise<BatchDeleteOutcome> {
  const guard = jobReferenceGuard();
  let deleted = 0;
  let batches = 0;
  for (;;) {
    if (batches >= opts.maxBatches || opts.clock() > opts.deadline) {
      return { deleted, batches, truncated: true };
    }
    const { locked, removed } = await database.transaction(async (tx) => {
      const candidates = rowsOf(
        await tx.execute(sql`
          select ${jobs.id} as id from ${jobs}
          where ${rule} and ${guard}
          order by ${jobs.id}
          limit ${opts.batchSize}
          for update skip locked
        `),
      );
      if (candidates.length === 0) return { locked: 0, removed: 0 };
      const ids = candidates.map((c) => Number(c.id));
      const gone = rowsOf(
        await tx.execute(sql`
          delete from ${jobs}
          where ${jobs.id} in (${sql.join(
            ids.map((id) => sql`${id}`),
            sql`, `,
          )}) and ${guard}
          returning ${jobs.id} as id
        `),
      );
      return { locked: candidates.length, removed: gone.length };
    });
    batches += 1;
    deleted += removed;
    if (locked < opts.batchSize) return { deleted, batches, truncated: false };
  }
}

/** Batched delete for tables nothing references (agent_instances, stripe_webhook_events). */
async function deleteRowsInBatches(
  database: SqlExecutor,
  table: PgTable,
  idColumn: PgColumn,
  rule: SQL,
  opts: BatchOptions,
): Promise<BatchDeleteOutcome> {
  let deleted = 0;
  let batches = 0;
  for (;;) {
    if (batches >= opts.maxBatches || opts.clock() > opts.deadline) {
      return { deleted, batches, truncated: true };
    }
    const gone = rowsOf(
      await database.execute(sql`
        delete from ${table}
        where ${idColumn} in (select ${idColumn} from ${table} where ${rule} order by ${idColumn} limit ${opts.batchSize})
        returning ${idColumn} as id
      `),
    );
    batches += 1;
    deleted += gone.length;
    if (gone.length < opts.batchSize) return { deleted, batches, truncated: false };
  }
}

// ── Orchestration ────────────────────────────────────────────────────────────

export interface JobsRuleResult {
  /** Rows the rule matched that the guard allows deleting (counted before any delete). */
  matched: number;
  /** Rows the rule matched that are kept because something references them. */
  protectedByReference: number;
  /** Rows actually deleted (always 0 unless mode is `delete`). */
  deleted: number;
  truncated: boolean;
}

export interface SimpleRuleResult {
  matched: number;
  deleted: number;
  truncated: boolean;
}

export interface JobsCleanupResult {
  mode: CleanupMode;
  cleanupDate: string;
  expired: JobsRuleResult;
  stale: JobsRuleResult;
  /** Back-compat total with the original task's `totalDeletedJobs`. */
  totalDeletedJobs: number;
}

export interface CleanupResult {
  mode: CleanupMode;
  cleanupDate: string;
  jobs?: { expired: JobsRuleResult; stale: JobsRuleResult };
  agentInstances?: SimpleRuleResult;
  stripeWebhookEvents?: SimpleRuleResult;
  /** Back-compat counters with the original task's return value. */
  deletedJobs: number;
  deletedAgents: number;
  deletedWebhookEvents: number;
  truncated: boolean;
  skipped?: true;
}

export interface CleanupOptions {
  /** Requested mode; can only make the run safer than `JOBS_CLEANUP_MODE`. */
  mode?: CleanupMode;
  /** Overrides the environment lookup (tests). */
  envMode?: string;
  db?: CleanupDatabase;
  now?: Date;
  budgetMs?: number;
  batchSize?: number;
  maxBatches?: number;
  clock?: () => number;
}

function batchOptions(options: CleanupOptions): BatchOptions {
  const clock = options.clock ?? Date.now;
  return {
    batchSize: options.batchSize ?? DELETE_BATCH_SIZE,
    maxBatches: options.maxBatches ?? MAX_BATCHES_PER_RULE,
    deadline: deadlineFrom(clock(), options.budgetMs),
    clock,
  };
}

async function cleanupJobsWith(
  database: CleanupDatabase,
  mode: Exclude<CleanupMode, "off">,
  now: Date,
  batch: BatchOptions,
): Promise<{ expired: JobsRuleResult; stale: JobsRuleResult }> {
  await assertJobReferencesCovered(database);
  const counts = await countJobRules(database, now);
  const expired: JobsRuleResult = {
    matched: counts.expiredDeletable,
    protectedByReference: counts.expiredProtected,
    deleted: 0,
    truncated: false,
  };
  const stale: JobsRuleResult = {
    matched: counts.staleDeletable,
    protectedByReference: counts.staleProtected,
    deleted: 0,
    truncated: false,
  };
  if (mode === "delete") {
    const e = await deleteJobsInBatches(database, expiredJobsRule(now), batch);
    expired.deleted = e.deleted;
    expired.truncated = e.truncated;
    const s = await deleteJobsInBatches(database, staleJobsRule(now), batch);
    stale.deleted = s.deleted;
    stale.truncated = s.truncated;
  }
  return { expired, stale };
}

/**
 * Jobs-only cleanup (the on-demand `cleanup-expired-jobs` task). Same guard + mode as
 * {@link runCleanup}. Throws {@link CronWorkError} on an uncovered foreign key.
 */
export async function cleanupExpiredJobs(options: CleanupOptions = {}): Promise<JobsCleanupResult> {
  const mode = resolveCleanupMode(options.envMode ?? process.env.JOBS_CLEANUP_MODE, options.mode);
  const now = options.now ?? new Date();
  const empty: JobsRuleResult = { matched: 0, protectedByReference: 0, deleted: 0, truncated: false };
  if (mode === "off") {
    return { mode, cleanupDate: now.toISOString(), expired: empty, stale: { ...empty }, totalDeletedJobs: 0 };
  }
  const database = options.db ?? (defaultDb as unknown as CleanupDatabase);
  const { expired, stale } = await cleanupJobsWith(database, mode, now, batchOptions(options));
  return {
    mode,
    cleanupDate: now.toISOString(),
    expired,
    stale,
    totalDeletedJobs: expired.deleted + stale.deleted,
  };
}

/**
 * Full daily cleanup: jobs (guarded) + old agent instances + old Stripe webhook events.
 * Every rule is attempted even if an earlier one fails; any failure is re-thrown at the end as a
 * {@link CronWorkError} carrying the partial counters (so the route answers non-2xx).
 */
export async function runCleanup(options: CleanupOptions = {}): Promise<CleanupResult> {
  const mode = resolveCleanupMode(options.envMode ?? process.env.JOBS_CLEANUP_MODE, options.mode);
  const now = options.now ?? new Date();
  const result: CleanupResult = {
    mode,
    cleanupDate: now.toISOString(),
    deletedJobs: 0,
    deletedAgents: 0,
    deletedWebhookEvents: 0,
    truncated: false,
  };
  if (mode === "off") return { ...result, skipped: true };

  const database = options.db ?? (defaultDb as unknown as CleanupDatabase);
  const batch = batchOptions(options);
  const errors: string[] = [];
  const fail = (rule: string, err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[cleanup] ${rule} failed:`, msg);
    errors.push(`${rule}: ${msg}`);
  };

  try {
    result.jobs = await cleanupJobsWith(database, mode, now, batch);
    result.deletedJobs = result.jobs.expired.deleted + result.jobs.stale.deleted;
  } catch (err) {
    // An uncovered foreign key is a hard stop for the whole run: something new points at data
    // we are about to delete, so do not touch any table until a human has looked.
    if (err instanceof CronWorkError) throw err;
    fail("jobs", err);
  }

  const simpleRule = async (
    name: "agentInstances" | "stripeWebhookEvents",
    table: PgTable,
    idColumn: PgColumn,
    rule: SQL,
  ): Promise<SimpleRuleResult | undefined> => {
    try {
      const matched = await countWhere(database, table, rule);
      if (mode !== "delete") return { matched, deleted: 0, truncated: false };
      const out = await deleteRowsInBatches(database, table, idColumn, rule, batch);
      return { matched, deleted: out.deleted, truncated: out.truncated };
    } catch (err) {
      fail(name, err);
      return undefined;
    }
  };

  result.agentInstances = await simpleRule(
    "agentInstances",
    agentInstances,
    agentInstances.id,
    agentInstancesRule(now),
  );
  result.deletedAgents = result.agentInstances?.deleted ?? 0;
  result.stripeWebhookEvents = await simpleRule(
    "stripeWebhookEvents",
    stripeWebhookEvents,
    stripeWebhookEvents.id,
    webhookEventsRule(now),
  );
  result.deletedWebhookEvents = result.stripeWebhookEvents?.deleted ?? 0;

  result.truncated = Boolean(
    result.jobs?.expired.truncated ||
      result.jobs?.stale.truncated ||
      result.agentInstances?.truncated ||
      result.stripeWebhookEvents?.truncated,
  );

  if (errors.length > 0) {
    throw new CronWorkError(`Cleanup finished with ${errors.length} failed rule(s): ${errors.join("; ")}`, result);
  }
  return result;
}
