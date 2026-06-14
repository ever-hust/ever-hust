/**
 * Posting-legitimacy / ghost-job radar (spec #7).
 *
 * Orthogonal to the fit score (spec #3) — a posting can be a great fit AND look like a ghost job;
 * we never fold this into fit. Hust derives a Hust-side heuristic from the fields it has, and is
 * forward-compatible with an explicit corpus legitimacy signal from the Ever Jobs API (which wins).
 * INVARIANT: this only informs the user; an "uncertain" posting is flagged, never auto-hidden.
 */
export type LegitimacyLevel = "verified" | "likely" | "uncertain";

export interface LegitimacyAssessment {
  level: LegitimacyLevel;
  reasons: string[];
}

export function assessLegitimacy(job: {
  hasSalary?: boolean;
  descriptionLength?: number;
  /** Explicit signal from the Ever Jobs corpus, if present — overrides the heuristic. */
  corpusSignal?: LegitimacyLevel | null;
}): LegitimacyAssessment {
  if (job.corpusSignal) {
    return { level: job.corpusSignal, reasons: ["Source-corpus legitimacy signal."] };
  }

  const reasons: string[] = [];
  let concerns = 0;
  if (job.hasSalary === false) {
    reasons.push("No salary disclosed.");
    concerns += 1;
  }
  if ((job.descriptionLength ?? 0) < 300) {
    reasons.push("Very short / thin job description.");
    concerns += 1;
  }

  if (concerns >= 2) return { level: "uncertain", reasons };
  if (concerns === 1) return { level: "likely", reasons };
  return { level: "likely", reasons: ["Has salary and a substantive description."] };
}
