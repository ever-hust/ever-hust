import { sql, type SQL } from "drizzle-orm";
import type { Database } from "./client";

/**
 * THE RULE FOR EVERY WRITER THAT INSERTS INTO `jobs` (enforced by `jobs-insert-guard.test.ts`).
 *
 *  1. Never pass `createdAt`. The database sets `created_at` (column default `now()`, i.e. the
 *     start of the inserting transaction), and an `ON CONFLICT DO UPDATE` never sets it.
 *  2. Run the INSERT through {@link withBoundedJobsInsert}: one transaction that first bounds its
 *     own duration with `SET LOCAL` timeouts, then runs exactly one INSERT statement, built by a
 *     callback that awaits nothing. No raw `INSERT INTO jobs`.
 *
 * Why: job alerts read `jobs.created_at` once per period and never look at that period again
 * (`packages/triggers/src/work/job-alerts.ts`, `ALERT_JOBS_SETTLE_MS`). That is only safe if a row
 * whose `created_at` is T is visible to every read that starts after T + a known bound. A
 * timestamp taken in JavaScript before `await db.insert(...)` has no such bound (the insert can wait
 * on a lock or a pool slot for as long as it likes), so a job could commit after the digest for its
 * period was read, carry a timestamp inside that period, and never be alerted. With these two rules
 * the time from `created_at` to the commit is at most {@link JOBS_INSERT_MAX_LATENCY_MS}.
 *
 * `packages/db/src/seed.ts` (dev / CI data) follows the same rule so the guard needs no exceptions.
 */

const SECOND_MS = 1000;

/** `SET LOCAL statement_timeout`: the one INSERT is cancelled (and rolled back) after this. */
export const JOBS_INSERT_STATEMENT_TIMEOUT_MS = 60 * SECOND_MS;

/**
 * `SET LOCAL idle_in_transaction_session_timeout`: the server ends the session (rolling the
 * transaction back) when the client leaves it idle this long between two statements — after the
 * `SET`, and between the INSERT and the COMMIT.
 */
export const JOBS_INSERT_IDLE_TIMEOUT_MS = 10 * SECOND_MS;

/**
 * Slack for the parts of the transaction that no server timeout covers: the round trip between
 * the reply to `BEGIN` (the instant `now()` returns) and the `SET` statement, the `SET` itself (a
 * lock-free SELECT), and the COMMIT's WAL flush. Each normally takes milliseconds.
 */
export const JOBS_INSERT_UNGUARDED_SLACK_MS = 40 * SECOND_MS;

/**
 * Upper bound on the time from a `jobs` row's `created_at` to the commit that makes it visible,
 * for rows written through {@link withBoundedJobsInsert}: the INSERT's statement timeout, the two
 * idle gaps, and {@link JOBS_INSERT_UNGUARDED_SLACK_MS}. A transaction that would take longer is
 * cancelled or its session ended, so its rows never become visible at all. Job alerts rely on
 * `ALERT_JOBS_SETTLE_MS > JOBS_INSERT_MAX_LATENCY_MS + ALERT_WINDOW_END_MAX_FUTURE_MS` (tested in
 * `packages/triggers/src/work/job-alerts.test.ts`).
 */
export const JOBS_INSERT_MAX_LATENCY_MS =
  JOBS_INSERT_STATEMENT_TIMEOUT_MS + 2 * JOBS_INSERT_IDLE_TIMEOUT_MS + JOBS_INSERT_UNGUARDED_SLACK_MS;

/**
 * The first statement of every jobs-insert transaction. `set_config(..., true)` is `SET LOCAL`: the
 * values end with the transaction. `TimeZone` is pinned to UTC because `created_at` is a `timestamp`
 * WITHOUT time zone: the `now()` default is converted with the session's time zone, and the rest of
 * the code reads and compares that column as UTC (Drizzle sends and reads it as UTC).
 */
export function jobsInsertBoundSql(): SQL {
  return sql`select set_config('statement_timeout', ${String(JOBS_INSERT_STATEMENT_TIMEOUT_MS)}, true), set_config('idle_in_transaction_session_timeout', ${String(JOBS_INSERT_IDLE_TIMEOUT_MS)}, true), set_config('TimeZone', 'UTC', true)`;
}

/** The transaction handle {@link withBoundedJobsInsert} passes to its callback. */
export type JobsInsertTx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Run ONE INSERT into `jobs` (with any `ON CONFLICT` / `RETURNING`) inside a transaction whose
 * duration is bounded by {@link JOBS_INSERT_MAX_LATENCY_MS}. The callback builds that single
 * statement on `tx` and returns it; do not pass `createdAt` in its values or its conflict `set`.
 *
 * ```ts
 * await withBoundedJobsInsert(db, (tx) =>
 *   tx.insert(jobs).values(row).onConflictDoUpdate({ target: jobs.externalId, set: update }),
 * );
 * ```
 *
 * Only one statement: every extra statement would add its own timeout to the bound. Anything else
 * (reads, geocoding, HTTP) happens before the call, outside the transaction, and the callback
 * awaits nothing (the guard checks this). Checked on PostgreSQL 16 with postgres.js 3.4: with such
 * a callback, a gap over {@link JOBS_INSERT_IDLE_TIMEOUT_MS} (an event-loop stall before the INSERT
 * or before the COMMIT) ends the session, the row is rolled back and the call rejects; the process
 * is fine. A callback that is still awaiting something when the session ends goes on to send a
 * query on the closed connection, which postgres.js turns into an uncaught TypeError.
 */
export async function withBoundedJobsInsert<T>(
  database: Pick<Database, "transaction">,
  insert: (tx: JobsInsertTx) => PromiseLike<T>,
): Promise<T> {
  return database.transaction(async (tx) => {
    await tx.execute(jobsInsertBoundSql());
    return await insert(tx);
  });
}
