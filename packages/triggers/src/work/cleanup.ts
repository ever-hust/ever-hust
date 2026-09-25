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
 * RETENTION RULES (unchanged from the original Trigger task; only the reference guards are new):
 *  - jobs "expired": `expires_at IS NOT NULL AND expires_at < now`
 *  - jobs "stale":   `(date_posted IS NULL OR date_posted < now - 90d) AND updated_at < now - 90d`
 *  - agent_instances: `status IN ('completed','failed') AND updated_at < now - 7d`
 *  - stripe_webhook_events: `processed_at < now - 7d`
 *
 * DATA SAFETY: in the Drizzle schema `user_jobs`, `applications` and `evaluations` reference
 * `jobs.id` with ON DELETE CASCADE (and `agent_instances` / `email_messages` with SET NULL), so
 * deleting a job silently deletes users' saved/applied jobs, application tracking and evaluations.
 * `applications.agent_instance_id` references `agent_instances.id` (SET NULL): deleting an old
 * agent run detaches it from the application it produced. (The live hust databases were found on
 * 2026-09-25 to have NO foreign-key constraints at all, so there a delete would orphan those rows
 * instead. Same loss either way.) So a row referenced from ANY listed column is never deleted:
 * every delete carries a `NOT EXISTS` guard per referencing column ({@link JOB_REFERENCES},
 * {@link AGENT_INSTANCE_REFERENCES}). Before touching anything, the run checks three sources for
 * a reference the guards do not cover, and refuses to run if it finds one:
 *  1. the Drizzle schema (foreign keys);
 *  2. the live catalog's foreign keys (`pg_constraint`);
 *  3. the live catalog's COLUMNS by name and type (`*job_id` integers, `*agent_instance_id` uuids),
 *     because the live databases have no foreign keys, so (2) alone would check nothing there.
 * Nothing references `stripe_webhook_events` (a unit test keeps that true).
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

// ── Reference guards ─────────────────────────────────────────────────────────

/** A table the cleanup deletes from, and every column that references its primary key. */
export interface ReferenceGuardSpec {
  /** The table rows are deleted from. */
  target: PgTable;
  /** Its primary key (what the referencing columns hold). */
  targetId: PgColumn;
  /** Every column that references `target`. A row referenced from any of them is never deleted. */
  columns: readonly PgColumn[];
  /** Name of the list in this file, for the refusal message. */
  listName: string;
  /**
   * Live-catalog scan for references WITHOUT a foreign key: a column of `target`'s schema whose
   * name matches this Postgres regex and whose type is one of `columnTypes` (`format_type` names).
   */
  columnNamePattern: string;
  columnTypes: readonly string[];
}

/**
 * Every column that references `jobs.id`. A job referenced from any of these is never deleted.
 * `cleanup.test.ts` fails if a foreign key to `jobs` is added to the schema without being listed
 * here, and {@link assertReferencesCovered} refuses to run against a database that has one (or an
 * FK-less `*job_id` integer column) outside this list.
 */
export const JOB_REFERENCING_COLUMNS: readonly PgColumn[] = [
  userJobs.jobId, // ON DELETE CASCADE: saved / favorited / applied jobs
  applications.jobId, // ON DELETE CASCADE: application tracking pipeline
  evaluations.jobId, // ON DELETE CASCADE: fit evaluations
  agentInstances.jobId, // ON DELETE SET NULL: agent runs about the job
  emailMessages.jobId, // ON DELETE SET NULL: inbox threads linked to the job
];

/** Every column that references `agent_instances.id`. */
export const AGENT_INSTANCE_REFERENCING_COLUMNS: readonly PgColumn[] = [
  applications.agentInstanceId, // ON DELETE SET NULL: the agent run that produced the application
];

export const JOB_REFERENCES: ReferenceGuardSpec = {
  target: jobs,
  targetId: jobs.id,
  columns: JOB_REFERENCING_COLUMNS,
  listName: "JOB_REFERENCING_COLUMNS",
  columnNamePattern: "(^|_)job_id$",
  columnTypes: ["integer", "bigint", "smallint"],
};

export const AGENT_INSTANCE_REFERENCES: ReferenceGuardSpec = {
  target: agentInstances,
  targetId: agentInstances.id,
  columns: AGENT_INSTANCE_REFERENCING_COLUMNS,
  listName: "AGENT_INSTANCE_REFERENCING_COLUMNS",
  columnNamePattern: "(^|_)agent_instance_id$",
  columnTypes: ["uuid"],
};

/** `table.column` names a spec guards, sorted. */
export function guardedReferenceNames(spec: ReferenceGuardSpec = JOB_REFERENCES): string[] {
  return spec.columns.map((c) => `${getTableName(c.table)}.${c.name}`).sort();
}

/** Every `table.column` in the Drizzle schema that has a foreign key to `target`, sorted. */
export function schemaReferenceNames(target: PgTable, tables: Record<string, unknown> = schema): string[] {
  const found = new Set<string>();
  for (const value of Object.values(tables)) {
    if (!is(value, PgTable)) continue;
    for (const fk of getTableConfig(value).foreignKeys) {
      const ref = fk.reference();
      if (getTableName(ref.foreignTable) !== getTableName(target)) continue;
      for (const col of ref.columns) found.add(`${getTableName(value)}.${col.name}`);
    }
  }
  return [...found].sort();
}

/** Every `table.column` in the Drizzle schema that has a foreign key to `jobs`, sorted. */
export function schemaJobReferenceNames(tables: Record<string, unknown> = schema): string[] {
  return schemaReferenceNames(jobs, tables);
}

/** `NOT EXISTS (...)` for every referencing column, AND-ed. Correlates on the outer target row. */
export function referenceGuard(spec: ReferenceGuardSpec): SQL {
  return sql.join(
    spec.columns.map((col) => sql`not exists (select 1 from ${col.table} where ${col} = ${spec.targetId})`),
    sql` and `,
  );
}

/** The guard for `jobs` deletes. */
export function jobReferenceGuard(): SQL {
  return referenceGuard(JOB_REFERENCES);
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

/** Retention rule for `agent_instances` (without the reference guard, which is applied on top). */
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

function namesOf(rows: Row[]): string[] {
  return rows.map((r) => `${normalizeRelName(String(r.table_name))}.${String(r.column_name)}`).sort();
}

/**
 * Foreign keys to `target` in the LIVE database (catalog read, no locks of note). Catches a
 * constraint added outside the Drizzle schema (hand-written SQL, another tool).
 */
export async function liveForeignKeyReferenceNames(database: SqlExecutor, target: PgTable): Promise<string[]> {
  return namesOf(
    rowsOf(
      await database.execute(sql`
        select c.conrelid::regclass::text as table_name, a.attname as column_name
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
        where c.contype = 'f' and c.confrelid = to_regclass(${getTableName(target)}::text)
      `),
    ),
  );
}

/** Foreign keys to `jobs` in the live database. */
export async function liveJobReferenceNames(database: SqlExecutor): Promise<string[]> {
  return liveForeignKeyReferenceNames(database, jobs);
}

/**
 * Columns in the LIVE database that look like references to `spec.target` by name and type, with
 * or without a foreign key: ordinary tables (not views, not partitions) in the target table's
 * schema. The live hust databases have no foreign keys, so this is what protects them against a
 * reference column added without one (hand-written SQL, `scripts/ensure-*.cjs`, a `drizzle-kit
 * push` that stopped before creating the constraints).
 */
export async function liveColumnReferenceNames(database: SqlExecutor, spec: ReferenceGuardSpec): Promise<string[]> {
  return namesOf(
    rowsOf(
      await database.execute(sql`
        select c.relname as table_name, a.attname as column_name
        from pg_attribute a
        join pg_class c on c.oid = a.attrelid
        where c.relnamespace = (
            select t.relnamespace from pg_class t where t.oid = to_regclass(${getTableName(spec.target)}::text)
          )
          and c.relkind in ('r', 'p')
          and not c.relispartition
          and a.attnum > 0
          and not a.attisdropped
          and a.attname ~ ${spec.columnNamePattern}
          and format_type(a.atttypid, null) in (${sql.join(
            spec.columnTypes.map((t) => sql`${t}`),
            sql`, `,
          )})
      `),
    ),
  );
}

/**
 * Throws (before anything is counted or deleted) when a reference to `spec.target` exists — in
 * the schema, in the live foreign keys, or as a live column matching the name/type scan — that
 * `spec.columns` does not guard.
 */
export async function assertReferencesCovered(
  database: SqlExecutor,
  spec: ReferenceGuardSpec,
  tables: Record<string, unknown> = schema,
): Promise<void> {
  const guarded = new Set(guardedReferenceNames(spec));
  const liveFks = await liveForeignKeyReferenceNames(database, spec.target);
  const liveColumns = await liveColumnReferenceNames(database, spec);
  const uncovered = [...new Set([...schemaReferenceNames(spec.target, tables), ...liveFks, ...liveColumns])]
    .filter((name) => !guarded.has(name))
    .sort();
  if (uncovered.length > 0) {
    const target = getTableName(spec.target);
    throw new CronWorkError(
      `Refusing to clean up: column(s) referencing ${target} not covered by the reference guard: ${uncovered.join(", ")}. ` +
        `Add them to ${spec.listName} in packages/triggers/src/work/cleanup.ts.`,
      { target, uncoveredReferences: uncovered },
    );
  }
}

/** {@link assertReferencesCovered} for `jobs`. */
export async function assertJobReferencesCovered(
  database: SqlExecutor,
  tables: Record<string, unknown> = schema,
): Promise<void> {
  return assertReferencesCovered(database, JOB_REFERENCES, tables);
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

/**
 * Running totals of a batched delete. The delete functions update it IN PLACE after every
 * committed batch, so a caller still knows what was deleted when a later batch throws.
 */
export interface BatchDeleteOutcome {
  deleted: number;
  batches: number;
  /** True when the time budget or batch cap stopped the rule early; the next run continues. */
  truncated: boolean;
}

export function emptyDeleteOutcome(): BatchDeleteOutcome {
  return { deleted: 0, batches: 0, truncated: false };
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
 * `progress` is updated after every committed batch (see {@link BatchDeleteOutcome}).
 */
export async function deleteJobsInBatches(
  database: CleanupDatabase,
  rule: SQL,
  opts: BatchOptions,
  progress: BatchDeleteOutcome = emptyDeleteOutcome(),
): Promise<BatchDeleteOutcome> {
  const guard = jobReferenceGuard();
  for (;;) {
    if (progress.batches >= opts.maxBatches || opts.clock() > opts.deadline) {
      progress.truncated = true;
      return progress;
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
    progress.batches += 1;
    progress.deleted += removed;
    if (locked < opts.batchSize) return progress;
  }
}

/**
 * Batched delete for `agent_instances` (with its reference guard inside `rule`) and
 * `stripe_webhook_events` (nothing references it). One statement per batch; the guard and the
 * delete share that statement's snapshot. `progress` is updated after every committed batch.
 */
async function deleteRowsInBatches(
  database: SqlExecutor,
  table: PgTable,
  idColumn: PgColumn,
  rule: SQL,
  opts: BatchOptions,
  progress: BatchDeleteOutcome,
): Promise<BatchDeleteOutcome> {
  for (;;) {
    if (progress.batches >= opts.maxBatches || opts.clock() > opts.deadline) {
      progress.truncated = true;
      return progress;
    }
    const gone = rowsOf(
      await database.execute(sql`
        delete from ${table}
        where ${idColumn} in (select ${idColumn} from ${table} where ${rule} order by ${idColumn} limit ${opts.batchSize})
        returning ${idColumn} as id
      `),
    );
    progress.batches += 1;
    progress.deleted += gone.length;
    if (gone.length < opts.batchSize) return progress;
  }
}

// ── Orchestration ────────────────────────────────────────────────────────────

export interface JobsRuleResult {
  /** Rows the rule matched that the guard allows deleting (counted before any delete). */
  matched: number;
  /** Rows the rule matched that are kept because something references them. */
  protectedByReference: number;
  /** Rows actually deleted (always 0 unless mode is `delete`), including batches committed before a failure. */
  deleted: number;
  truncated: boolean;
  /** Present when a delete batch failed; `deleted` still counts the batches committed before it. */
  failed?: true;
}

export interface SimpleRuleResult {
  /** Rows the rule matched that may be deleted (after the reference guard, where there is one). */
  matched: number;
  /** Rows the rule matched that are kept because something references them (guarded tables only). */
  protectedByReference?: number;
  /** Rows actually deleted, including batches committed before a failure. */
  deleted: number;
  truncated: boolean;
  /** Present when a delete batch failed; `deleted` still counts the batches committed before it. */
  failed?: true;
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

/** Copies a delete's running totals into a rule result (also after a failed batch). */
function applyProgress(target: { deleted: number; truncated: boolean }, progress: BatchDeleteOutcome): void {
  target.deleted = progress.deleted;
  target.truncated = progress.truncated;
}

/**
 * Count, then (delete mode) delete, both job rules. The caller has already run
 * {@link assertReferencesCovered} for jobs. `sink.jobs` is set as soon as the counts exist and is
 * updated as batches commit, so a caller that catches a failure still reports what was deleted.
 */
async function cleanupJobsWith(
  database: CleanupDatabase,
  mode: Exclude<CleanupMode, "off">,
  now: Date,
  batch: BatchOptions,
  sink: { jobs?: { expired: JobsRuleResult; stale: JobsRuleResult } },
): Promise<{ expired: JobsRuleResult; stale: JobsRuleResult }> {
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
  sink.jobs = { expired, stale };
  if (mode === "delete") {
    for (const [result, rule] of [
      [expired, expiredJobsRule(now)],
      [stale, staleJobsRule(now)],
    ] as const) {
      const progress = emptyDeleteOutcome();
      try {
        await deleteJobsInBatches(database, rule, batch, progress);
      } catch (err) {
        result.failed = true;
        throw err;
      } finally {
        applyProgress(result, progress);
      }
    }
  }
  return { expired, stale };
}

/**
 * Jobs-only cleanup (the on-demand `cleanup-expired-jobs` task). Same guard + mode as
 * {@link runCleanup}. Throws {@link CronWorkError} on an uncovered reference; on a failed delete
 * batch, throws a {@link CronWorkError} whose details still count the rows already deleted.
 */
export async function cleanupExpiredJobs(options: CleanupOptions = {}): Promise<JobsCleanupResult> {
  const mode = resolveCleanupMode(options.envMode ?? process.env.JOBS_CLEANUP_MODE, options.mode);
  const now = options.now ?? new Date();
  const empty: JobsRuleResult = { matched: 0, protectedByReference: 0, deleted: 0, truncated: false };
  if (mode === "off") {
    return { mode, cleanupDate: now.toISOString(), expired: empty, stale: { ...empty }, totalDeletedJobs: 0 };
  }
  const database = options.db ?? (defaultDb as unknown as CleanupDatabase);
  await assertReferencesCovered(database, JOB_REFERENCES);
  const sink: { jobs?: { expired: JobsRuleResult; stale: JobsRuleResult } } = {};
  const summarize = (): JobsCleanupResult => {
    const expired = sink.jobs?.expired ?? { ...empty };
    const stale = sink.jobs?.stale ?? { ...empty };
    return { mode, cleanupDate: now.toISOString(), expired, stale, totalDeletedJobs: expired.deleted + stale.deleted };
  };
  try {
    await cleanupJobsWith(database, mode, now, batchOptions(options), sink);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cleanup] jobs failed:", msg);
    throw new CronWorkError(`Jobs cleanup failed: ${msg}`, summarize());
  }
  return summarize();
}

/**
 * Full daily cleanup: jobs (guarded) + old agent instances (guarded) + old Stripe webhook events.
 * The reference checks for jobs and agent_instances run first; an uncovered reference stops the
 * whole run before anything is counted or deleted. After that, every rule is attempted even if an
 * earlier one fails; any failure is re-thrown at the end as a {@link CronWorkError} carrying the
 * partial counters — including rows deleted by batches that committed before the failure — so the
 * route answers non-2xx with honest numbers.
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
  // Hard stop for the whole run: something new points at data we are about to delete, so do not
  // touch any table until a human has looked.
  await assertReferencesCovered(database, JOB_REFERENCES);
  await assertReferencesCovered(database, AGENT_INSTANCE_REFERENCES);

  const batch = batchOptions(options);
  const errors: string[] = [];
  const fail = (rule: string, err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[cleanup] ${rule} failed:`, msg);
    errors.push(`${rule}: ${msg}`);
  };

  try {
    await cleanupJobsWith(database, mode, now, batch, result);
  } catch (err) {
    fail("jobs", err);
  }
  result.deletedJobs = (result.jobs?.expired.deleted ?? 0) + (result.jobs?.stale.deleted ?? 0);

  const simpleRule = async (
    name: "agentInstances" | "stripeWebhookEvents",
    table: PgTable,
    idColumn: PgColumn,
    rule: SQL,
    guard?: ReferenceGuardSpec,
  ): Promise<SimpleRuleResult | undefined> => {
    const deletable = guard ? and(rule, referenceGuard(guard))! : rule;
    let out: SimpleRuleResult | undefined;
    const progress = emptyDeleteOutcome();
    try {
      const matched = await countWhere(database, table, deletable);
      out = { matched, deleted: 0, truncated: false };
      if (guard) out.protectedByReference = Math.max(0, (await countWhere(database, table, rule)) - matched);
      if (mode !== "delete") return out;
      await deleteRowsInBatches(database, table, idColumn, deletable, batch, progress);
      applyProgress(out, progress);
      return out;
    } catch (err) {
      fail(name, err);
      // Rows already deleted by committed batches stay counted (no count → nothing was deleted).
      if (!out) return undefined;
      applyProgress(out, progress);
      out.failed = true;
      return out;
    }
  };

  result.agentInstances = await simpleRule(
    "agentInstances",
    agentInstances,
    agentInstances.id,
    agentInstancesRule(now),
    AGENT_INSTANCE_REFERENCES,
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
