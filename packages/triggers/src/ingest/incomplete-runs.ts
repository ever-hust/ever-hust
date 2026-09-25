/**
 * Escalation of a full crawl that never completes (spec 01a D27).
 *
 * A partial crawl is not a failure (D21): what arrived is stored and the run is `ok`. But when
 * full runs are incomplete run after run (e.g. Ever Jobs still cuts its fan-out at the default
 * 120 s, D19 step 1), the sources it always skips are never refreshed, and the daily 90-day
 * cleanup can delete their postings while they are still open. So this process counts the full
 * runs in a row that were not complete; from {@link INCOMPLETE_FULL_RUNS_ALERT} on, the run logs an
 * error and the scheduled full task fails (a Trigger alert) until a complete run resets the count.
 * Skipped runs (full mode gated off, D18) change nothing. The count is per process: with several
 * web pods, each counts the runs it served, so the alert can come later, never earlier.
 */

/** Incomplete full runs in a row that raise the alarm: one day of 6-hourly runs. */
export const INCOMPLETE_FULL_RUNS_ALERT = 4;

export class IncompleteRunTracker {
  private streak = 0;

  /** Incomplete full runs in a row so far (0 after a complete one). */
  get current(): number {
    return this.streak;
  }

  /** Record a finished, non-skipped full run; returns the streak including it (0 when complete). */
  record(complete: boolean): number {
    this.streak = complete ? 0 : this.streak + 1;
    return this.streak;
  }
}

/** The tracker shared by every sync run of this process (production wiring). */
export const processIncompleteRuns = new IncompleteRunTracker();
