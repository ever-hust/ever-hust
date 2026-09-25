import { CronInputError } from "./errors";

/**
 * The end of a job-alert run's window (`windowEnd` in `POST /api/cron/job-alerts`).
 *
 * It must be the SAME on every attempt of one Trigger.dev run, so the Trigger task sends the
 * schedule's fire time (`payload.timestamp`) or, for an on-demand run, the run's creation time
 * (`ctx.run.createdAt`). Both are stored with the run, so a retry sends the same value. A direct
 * call without it gets the app's current time. See `work/job-alerts.ts` for how it is used.
 *
 * This module has no database or email imports: the app route's request schema uses it too.
 */

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * How far ahead of the app's clock a window end may be. It covers clock skew between Trigger.dev
 * and the app. It must stay below `ALERT_JOBS_SETTLE_MS − JOBS_INSERT_MAX_LATENCY_MS`
 * (`work/job-alerts.ts`), so every job of an accepted window's jobs part has committed when the run
 * reads it. A test checks this.
 */
export const ALERT_WINDOW_END_MAX_FUTURE_MS = 5 * MINUTE_MS;

/**
 * How old a window end may be. A weekly run's retries and replays stay well inside this. An older
 * value is almost certainly a mistake (a stale payload or a wrong unit), so it is refused.
 */
export const ALERT_WINDOW_END_MAX_AGE_MS = 8 * DAY_MS;

/** Why `windowEnd` cannot be used at `now`, or null when it can. */
export function alertWindowEndProblem(windowEnd: Date, now: Date): string | null {
  const t = windowEnd.getTime();
  if (!Number.isFinite(t)) return "windowEnd is not a valid date";
  if (t > now.getTime() + ALERT_WINDOW_END_MAX_FUTURE_MS) {
    return `windowEnd is more than ${ALERT_WINDOW_END_MAX_FUTURE_MS / MINUTE_MS} min in the future`;
  }
  if (t < now.getTime() - ALERT_WINDOW_END_MAX_AGE_MS) {
    return `windowEnd is more than ${ALERT_WINDOW_END_MAX_AGE_MS / DAY_MS} days old`;
  }
  return null;
}

/**
 * The window end a run uses: the caller's value (an ISO 8601 string or a Date), or `now` when there
 * is none. Throws {@link CronInputError} (400) for a value that is not a date, is more than
 * {@link ALERT_WINDOW_END_MAX_FUTURE_MS} in the future or more than
 * {@link ALERT_WINDOW_END_MAX_AGE_MS} old. The result has millisecond precision, like every value
 * written to `user_alerts.last_sent_at`.
 */
export function resolveAlertWindowEnd(input: Date | string | undefined, now: Date): Date {
  if (input === undefined) return new Date(now.getTime());
  const windowEnd = typeof input === "string" ? new Date(input) : new Date(input.getTime());
  const problem = alertWindowEndProblem(windowEnd, now);
  if (problem) throw new CronInputError(`Invalid windowEnd: ${problem}.`);
  return windowEnd;
}
