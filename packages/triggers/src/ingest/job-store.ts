import { and, asc, getTableColumns, inArray, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import {
  db as defaultDb,
  jobs,
  JOBS_CREATED_AT,
  withBoundedJobsInsert,
  type Database,
  type JobsInsertTx,
} from "@ever-hust/db";
import type { mapJobToDb } from "../map-job";
import { locationKey, type Coords, type CoordsLookup } from "./geocoder";

/**
 * Database access for the job sync, behind a small interface so the ingest core is testable
 * without a database. The Drizzle implementation below is what runs in production.
 *
 * Every method is one statement, sized by the ingest batch (≤ a few hundred ids/keys), in a
 * transaction that bounds it with `SET LOCAL` timeouts (spec 01a D25): reads with
 * {@link SYNC_READ_TIMEOUT_MS}, the last-seen refresh with {@link SYNC_REFRESH_TIMEOUT_MS}, so a
 * lock (e.g. a schema push holding `jobs`) or a slow scan fails the call instead of hanging the
 * run. The upsert follows the jobs-writer rule (`packages/db/src/jobs-insert.ts`, enforced by
 * `packages/db/src/jobs-insert-guard.test.ts`): one INSERT per `withBoundedJobsInsert`
 * transaction, every row stamped `createdAt: JOBS_CREATED_AT`, never `created_at` on conflict.
 */

/** A row ready for `jobs`: the mapped DTO plus optional coordinates. */
export type JobRow = ReturnType<typeof mapJobToDb> & {
  latitude?: string | null;
  longitude?: string | null;
};

export interface ExistingJobRef {
  externalId: string;
  hasCoords: boolean;
  locationKey: string | null;
  /** The row's last-seen marker (`updated_at`); decides whether a merge may take the row over. */
  updatedAt: Date | null;
}

/** A stored row that may share a posting's identity: narrow columns only (no `raw_data`). */
export interface DedupCandidateRef {
  id: number;
  externalId: string;
  title: string;
  companyName: string | null;
}

/** A stored row carrying a dedupKey, read by primary key in step 2 of the cross-run probe. */
export interface DedupCandidate {
  id: number;
  externalId: string;
  /**
   * The row's source. A posting is a copy of a stored row with the same key only when it comes
   * from ANOTHER source: one source's two ids are two postings (spec 01a D23).
   */
  site: string;
  /**
   * `raw_data->>'id'`: the id, on its own source, of the content the row holds. It differs from
   * `externalId` after a takeover (spec D2); a job whose id this is IS that row's posting.
   */
  sourceId: string | null;
  dedupKey: string;
}

/**
 * What an existing row needs from this run (see {@link JobStore.findWriteNeeds}): a rewrite by
 * the upsert, or only its last-seen marker refreshed.
 */
export type WriteNeed = "write" | "refresh";

/**
 * A row the upsert actually wrote: `inserted` for a new row, otherwise an existing row whose
 * content changed. Rows of the batch that are absent were existing and unchanged (not rewritten).
 */
export interface WrittenRow {
  externalId: string;
  inserted: boolean;
}

export interface JobStore extends CoordsLookup {
  /** Existing rows for these external ids (primary lookup, unique index). */
  findExisting(externalIds: string[]): Promise<Map<string, ExistingJobRef>>;
  /**
   * Rows that share an exact title or company name with the incoming jobs — the index-narrowed
   * candidate set for cross-run dedupe (spec 01a D1). Narrow columns only: `raw_data` (which holds
   * the whole DTO, description included, usually TOASTed) is NOT read here.
   */
  findDedupCandidates(query: { titles: string[]; companies: string[] }): Promise<DedupCandidateRef[]>;
  /**
   * `raw_data->>'dedupKey'` of these rows (primary-key lookup), oldest first; rows without a key
   * are absent. Called only for the few candidates whose title and company match a job loosely.
   */
  findDedupKeys(ids: number[]): Promise<DedupCandidate[]>;
  /**
   * For incoming rows whose `externalId` already exists: which ones the upsert would rewrite
   * (`"write"`: content, signals, coordinates or dedup identity changed, or a merge takes a stale
   * owner over) and which ones only need their last-seen marker refreshed (`"refresh"`). Rows
   * that need nothing are absent; a row that does not exist (any more) is `"write"`. Read-only: the upsert's own
   * `WHERE` ({@link upsertChangedPredicate}) evaluated before the INSERT, so unchanged rows never
   * reach it: an `ON CONFLICT DO UPDATE … WHERE` that is false still locks and WAL-logs every
   * conflicting row (spec 01a D24).
   */
  findWriteNeeds(rows: JobRow[]): Promise<Map<string, WriteNeed>>;
  /**
   * Refresh the last-seen marker of unchanged rows not seen for {@link LAST_SEEN_REFRESH_DAYS}:
   * a narrow `UPDATE jobs SET updated_at` (spec D14/D24) instead of rewriting the whole row
   * (description and `raw_data` stored out of line again). Only rows still stale are touched (a
   * concurrent run may have refreshed them); returns the external ids refreshed.
   */
  refreshLastSeen(externalIds: string[], seenAt: Date): Promise<string[]>;
  /**
   * One bulk upsert statement in one bounded transaction (spec 01a FR-7, the jobs-writer rule).
   * Rows must have distinct `externalId`s; at most {@link MAX_UPSERT_ROWS_PER_STATEMENT} of them.
   */
  upsertBatch(rows: JobRow[]): Promise<WrittenRow[]>;
  /**
   * The sources (`site`, compared case- and space-insensitively) whose newest row was last seen
   * before `before`, oldest first, at most `limit` of them (spec 01a D27). One bounded read of
   * the whole table at the end of a full run.
   */
  findStaleSources?(before: Date, limit: number): Promise<StaleSource[]>;
}

/** A source none of whose rows a sync has seen for a while (see {@link JobStore.findStaleSources}). */
export interface StaleSource {
  site: string;
  /** Its newest row's last-seen marker (`max(updated_at)`), ISO 8601 UTC. */
  lastSeen: string;
  /** Its rows: what the 90-day cleanup will delete if the source stays unseen. */
  rows: number;
}

// ---------------------------------------------------------------------------
// SQL builders (exported for SQL-shape tests)
// ---------------------------------------------------------------------------

/**
 * The "meaningful content" columns. An upsert only rewrites an existing row when one of these
 * differs from the incoming value (or coordinates / the dedup identity get backfilled), so
 * re-syncing an unchanged corpus writes nothing — the database is shared with production.
 * `raw_data` is deliberately NOT compared as a whole: it carries volatile fields.
 */
export const CONTENT_COLUMNS = [
  jobs.site,
  jobs.title,
  jobs.companyName,
  jobs.companyUrl,
  jobs.companyLogo,
  jobs.companyIndustry,
  jobs.companyNumEmployees,
  jobs.companyDescription,
  jobs.jobUrl,
  jobs.jobUrlDirect,
  jobs.applyUrl,
  jobs.locationCity,
  jobs.locationState,
  jobs.locationCountry,
  jobs.isRemote,
  jobs.jobType,
  jobs.description,
  jobs.skills,
  jobs.department,
  jobs.team,
  jobs.employmentType,
  jobs.jobLevel,
  jobs.jobFunction,
  jobs.salaryMin,
  jobs.salaryMax,
  jobs.salaryCurrency,
  jobs.salaryInterval,
  jobs.datePosted,
  jobs.expiresAt,
] as const;

/**
 * A column of the incoming row: `excluded` in the upsert's `ON CONFLICT` clauses, `incoming`
 * in {@link buildWriteNeedsQuery}, which evaluates the same predicate before the INSERT.
 */
const incomingColumn = (alias: string, name: string) => sql`${sql.raw(alias)}.${sql.identifier(name)}`;
const excluded = (name: string) => incomingColumn("excluded", name);

/**
 * The corpus-signal columns (spec #4 liveness / #7 legitimacy). Signals are opt-in per request
 * (`EVER_JOBS_REQUEST_SIGNALS`, off by default), so a DTO without them means "not asked", not
 * "no verdict": a stored verdict is kept until a new one arrives. Legitimacy reasons follow their
 * verdict (a new verdict without reasons clears the old reasons).
 */
export const SIGNAL_COLUMNS = [jobs.liveness, jobs.legitimacy, jobs.legitimacyReasons] as const;

/** Effective incoming value of each {@link SIGNAL_COLUMNS} entry (same order). */
function incomingSignals(alias = "excluded"): SQL[] {
  const x = (name: string) => incomingColumn(alias, name);
  return [
    sql`coalesce(${x(jobs.liveness.name)}, ${jobs.liveness})`,
    sql`coalesce(${x(jobs.legitimacy.name)}, ${jobs.legitimacy})`,
    sql`CASE WHEN ${x(jobs.legitimacy.name)} IS NOT NULL THEN ${x(jobs.legitimacyReasons.name)} ELSE ${jobs.legitimacyReasons} END`,
  ];
}

/**
 * An unchanged row is still rewritten (once) when its `updated_at` is older than this. The daily
 * cleanup deletes jobs whose `updated_at` is older than 90 days (when `date_posted` is old or
 * missing), so `updated_at` must keep meaning "last seen by a sync": refreshing at most once a
 * week keeps live postings safe while an unchanged corpus costs one rewrite per row per week
 * instead of one per run.
 */
export const LAST_SEEN_REFRESH_DAYS = 7;

/**
 * Cross-run merges (spec 01a D2) keep the owning row's content: a second source of the same
 * posting (same `dedupKey`, different external id) only takes the row over when the row has not
 * been refreshed for this long — i.e. its own source stopped listing it. Twice the refresh window,
 * so a row whose own source is still seen (refreshed at least weekly) is never taken over, and a
 * row kept alive only by the other source is rewritten at most once per window.
 */
export const MERGE_TAKEOVER_DAYS = 2 * LAST_SEEN_REFRESH_DAYS;

/**
 * A source none of whose rows a sync has seen for this long is reported at the end of a full run
 * (spec 01a D27). Above the weekly refresh (a source seen by every run has a row refreshed at most
 * {@link LAST_SEEN_REFRESH_DAYS} days plus one run interval ago), far below the 90-day cleanup.
 */
export const STALE_SOURCE_DAYS = 10;

/** At most this many stale sources are reported per run. */
export const MAX_STALE_SOURCES_REPORTED = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

/** True when a merge may take over a row last seen at `ownerUpdatedAt` (see {@link MERGE_TAKEOVER_DAYS}). */
export function mergeMayTakeOver(ownerUpdatedAt: Date | null | undefined, incomingAt: Date): boolean {
  if (!(ownerUpdatedAt instanceof Date) || Number.isNaN(ownerUpdatedAt.getTime())) return false;
  return ownerUpdatedAt.getTime() < incomingAt.getTime() - MERGE_TAKEOVER_DAYS * DAY_MS;
}

/**
 * `WHERE` of the `ON CONFLICT DO UPDATE`.
 *
 * - A row written under its own external id is rewritten only when something meaningful changed,
 *   when coordinates / the dedup identity get backfilled, or when the row's last-seen marker is
 *   older than {@link LAST_SEEN_REFRESH_DAYS}.
 * - A cross-run merge row (another source of the same posting, written onto the owning row's
 *   external id; recognised by `raw_data.id` ≠ `external_id`) is written only when the owning row
 *   has not been refreshed for {@link MERGE_TAKEOVER_DAYS} — the ingestor already decides this, the
 *   predicate keeps it true under concurrent runs. So two sources of one posting never make the
 *   row flip between them.
 *
 * `alias` names the incoming row: `excluded` in the upsert, `incoming` in
 * {@link buildWriteNeedsQuery}, which evaluates the same parts before the INSERT so that rows the
 * predicate would skip never reach it (spec 01a D24). The upsert keeps the full predicate anyway:
 * it is what holds under concurrent runs, and when that read-ahead failed.
 */
export function upsertChangedPredicate(alias = "excluded"): SQL {
  return sql`CASE WHEN ${isMergeRow(alias)}
    THEN ${takesOverOwner(alias)}
    ELSE ${contentChanged(alias)}
    OR ${lastSeenStale(alias)}
    END`;
}

/** The incoming row is a cross-run merge: another source's copy, written onto the owner's external id. */
function isMergeRow(alias: string): SQL {
  const sourceId = sql`(${incomingColumn(alias, jobs.rawData.name)} ->> 'id')`;
  return sql`${sourceId} IS NOT NULL AND ${sourceId} <> ${incomingColumn(alias, jobs.externalId.name)}`;
}

/** A merge may rewrite the owner only when the owner has not been refreshed for the takeover window. */
function takesOverOwner(alias: string): SQL {
  return sql`${jobs.updatedAt} < ${incomingColumn(alias, jobs.updatedAt.name)} - interval '${sql.raw(String(MERGE_TAKEOVER_DAYS))} days'`;
}

/** Something the row shows changed, or coordinates / the dedup identity / the career level get backfilled. */
function contentChanged(alias: string): SQL {
  const current = sql.join(
    CONTENT_COLUMNS.map((c) => sql`${c}`),
    sql`, `,
  );
  const incoming = sql.join(
    CONTENT_COLUMNS.map((c) => incomingColumn(alias, c.name)),
    sql`, `,
  );
  const currentSignals = sql.join(
    SIGNAL_COLUMNS.map((c) => sql`${c}`),
    sql`, `,
  );
  const incomingSignalValues = sql.join(incomingSignals(alias), sql`, `);
  const raw = incomingColumn(alias, jobs.rawData.name);
  return sql`(${current}) IS DISTINCT FROM (${incoming})
    OR (${currentSignals}) IS DISTINCT FROM (${incomingSignalValues})
    OR (${jobs.latitude} IS NULL AND ${incomingColumn(alias, jobs.latitude.name)} IS NOT NULL)
    OR (${jobs.rawData} -> 'dedupKey') IS DISTINCT FROM (${raw} -> 'dedupKey')
    OR (${jobs.rawData} -> 'careerLevel') IS DISTINCT FROM (${raw} -> 'careerLevel')`;
}

/** The row's last-seen marker is older than the weekly refresh window (spec D14). */
function lastSeenStale(alias: string): SQL {
  return sql`${jobs.updatedAt} < ${incomingColumn(alias, jobs.updatedAt.name)} - interval '${sql.raw(String(LAST_SEEN_REFRESH_DAYS))} days'`;
}

/**
 * Every column {@link upsertChangedPredicate} reads from the incoming row, in the order
 * {@link buildWriteNeedsQuery} sends them.
 */
export const COMPARED_COLUMNS: readonly PgColumn[] = [
  jobs.externalId,
  ...CONTENT_COLUMNS,
  ...SIGNAL_COLUMNS,
  jobs.latitude,
  jobs.rawData,
  jobs.updatedAt,
];

/**
 * The only `raw_data` keys the predicate reads (`->> 'id'`, `-> 'dedupKey'`, `-> 'careerLevel'`).
 * The comparison sends just these, so the whole DTO (description included) is not sent twice.
 */
export const COMPARED_RAW_DATA_KEYS = ["id", "dedupKey", "careerLevel"] as const;

/** The value {@link buildWriteNeedsQuery} sends for `column` (what the INSERT would send, as `excluded`). */
function comparedValue(row: JobRow, column: PgColumn): unknown {
  if (column === jobs.rawData) {
    const raw = row.rawData as Record<string, unknown> | null | undefined;
    if (raw === null || raw === undefined) return null;
    const subset: Record<string, unknown> = {};
    for (const key of COMPARED_RAW_DATA_KEYS) {
      if (Object.prototype.hasOwnProperty.call(raw, key)) subset[key] = raw[key];
    }
    return subset;
  }
  const value = (row as Record<string, unknown>)[columnKey(column.name)];
  // Only the coordinates are optional on a JobRow (mapJobToDb sets every other key); the INSERT
  // sends DEFAULT for them, and neither column has a default, so both mean NULL.
  return value === undefined ? null : value;
}

/**
 * The read-ahead of the upsert's `WHERE` (spec 01a D24): for the incoming rows whose external id
 * exists, whether the upsert would rewrite them (`write`) or they only need the last-seen refresh
 * (`refresh`, never for a merge row: a merge that does not take the owner over leaves it alone).
 * A row that no longer exists (deleted since the batch's existence lookup, e.g. by the cleanup) is
 * `write`: the INSERT stores it again instead of it being counted unchanged. Rows needing neither
 * are not returned. The incoming rows are a typed `VALUES` list: every value is the parameter the
 * INSERT would send (the column's own encoder), cast to the column's type, so `incoming.x` equals
 * the upsert's `excluded.x`.
 */
export function buildWriteNeedsQuery(rows: JobRow[]): SQL {
  const alias = "incoming";
  const tuples = rows.map(
    (row) =>
      sql`(${sql.join(
        COMPARED_COLUMNS.map((c) => sql`${sql.param(comparedValue(row, c), c)}::${sql.raw(c.getSQLType())}`),
        sql`, `,
      )})`,
  );
  const names = sql.join(
    COMPARED_COLUMNS.map((c) => sql.identifier(c.name)),
    sql`, `,
  );
  const missing = sql`${jobs.id} IS NULL`;
  const write = sql`CASE WHEN ${isMergeRow(alias)} THEN ${takesOverOwner(alias)} ELSE ${contentChanged(alias)} END`;
  const refresh = sql`CASE WHEN ${isMergeRow(alias)} THEN false ELSE ${lastSeenStale(alias)} END`;
  return sql`SELECT ${incomingColumn(alias, jobs.externalId.name)} AS external_id, ${missing} OR (${write}) IS TRUE AS write, (${refresh}) IS TRUE AS refresh
    FROM (VALUES ${sql.join(tuples, sql`, `)}) AS ${sql.raw(alias)} (${names})
    LEFT JOIN ${jobs} ON ${jobs.externalId} = ${incomingColumn(alias, jobs.externalId.name)}
    WHERE ${missing} OR (${write}) IS TRUE OR (${refresh}) IS TRUE`;
}

/**
 * The narrow last-seen refresh (spec D14/D24): `updated_at` only, and only on rows still older
 * than the refresh window, so a row a concurrent run refreshed is left alone and nothing but the
 * marker is rewritten. An UPDATE, not an INSERT: the jobs-writer rule is about `created_at`, which
 * this never touches.
 *
 * The rows are locked first, in `external_id` byte order (`SELECT … ORDER BY … COLLATE "C" FOR
 * UPDATE`, the order the upsert's sorted `VALUES` list locks them in): a plain
 * `UPDATE … WHERE external_id IN (…)` locks in whatever order the scan meets them, so this
 * statement and another run's upsert over the same rows could deadlock (review F4).
 */
export function buildLastSeenRefreshQuery(database: Database | SyncTx, externalIds: string[], seenAt: Date) {
  const staleBefore = new Date(seenAt.getTime() - LAST_SEEN_REFRESH_DAYS * DAY_MS);
  const locked = sql`SELECT l.id FROM ${jobs} AS l
    WHERE l.external_id IN ${externalIds} AND l.updated_at < ${sql.param(staleBefore, jobs.updatedAt)}
    ORDER BY l.external_id COLLATE "C"
    FOR UPDATE`;
  return database
    .update(jobs)
    .set({ updatedAt: seenAt })
    .where(sql`${jobs.id} IN (${locked})`)
    .returning({ externalId: jobs.externalId });
}

/**
 * Rows per upsert statement, and so per bounded transaction. The jobs-writer rule cancels an
 * INSERT after 60 s (`JOBS_INSERT_STATEMENT_TIMEOUT_MS`) and rolls its rows back; one multi-row
 * INSERT of this many rows (the ingest batch, spec 01a FR-6) takes milliseconds to a few seconds,
 * far inside that. The ingestor never builds a larger batch, and the store refuses one.
 */
export const MAX_UPSERT_ROWS_PER_STATEMENT = 250;

/**
 * `SET` of the upsert's `ON CONFLICT DO UPDATE`: the content and signal columns, `raw_data`,
 * `updated_at`, and coordinates only when new ones were resolved. Never `id`, `external_id` or
 * `created_at`: an update keeps the row's identity and its first insert's stamp.
 */
export function upsertSet(): Record<string, SQL> {
  const set: Record<string, SQL> = {};
  for (const column of CONTENT_COLUMNS) {
    set[columnKey(column.name)] = excluded(column.name);
  }
  const signals = incomingSignals();
  SIGNAL_COLUMNS.forEach((column, i) => {
    set[columnKey(column.name)] = signals[i]!;
  });
  set.rawData = excluded(jobs.rawData.name);
  set.updatedAt = excluded(jobs.updatedAt.name);
  // Keep stored coordinates unless new ones were resolved (for the row's current location).
  set.latitude = sql`coalesce(excluded."latitude", ${jobs.latitude})`;
  set.longitude = sql`coalesce(excluded."longitude", ${jobs.longitude})`;
  return set;
}

/**
 * The bulk upsert of one batch: ONE `INSERT … ON CONFLICT (external_id) DO UPDATE … WHERE
 * <changed>` statement (multi-row VALUES), built on the transaction of `withBoundedJobsInsert`.
 * Jobs-writer rule: every row ends with `createdAt: JOBS_CREATED_AT` (the INSERT's
 * `statement_timestamp()`; last, so no spread can override it) and the conflict `set` never
 * touches `created_at` ({@link upsertSet}). Run it only as
 * `withBoundedJobsInsert(db, (tx) => buildUpsertQuery(tx, rows))`.
 */
export function buildUpsertQuery(tx: JobsInsertTx, rows: JobRow[]) {
  return tx
    .insert(jobs)
    .values(rows.map((row) => ({ ...row, createdAt: JOBS_CREATED_AT })))
    .onConflictDoUpdate({ target: jobs.externalId, set: upsertSet(), setWhere: upsertChangedPredicate() })
    .returning({
      externalId: jobs.externalId,
      // xmax = 0 ⇔ the row was inserted by this statement (not updated).
      inserted: sql<boolean>`(xmax = 0)`,
    });
}

/** SQL expression for the normalised location key — must match {@link locationKey}. */
export function locationKeySql(): SQL {
  return sql`lower(btrim(coalesce(${jobs.locationCity}, ''))) || '|' || lower(btrim(coalesce(${jobs.locationState}, ''))) || '|' || lower(btrim(coalesce(${jobs.locationCountry}, '')))`;
}

/** Most recently updated stored coordinates per location key. */
export function buildLocationReuseQuery(keys: string[]): SQL {
  return sql`SELECT DISTINCT ON (s.k) s.k AS key, s.latitude, s.longitude
    FROM (
      SELECT ${locationKeySql()} AS k, ${jobs.latitude} AS latitude, ${jobs.longitude} AS longitude, ${jobs.updatedAt} AS updated_at
      FROM ${jobs}
      WHERE ${jobs.latitude} IS NOT NULL AND ${jobs.longitude} IS NOT NULL
    ) s
    WHERE s.k IN ${keys}
    ORDER BY s.k, s.updated_at DESC`;
}

/**
 * Every stored location's coordinates in ONE scan (spec 01a D26): one row per distinct
 * (location key, latitude, longitude) with its newest `updated_at`, at most `limit` rows. The
 * caller keeps, per key, the coordinates seen most recently — what {@link buildLocationReuseQuery}
 * returns per key. Grouping instead of `DISTINCT ON … ORDER BY` lets the planner hash instead of
 * sorting every row that has coordinates. No index covers the computed key (spec D1/D17), so each
 * {@link buildLocationReuseQuery} is a scan of the table too; a full run switches to this one
 * scan after a couple of those instead of paying one per batch.
 */
export function buildStoredCoordsQuery(limit: number): SQL {
  return sql`SELECT s.k AS key, s.latitude, s.longitude, max(s.updated_at) AS seen
    FROM (
      SELECT ${locationKeySql()} AS k, ${jobs.latitude} AS latitude, ${jobs.longitude} AS longitude, ${jobs.updatedAt} AS updated_at
      FROM ${jobs}
      WHERE ${jobs.latitude} IS NOT NULL AND ${jobs.longitude} IS NOT NULL
    ) s
    GROUP BY s.k, s.latitude, s.longitude
    LIMIT ${limit}`;
}

/**
 * The sources whose newest row was last seen before `before` (spec 01a D27), oldest first: one
 * scan of `jobs` grouped by source (compared case- and space-insensitively, as the ingestor does),
 * run once at the end of a full run. The sync writes `updated_at` as UTC wall-clock time (the
 * column encoder's ISO string, as `before` is sent here), so `last_seen` is rendered as UTC.
 */
export function buildStaleSourcesQuery(before: Date, limit: number): SQL {
  const site = sql`lower(btrim(${jobs.site}))`;
  return sql`SELECT ${site} AS site,
      to_char(max(${jobs.updatedAt}), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_seen,
      count(*)::int AS row_count
    FROM ${jobs}
    GROUP BY ${site}
    HAVING max(${jobs.updatedAt}) < ${sql.param(before, jobs.updatedAt)}
    ORDER BY max(${jobs.updatedAt})
    LIMIT ${limit}`;
}

/**
 * Step 1 of the cross-run dedup probe: rows sharing an exact title or company (btree indexes on
 * both), narrow columns only. Reading `raw_data` here would detoast the whole stored DTO of every
 * row of every company in the batch (one new posting of a large employer = thousands of rows).
 */
export function buildDedupCandidateQuery(
  database: Database | SyncTx,
  titles: string[],
  companies: string[],
) {
  const narrow = [
    titles.length > 0 ? inArray(jobs.title, titles) : undefined,
    companies.length > 0 ? inArray(jobs.companyName, companies) : undefined,
  ].filter((c): c is SQL => c !== undefined);
  return database
    .select({
      id: jobs.id,
      externalId: jobs.externalId,
      title: jobs.title,
      companyName: jobs.companyName,
    })
    .from(jobs)
    .where(or(...narrow));
}

/**
 * Step 2: the stored dedupKey of the few loosely matching candidates, by primary key, with the
 * row's source and the source id of the content it holds (spec 01a D23).
 */
export function buildDedupKeyQuery(database: Database | SyncTx, ids: number[]) {
  return database
    .select({
      id: jobs.id,
      externalId: jobs.externalId,
      site: jobs.site,
      sourceId: sql<string | null>`${jobs.rawData} ->> 'id'`,
      dedupKey: sql<string | null>`${jobs.rawData} ->> 'dedupKey'`,
    })
    .from(jobs)
    .where(and(inArray(jobs.id, ids), sql`${jobs.rawData} ->> 'dedupKey' IS NOT NULL`))
    .orderBy(asc(jobs.id));
}

/** Drizzle's `set` object is keyed by the TS property name, not the column name. */
const COLUMN_NAME_TO_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(getTableColumns(jobs)).map(([key, column]) => [column.name, key]),
);

function columnKey(columnName: string): string {
  const key = COLUMN_NAME_TO_KEY[columnName];
  if (!key) throw new Error(`Unknown jobs column: ${columnName}`);
  return key;
}

// ---------------------------------------------------------------------------
// Statement bounds (spec 01a D25)
// ---------------------------------------------------------------------------

/** The transaction handle the bounded sync statements run on. */
export type SyncTx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * `statement_timeout` of every read the sync makes (existence, dedup probe, write needs, stored
 * coordinates). They are index lookups and at most one table scan, normally milliseconds; the
 * bound turns a lock wait (a schema push holding `jobs`) or a runaway scan into a failed batch
 * instead of a run that never ends.
 */
export const SYNC_READ_TIMEOUT_MS = 30_000;

/** `statement_timeout` of the narrow last-seen refresh UPDATE (the upsert's own bound: 60 s). */
export const SYNC_REFRESH_TIMEOUT_MS = 60_000;

/** `idle_in_transaction_session_timeout` of those transactions (they hold one statement). */
export const SYNC_IDLE_IN_TRANSACTION_TIMEOUT_MS = 10_000;

/** The first statement of every bounded sync transaction (`set_config(..., true)` is `SET LOCAL`). */
export function syncStatementBoundSql(statementTimeoutMs: number): SQL {
  return sql`select set_config('statement_timeout', ${String(statementTimeoutMs)}, true), set_config('idle_in_transaction_session_timeout', ${String(SYNC_IDLE_IN_TRANSACTION_TIMEOUT_MS)}, true)`;
}

/**
 * Run one statement in a transaction bounded by `SET LOCAL` timeouts. A plain session `SET`
 * would leak to whoever next borrows the pooled connection, and a startup parameter is not
 * passed through a transaction-mode pooler; `SET LOCAL` ends with the transaction.
 */
export async function withSyncStatementBound<T>(
  database: Pick<Database, "transaction">,
  statementTimeoutMs: number,
  run: (tx: SyncTx) => PromiseLike<T>,
): Promise<T> {
  return database.transaction(async (tx) => {
    await tx.execute(syncStatementBoundSql(statementTimeoutMs));
    return await run(tx);
  });
}

// ---------------------------------------------------------------------------
// Drizzle implementation
// ---------------------------------------------------------------------------

export interface DrizzleJobStoreOptions {
  /** Default {@link SYNC_READ_TIMEOUT_MS}. */
  readTimeoutMs?: number;
  /** Default {@link SYNC_REFRESH_TIMEOUT_MS}. */
  refreshTimeoutMs?: number;
}

export function createDrizzleJobStore(database: Database = defaultDb, options: DrizzleJobStoreOptions = {}): JobStore {
  const readTimeoutMs = options.readTimeoutMs ?? SYNC_READ_TIMEOUT_MS;
  const refreshTimeoutMs = options.refreshTimeoutMs ?? SYNC_REFRESH_TIMEOUT_MS;
  const read = <T>(run: (tx: SyncTx) => PromiseLike<T>) => withSyncStatementBound(database, readTimeoutMs, run);
  return {
    async findExisting(externalIds) {
      const out = new Map<string, ExistingJobRef>();
      if (externalIds.length === 0) return out;
      const rows = await read((tx) =>
        tx
          .select({
            externalId: jobs.externalId,
            latitude: jobs.latitude,
            longitude: jobs.longitude,
            locationCity: jobs.locationCity,
            locationState: jobs.locationState,
            locationCountry: jobs.locationCountry,
            updatedAt: jobs.updatedAt,
          })
          .from(jobs)
          .where(inArray(jobs.externalId, externalIds)),
      );
      for (const r of rows) {
        out.set(r.externalId, {
          externalId: r.externalId,
          hasCoords: r.latitude !== null && r.longitude !== null,
          locationKey: locationKey({
            city: r.locationCity,
            state: r.locationState,
            country: r.locationCountry,
          }),
          updatedAt: r.updatedAt instanceof Date ? r.updatedAt : r.updatedAt ? new Date(r.updatedAt) : null,
        });
      }
      return out;
    },

    async findDedupCandidates({ titles, companies }) {
      if (titles.length === 0 && companies.length === 0) return [];
      return read((tx) => buildDedupCandidateQuery(tx, titles, companies));
    },

    async findDedupKeys(ids) {
      if (ids.length === 0) return [];
      const rows = await read((tx) => buildDedupKeyQuery(tx, ids));
      return rows.filter((r): r is DedupCandidate => typeof r.dedupKey === "string" && r.dedupKey !== "");
    },

    async findWriteNeeds(rows) {
      const out = new Map<string, WriteNeed>();
      if (rows.length === 0) return out;
      if (rows.length > MAX_UPSERT_ROWS_PER_STATEMENT) {
        throw new RangeError(`findWriteNeeds got ${rows.length} rows; at most ${MAX_UPSERT_ROWS_PER_STATEMENT}`);
      }
      const result = (await read((tx) => tx.execute(buildWriteNeedsQuery(rows)))) as unknown as Array<{
        external_id: string;
        write: boolean;
        refresh: boolean;
      }>;
      for (const r of result) {
        if (r.write === true) out.set(r.external_id, "write");
        else if (r.refresh === true) out.set(r.external_id, "refresh");
      }
      return out;
    },

    async refreshLastSeen(externalIds, seenAt) {
      if (externalIds.length === 0) return [];
      // Deduplicated and sorted for a stable statement; the lock order is the query's own
      // (external_id byte order, as the upsert's), see buildLastSeenRefreshQuery.
      const ids = [...new Set(externalIds)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      const rows = await withSyncStatementBound(database, refreshTimeoutMs, (tx) =>
        buildLastSeenRefreshQuery(tx, ids, seenAt),
      );
      return rows.map((r) => r.externalId);
    },

    async findCoordsForLocations(keys) {
      const out = new Map<string, Coords>();
      if (keys.length === 0) return out;
      const rows = (await read((tx) => tx.execute(buildLocationReuseQuery(keys)))) as unknown as Array<{
        key: string;
        latitude: string | number | null;
        longitude: string | number | null;
      }>;
      for (const r of rows) {
        if (r.latitude === null || r.longitude === null) continue;
        out.set(r.key, { latitude: String(r.latitude), longitude: String(r.longitude) });
      }
      return out;
    },

    async loadStoredCoords(limit) {
      const rows = (await read((tx) => tx.execute(buildStoredCoordsQuery(limit + 1)))) as unknown as Array<{
        key: string;
        latitude: string | number | null;
        longitude: string | number | null;
        seen: Date | string | null;
      }>;
      if (rows.length > limit) return null;
      return newestCoordsPerKey(rows);
    },

    async findStaleSources(before, limit) {
      const rows = (await read((tx) => tx.execute(buildStaleSourcesQuery(before, limit)))) as unknown as Array<{
        site: string;
        last_seen: string;
        row_count: number | string;
      }>;
      return rows.map((r) => ({ site: r.site, lastSeen: r.last_seen, rows: Number(r.row_count) }));
    },

    async upsertBatch(rows) {
      if (rows.length === 0) return [];
      if (rows.length > MAX_UPSERT_ROWS_PER_STATEMENT) {
        throw new RangeError(
          `upsertBatch got ${rows.length} rows; at most ${MAX_UPSERT_ROWS_PER_STATEMENT} fit one bounded jobs INSERT`,
        );
      }
      // Jobs-writer rule: one INSERT in a transaction bounded by SET LOCAL timeouts, stamped by the
      // database (JOBS_CREATED_AT). Everything else (reads, geocoding) happened before this call.
      const returned = await withBoundedJobsInsert(database, (tx) => buildUpsertQuery(tx, rows));
      return returned.map((r) => ({ externalId: r.externalId, inserted: r.inserted === true }));
    },
  };
}

/**
 * Per location key, the coordinates seen most recently (rows of {@link buildStoredCoordsQuery}:
 * one per distinct key + coordinates, with their newest `updated_at`).
 */
export function newestCoordsPerKey(
  rows: Array<{
    key: string;
    latitude: string | number | null;
    longitude: string | number | null;
    seen: Date | string | null;
  }>,
): Map<string, Coords> {
  const best = new Map<string, { coords: Coords; seen: number }>();
  for (const r of rows) {
    if (r.latitude === null || r.longitude === null) continue;
    const seen = r.seen === null ? Number.NEGATIVE_INFINITY : new Date(r.seen).getTime();
    const current = best.get(r.key);
    if (!current || seen > current.seen) {
      best.set(r.key, { coords: { latitude: String(r.latitude), longitude: String(r.longitude) }, seen });
    }
  }
  return new Map([...best].map(([key, v]) => [key, v.coords]));
}
