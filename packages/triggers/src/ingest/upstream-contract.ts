/**
 * What this process has seen of the Ever Jobs contract (spec 01a D18).
 *
 * A server that predates contract v1 has no list mode and no NDJSON: it strips `siteCategories`,
 * runs the whole catalogue, holds the whole result in memory and only then answers one JSON page
 * (sorted by site name). A full sync against it asks every source for `resultsWanted` (1000) jobs
 * and stores 100 of them — no coverage, 12.5× the per-source load. So the sync only runs full mode
 * once a run in this process has seen the server answer in NDJSON, and keeps keyword runs at the
 * old per-source count until then. Every run observes the server for free (the stream's content
 * type), so the 15-minute keyword runs keep this current.
 */

export type UpstreamContract = "unknown" | "v1" | "legacy";

export class UpstreamContractTracker {
  private state: UpstreamContract = "unknown";
  private observedAt: number | null = null;

  constructor(private readonly now: () => number = Date.now) {}

  /** The latest observation ("unknown" until a stream was opened in this process). */
  get current(): UpstreamContract {
    return this.state;
  }

  get lastObservedAt(): number | null {
    return this.observedAt;
  }

  /** Record what an opened upstream stream was: `legacy` = a plain JSON answer. */
  observe(legacy: boolean): void {
    this.state = legacy ? "legacy" : "v1";
    this.observedAt = this.now();
  }
}

/** The tracker shared by every sync run of this process (production wiring). */
export const processUpstreamContract = new UpstreamContractTracker();
