import { and, asc, getTableColumns, inArray, or, sql, type SQL } from "drizzle-orm";
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
 * Every method is one statement, sized by the ingest batch (≤ a few hundred ids/keys). The upsert
 * follows the jobs-writer rule (`packages/db/src/jobs-insert.ts`, enforced by
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

export interface DedupCandidate {
  id: number;
  externalId: string;
  dedupKey: string;
}

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
   * One bulk upsert statement in one bounded transaction (spec 01a FR-7, the jobs-writer rule).
   * Rows must have distinct `externalId`s; at most {@link MAX_UPSERT_ROWS_PER_STATEMENT} of them.
   */
  upsertBatch(rows: JobRow[]): Promise<WrittenRow[]>;
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

const excluded = (name: string) => sql`excluded.${sql.identifier(name)}`;

/**
 * The corpus-signal columns (spec #4 liveness / #7 legitimacy). Signals are opt-in per request
 * (`EVER_JOBS_REQUEST_SIGNALS`, off by default), so a DTO without them means "not asked", not
 * "no verdict": a stored verdict is kept until a new one arrives. Legitimacy reasons follow their
 * verdict (a new verdict without reasons clears the old reasons).
 */
export const SIGNAL_COLUMNS = [jobs.liveness, jobs.legitimacy, jobs.legitimacyReasons] as const;

/** Effective incoming value of each {@link SIGNAL_COLUMNS} entry (same order). */
function incomingSignals(): SQL[] {
  return [
    sql`coalesce(excluded."liveness", ${jobs.liveness})`,
    sql`coalesce(excluded."legitimacy", ${jobs.legitimacy})`,
    sql`CASE WHEN excluded."legitimacy" IS NOT NULL THEN excluded."legitimacy_reasons" ELSE ${jobs.legitimacyReasons} END`,
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
 */
export function upsertChangedPredicate(): SQL {
  const current = sql.join(
    CONTENT_COLUMNS.map((c) => sql`${c}`),
    sql`, `,
  );
  const incoming = sql.join(
    CONTENT_COLUMNS.map((c) => excluded(c.name)),
    sql`, `,
  );
  const currentSignals = sql.join(
    SIGNAL_COLUMNS.map((c) => sql`${c}`),
    sql`, `,
  );
  const incomingSignalValues = sql.join(incomingSignals(), sql`, `);
  const incomingSourceId = sql`(excluded."raw_data" ->> 'id')`;
  return sql`CASE WHEN ${incomingSourceId} IS NOT NULL AND ${incomingSourceId} <> excluded."external_id"
    THEN ${jobs.updatedAt} < excluded."updated_at" - interval '${sql.raw(String(MERGE_TAKEOVER_DAYS))} days'
    ELSE (${current}) IS DISTINCT FROM (${incoming})
    OR (${currentSignals}) IS DISTINCT FROM (${incomingSignalValues})
    OR (${jobs.latitude} IS NULL AND excluded."latitude" IS NOT NULL)
    OR (${jobs.rawData} -> 'dedupKey') IS DISTINCT FROM (excluded."raw_data" -> 'dedupKey')
    OR (${jobs.rawData} -> 'careerLevel') IS DISTINCT FROM (excluded."raw_data" -> 'careerLevel')
    OR ${jobs.updatedAt} < excluded."updated_at" - interval '${sql.raw(String(LAST_SEEN_REFRESH_DAYS))} days'
    END`;
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
 * Step 1 of the cross-run dedup probe: rows sharing an exact title or company (btree indexes on
 * both), narrow columns only. Reading `raw_data` here would detoast the whole stored DTO of every
 * row of every company in the batch (one new posting of a large employer = thousands of rows).
 */
export function buildDedupCandidateQuery(
  database: Database,
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

/** Step 2: the stored dedupKey of the few loosely matching candidates, by primary key. */
export function buildDedupKeyQuery(database: Database, ids: number[]) {
  return database
    .select({
      id: jobs.id,
      externalId: jobs.externalId,
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
// Drizzle implementation
// ---------------------------------------------------------------------------

export function createDrizzleJobStore(database: Database = defaultDb): JobStore {
  return {
    async findExisting(externalIds) {
      const out = new Map<string, ExistingJobRef>();
      if (externalIds.length === 0) return out;
      const rows = await database
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
        .where(inArray(jobs.externalId, externalIds));
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
      return buildDedupCandidateQuery(database, titles, companies);
    },

    async findDedupKeys(ids) {
      if (ids.length === 0) return [];
      const rows = await buildDedupKeyQuery(database, ids);
      return rows.filter((r): r is DedupCandidate => typeof r.dedupKey === "string" && r.dedupKey !== "");
    },

    async findCoordsForLocations(keys) {
      const out = new Map<string, Coords>();
      if (keys.length === 0) return out;
      const rows = (await database.execute(buildLocationReuseQuery(keys))) as unknown as Array<{
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
