/**
 * The full runs in a row that were not complete, as seen by this process (spec 01a D21/D27).
 *
 * Informational only: the summary carries it as `incompleteStreak` and the summary line logs it.
 * It is NOT what escalates a crawl that never completes: the count is per process, so with several
 * web pods each counts only the runs it served (pod A can reach any count while pods B and C
 * completed runs in between), and every restart (every deploy) resets it. The escalation is the
 * durable `staleSources` check instead (spec D27): a source none of whose rows a sync has seen for
 * `STALE_SOURCE_DAYS`, read from the database at the end of each full run. Skipped runs (full mode
 * gated off, D18) change nothing; a complete run resets the count.
 */
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
