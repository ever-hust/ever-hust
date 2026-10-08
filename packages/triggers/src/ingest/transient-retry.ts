import { errorText } from "./errors";

/**
 * A small, bounded retry for one sync statement that failed on a TRANSIENT CONNECTION error
 * (handover H-2 follow-up (a)). On 2026-09-27 a hust-dev full run aborted after three 250-row
 * batches in a row failed with `getaddrinfo EAI_AGAIN pg-rw.databases.svc.cluster.local`: a
 * cluster DNS blip of seconds threw away the run.
 *
 * Conservative on purpose:
 * - only the connection-level codes in {@link TRANSIENT_CONNECTION_CODES} are retried, found on
 *   the error or its `cause` chain (Drizzle wraps the driver's error as `Failed query: …` with the
 *   driver error in `cause`);
 * - never an error the SERVER answered (a postgres.js `PostgresError`, which carries a SQLSTATE
 *   and a `severity`): constraint violations, statement timeouts (57014), serialization failures
 *   and the like are not retried;
 * - at most {@link DEFAULT_TRANSIENT_ATTEMPTS} attempts, waiting
 *   {@link DEFAULT_TRANSIENT_DELAYS_MS} between them (≈ 6.5 s in all), so a database that is really
 *   down still fails its batch quickly and the ingestor's consecutive-failure abort still applies.
 *
 * Each attempt is the whole bounded transaction again (`withSyncStatementBound` /
 * `withBoundedJobsInsert`): a new connection, a new `SET LOCAL`, and for the upsert a new
 * `statement_timestamp()` stamp, so the jobs-writer rule holds per attempt. Re-running a statement
 * whose COMMIT may have landed before the connection dropped is safe: reads are reads, the upsert
 * is `INSERT … ON CONFLICT (external_id) DO UPDATE … WHERE <changed>` (a row it already wrote is
 * unchanged the second time), and the last-seen refresh only touches rows still stale.
 */

/**
 * Connection-level error codes retried: DNS lookups that failed for now (`EAI_AGAIN`), or did not
 * resolve while cluster DNS flaps (`ENOTFOUND`; bounded like the rest, so a wrong host still fails
 * within seconds), a connection reset or timed out at the socket (`ECONNRESET`, `ETIMEDOUT`), and
 * postgres.js's own connect timeout (`CONNECT_TIMEOUT`). Deliberately NOT `ECONNREFUSED` or
 * postgres.js's `CONNECTION_CLOSED` / `CONNECTION_ENDED` / `CONNECTION_DESTROYED`.
 */
export const TRANSIENT_CONNECTION_CODES: ReadonlySet<string> = new Set([
  "EAI_AGAIN",
  "ENOTFOUND",
  "ECONNRESET",
  "ETIMEDOUT",
  "CONNECT_TIMEOUT",
]);

export const DEFAULT_TRANSIENT_ATTEMPTS = 4;
/** Wait before the 2nd, 3rd, 4th attempt (the last value repeats for more attempts). */
export const DEFAULT_TRANSIENT_DELAYS_MS: readonly number[] = [500, 1_500, 4_500];

/** How deep the `cause` chain is searched. */
const MAX_CAUSE_DEPTH = 6;

/**
 * True when `err` (or an error in its `cause` chain) has a code from
 * {@link TRANSIENT_CONNECTION_CODES} and no error in the chain is one the database server answered.
 */
export function isTransientConnectionError(err: unknown): boolean {
  let transient = false;
  let current: unknown = err;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current !== null && typeof current === "object"; depth++) {
    const e = current as { name?: unknown; code?: unknown; severity?: unknown; cause?: unknown };
    // The server answered (postgres.js PostgresError: SQLSTATE `code` + `severity`): not transient here.
    if (e.name === "PostgresError" || typeof e.severity === "string") return false;
    if (typeof e.code === "string" && TRANSIENT_CONNECTION_CODES.has(e.code)) transient = true;
    current = e.cause;
  }
  return transient;
}

/** The first code found on `err`'s cause chain (for the log line). */
function codeOf(err: unknown): string {
  let current: unknown = err;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current !== null && typeof current === "object"; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return "unknown";
}

export interface TransientRetryOptions {
  /** Attempts in all, at least 1 (default {@link DEFAULT_TRANSIENT_ATTEMPTS}). */
  attempts?: number;
  /** Waits between attempts (default {@link DEFAULT_TRANSIENT_DELAYS_MS}). */
  delaysMs?: readonly number[];
  /** Default: a real timer. */
  sleep?: (ms: number) => Promise<void>;
  /** Called before each wait. Default: one `console.warn` line. Must not throw. */
  onRetry?: (info: { error: unknown; code: string; attempt: number; attempts: number; delayMs: number }) => void;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function warnRetry(info: { error: unknown; code: string; attempt: number; attempts: number; delayMs: number }): void {
  console.warn(
    `[jobs-sync] transient database connection error (${info.code}) on attempt ${info.attempt}/${info.attempts};` +
      ` retrying in ${info.delayMs} ms: ${errorText(info.error)}`,
  );
}

/**
 * Run `run`; when it fails with {@link isTransientConnectionError}, wait and run it again, at most
 * `attempts` times in all. Any other error, or the last attempt's, is rethrown as is.
 */
export async function withTransientRetry<T>(run: () => Promise<T>, options: TransientRetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, Math.floor(options.attempts ?? DEFAULT_TRANSIENT_ATTEMPTS));
  const delays = options.delaysMs && options.delaysMs.length > 0 ? options.delaysMs : DEFAULT_TRANSIENT_DELAYS_MS;
  const sleep = options.sleep ?? realSleep;
  const onRetry = options.onRetry ?? warnRetry;
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= attempts || !isTransientConnectionError(error)) throw error;
      const delayMs = Math.max(0, delays[Math.min(attempt - 1, delays.length - 1)]!);
      try {
        onRetry({ error, code: codeOf(error), attempt, attempts, delayMs });
      } catch {
        // logging must never change the outcome
      }
      await sleep(delayMs);
    }
  }
}
