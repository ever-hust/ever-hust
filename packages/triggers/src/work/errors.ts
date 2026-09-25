/**
 * Errors thrown by the app-runtime work functions (`@ever-hust/triggers/work`).
 *
 * The cron route layer (`apps/web/lib/cron-route.ts`) maps them to HTTP responses by SHAPE
 * (`cronStatus` / `cronDetails`), not by `instanceof`, so a bundler that duplicates this module
 * cannot turn a partial failure into a generic 500 without its counters.
 *
 * Rule: a run that did not finish cleanly must surface as a non-2xx response so the calling
 * Trigger.dev run shows FAILED (and, where the task allows, retries). Never "200 with errors".
 */

/** The work ran but did not finish cleanly (some items failed or were deferred). */
export class CronWorkError extends Error {
  readonly cronStatus: number;
  /** Counters of the partial run, returned to the caller as `details`. */
  readonly cronDetails: unknown;

  constructor(message: string, details: unknown, status = 500) {
    super(message);
    this.name = "CronWorkError";
    this.cronStatus = status;
    this.cronDetails = details;
  }
}

/** The request itself is unusable (bad payload, unknown user). Nothing was done. */
export class CronInputError extends Error {
  readonly cronStatus: number;

  constructor(message: string, status: 400 | 404 | 422 = 400) {
    super(message);
    this.name = "CronInputError";
    this.cronStatus = status;
  }
}

/** Default wall-clock budget for one app-side run (the Trigger caller times out at ~290 s). */
export const DEFAULT_WORK_BUDGET_MS = 240_000;

/** Absolute deadline (epoch ms) for a run that starts now. */
export function deadlineFrom(startMs: number, budgetMs = DEFAULT_WORK_BUDGET_MS): number {
  return startMs + budgetMs;
}
