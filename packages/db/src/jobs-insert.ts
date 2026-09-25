import { getTableName, sql, type SQL } from "drizzle-orm";
import type { Database } from "./client";
import { jobs } from "./schema/jobs";

/**
 * THE RULE FOR EVERY WRITER THAT INSERTS INTO `jobs` (enforced by `jobs-insert-guard.test.ts` in
 * CI and by {@link withBoundedJobsInsert} at run time).
 *
 *  1. Stamp `created_at` with {@link JOBS_CREATED_AT}: every row of the INSERT's values ends with
 *     `createdAt: JOBS_CREATED_AT` (imported from this module / `@ever-hust/db`), never any other
 *     value, and an `ON CONFLICT DO UPDATE` never sets `created_at` (an update keeps the first
 *     insert's value).
 *  2. Run the INSERT through {@link withBoundedJobsInsert}: one transaction that bounds its own
 *     duration with `SET LOCAL` timeouts, then runs exactly one INSERT statement. The callback is a
 *     single expression, `(tx) => tx.insert(jobs)...` (or a call to a builder declared in the same
 *     file that takes `tx: JobsInsertTx` and is itself that single expression), and awaits nothing.
 *     No raw `INSERT INTO jobs`.
 *
 * Why: job alerts read `jobs.created_at` once per period and never look at that period again
 * (`packages/triggers/src/work/job-alerts.ts`, `ALERT_JOBS_SETTLE_MS`). That is only safe if a row
 * whose `created_at` is T is visible to every read that starts after T + a known bound. A
 * timestamp taken before the INSERT reaches the database has no such bound: a JavaScript
 * `new Date()` before `await db.insert(...)` (the insert can wait on a pool slot or a lock), and
 * equally the column default `now()`, which is the start of the TRANSACTION: nothing times the gap
 * between `BEGIN` and the `SET LOCAL` statement, so a client stalled there for minutes would commit
 * a row stamped minutes in the past, after the digest for its period was read. With these rules the
 * time from `created_at` to the commit is at most {@link JOBS_INSERT_MAX_LATENCY_MS}, whatever
 * happened before the INSERT.
 *
 * `packages/db/src/seed.ts` (dev / CI data) follows the same rules so the guard needs no exceptions.
 */

const SECOND_MS = 1000;

/**
 * The only value a writer may give `createdAt` (rule 1): the database's `statement_timestamp()`,
 * the instant the server received the INSERT itself. The INSERT's statement timeout started no
 * later than that (with its first protocol message), and everything before it (the `BEGIN`, the
 * `SET LOCAL`, any client stall between them) no longer moves the stamp. It is the database's
 * clock, not the app's: see `ALERT_DB_CLOCK_MAX_SKEW_MS` in `packages/triggers/src/work/job-alerts.ts`.
 *
 * `statement_timestamp()` is a `timestamptz`; `created_at` is a `timestamp` WITHOUT time zone, so
 * PostgreSQL converts it with the session's `TimeZone`, which {@link jobsInsertBoundSql} pins to UTC
 * for the transaction before the INSERT runs (every row of one INSERT gets the same value).
 */
export const JOBS_CREATED_AT: SQL = sql`statement_timestamp()`;

/**
 * `SET LOCAL statement_timeout`. It cancels (and rolls back) the INSERT 60 s after the INSERT's first
 * protocol message reached the server, which is no later than its {@link JOBS_CREATED_AT}. It does
 * NOT cover the COMMIT's own work: PostgreSQL disables the statement timer before it commits
 * (`finish_xact_command`), which is why the bound statement also pins `synchronous_commit`.
 */
export const JOBS_INSERT_STATEMENT_TIMEOUT_MS = 60 * SECOND_MS;

/**
 * `SET LOCAL idle_in_transaction_session_timeout`: the server ends the session (rolling the
 * transaction back) when the client leaves it idle this long between two statements; in the
 * bound, the gap between the INSERT and the COMMIT.
 */
export const JOBS_INSERT_IDLE_TIMEOUT_MS = 10 * SECOND_MS;

/**
 * Slack for what no server timeout covers once the INSERT has arrived: the COMMIT (its local WAL
 * flush, a disk write that cannot be cancelled; with `synchronous_commit = local` it never waits
 * for a standby) and the hop between the INSERT's Execute and its Sync message (postgres.js sends
 * them in one write). Each normally takes milliseconds.
 */
export const JOBS_INSERT_UNGUARDED_SLACK_MS = 50 * SECOND_MS;

/**
 * Upper bound on the time from a `jobs` row's `created_at` ({@link JOBS_CREATED_AT}) to the commit
 * that makes it visible, for rows written through {@link withBoundedJobsInsert}: the INSERT's
 * statement timeout, the idle gap before the COMMIT and {@link JOBS_INSERT_UNGUARDED_SLACK_MS}.
 * What happens before the INSERT (`BEGIN`, the `SET`, a stalled client) is not in it: the stamp
 * is taken after. A transaction that would take longer is cancelled or its session ended, so its
 * rows never become visible at all. Job alerts rely on
 * `ALERT_JOBS_SETTLE_MS > JOBS_INSERT_MAX_LATENCY_MS + ALERT_WINDOW_END_MAX_FUTURE_MS + ALERT_DB_CLOCK_MAX_SKEW_MS`
 * (tested in `packages/triggers/src/work/job-alerts.test.ts`).
 */
export const JOBS_INSERT_MAX_LATENCY_MS =
  JOBS_INSERT_STATEMENT_TIMEOUT_MS + JOBS_INSERT_IDLE_TIMEOUT_MS + JOBS_INSERT_UNGUARDED_SLACK_MS;

/**
 * The first statement of every jobs-insert transaction. `set_config(..., true)` is `SET LOCAL`: the
 * values end with the transaction.
 *  - The two timeouts bound the INSERT and the gap before the COMMIT.
 *  - `synchronous_commit = local`: the COMMIT waits for the local WAL flush only, never for a
 *    synchronous standby. No timeout covers that wait, and the row is invisible until it ends
 *    (checked on PostgreSQL 16 with an unreachable synchronous standby: the COMMIT waited over
 *    5 min, ignoring the statement timeout, and the row appeared when the wait was cut). The shared
 *    cluster replicates asynchronously today, so this changes nothing there; it keeps the bound if
 *    a synchronous replica is ever added. The cost: a failover in the instant after the commit could
 *    lose the row on the new primary, and the next sync writes it again (a later alert, not none).
 *  - `TimeZone = UTC` because `created_at` is a `timestamp` WITHOUT time zone:
 *    {@link JOBS_CREATED_AT} (a `timestamptz`) is converted with the session's time zone, and the
 *    rest of the code reads and compares that column as UTC (Drizzle sends and reads it as UTC).
 */
export function jobsInsertBoundSql(): SQL {
  return sql`select set_config('statement_timeout', ${String(JOBS_INSERT_STATEMENT_TIMEOUT_MS)}, true), set_config('idle_in_transaction_session_timeout', ${String(JOBS_INSERT_IDLE_TIMEOUT_MS)}, true), set_config('synchronous_commit', 'local', true), set_config('TimeZone', 'UTC', true)`;
}

/** The transaction handle {@link withBoundedJobsInsert} passes to its callback. */
export type JobsInsertTx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** What the callback of {@link withBoundedJobsInsert} returns: one Drizzle INSERT, not yet run. */
export interface JobsInsertStatement<T> extends PromiseLike<T> {
  toSQL(): { sql: string; params: unknown[] };
}

/** Split one parenthesised SQL tuple starting at `open`: its top-level items and the index after it. */
function readSqlTuple(text: string, open: number): { items: string[]; end: number } | null {
  const items: string[] = [];
  let depth = 0;
  let quote: "'" | '"' | null = null;
  let start = open + 1;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = null; // a doubled quote re-opens on the next character
      continue;
    }
    if (c === "'" || c === '"') quote = c;
    else if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) {
        items.push(text.slice(start, i).trim());
        return { items, end: i + 1 };
      }
    } else if (c === "," && depth === 1) {
      items.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  return null;
}

/**
 * Why a rendered statement breaks rule 1, or null when it follows it: it must be an
 * `insert into "jobs"` whose every VALUES row sets `created_at` to `statement_timestamp()`
 * ({@link JOBS_CREATED_AT}), and whose `ON CONFLICT DO UPDATE` (if any) does not set `created_at`.
 * Works on the SQL Drizzle renders (`insert into "jobs" ("id", ...) values (default, $1, ...), (...)`).
 */
export function jobsInsertSqlProblem(text: string): string | null {
  const head = `insert into "${getTableName(jobs)}" (`;
  if (!text.startsWith(head)) return "it is not an INSERT into the jobs table";
  const columnsEnd = text.indexOf(")", head.length);
  const columns = text.slice(head.length, columnsEnd).split(",").map((c) => c.trim());
  const at = columns.indexOf('"created_at"');
  if (at < 0) return "it does not list created_at";
  const valuesKeyword = " values ";
  if (!text.startsWith(valuesKeyword, columnsEnd + 1)) return "it has no VALUES list";
  let i = columnsEnd + 1 + valuesKeyword.length;
  let rows = 0;
  for (;;) {
    const tuple = text[i] === "(" ? readSqlTuple(text, i) : null;
    if (!tuple || tuple.items.length !== columns.length) return "its VALUES list could not be read";
    rows++;
    if (tuple.items[at] !== "statement_timestamp()") {
      return `row ${rows} sets created_at to \`${tuple.items[at]}\`, not JOBS_CREATED_AT`;
    }
    i = tuple.end;
    if (text.startsWith(", (", i)) i += 2;
    else break;
  }
  if (/(?:\bdo update set |, )"created_at" = /.test(text.slice(i))) return "its ON CONFLICT DO UPDATE sets created_at";
  return null;
}

/**
 * Run ONE INSERT into `jobs` (with any `ON CONFLICT` / `RETURNING`) inside a transaction that ends
 * within {@link JOBS_INSERT_MAX_LATENCY_MS} of the rows' `created_at`. The callback builds that
 * single statement on `tx` and returns it; every row sets `createdAt: JOBS_CREATED_AT` (last, so
 * no spread can override it), and its conflict `set` never touches `createdAt`.
 *
 * ```ts
 * await withBoundedJobsInsert(db, (tx) =>
 *   tx
 *     .insert(jobs)
 *     .values({ ...row, createdAt: JOBS_CREATED_AT })
 *     .onConflictDoUpdate({ target: jobs.externalId, set: update }),
 * );
 * ```
 *
 * Only one statement: every extra statement would add its own timeout to the bound. Anything else
 * (reads, geocoding, HTTP) happens before the call, outside the transaction, and the callback
 * awaits nothing (the guard checks this). Before running it, the statement's SQL is checked with
 * {@link jobsInsertSqlProblem}: one that does not stamp every row with `statement_timestamp()`, or
 * that sets `created_at` on conflict, is refused (the transaction rolls back, nothing is written).
 *
 * Checked on PostgreSQL 16 with postgres.js 3.4: with such a callback, a gap over
 * {@link JOBS_INSERT_IDLE_TIMEOUT_MS} (an event-loop stall before the INSERT or before the COMMIT)
 * ends the session, the row is rolled back and the call rejects; the process is fine. A stall
 * between `BEGIN` and the `SET` (no timeout there) only delays the stamp. A callback that is still
 * awaiting something when the session ends goes on to send a query on the closed connection, which
 * postgres.js turns into an uncaught TypeError.
 */
export async function withBoundedJobsInsert<T>(
  database: Pick<Database, "transaction">,
  insert: (tx: JobsInsertTx) => JobsInsertStatement<T>,
): Promise<T> {
  return database.transaction(async (tx) => {
    await tx.execute(jobsInsertBoundSql());
    const statement = insert(tx);
    const problem = jobsInsertSqlProblem(statement.toSQL().sql);
    if (problem) {
      throw new Error(
        `withBoundedJobsInsert refused the statement: ${problem}. Every row must end with createdAt: JOBS_CREATED_AT, and ON CONFLICT DO UPDATE must not set it (packages/db/src/jobs-insert.ts).`,
      );
    }
    return await statement;
  });
}
