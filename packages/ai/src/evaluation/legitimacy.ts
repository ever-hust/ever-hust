/**
 * Posting-legitimacy assessment for the evaluation engine's Block G (spec #7).
 *
 * Orthogonal to the fit score (spec #3) — a posting can be a great fit AND look like a ghost
 * job; this is never folded into fit. An explicit corpus signal from the Ever Jobs API (the
 * `jobs.legitimacy` column, produced by ever-jobs Spec 740) wins; otherwise we derive a
 * conservative heuristic from the fields we have. INVARIANT: this only informs the user — an
 * "uncertain" posting is flagged, never auto-hidden or auto-rejected.
 *
 * Pure + deterministic. Mirrors the Hust-side card heuristic (apps/web/lib/legitimacy.ts) so the
 * evaluation drawer and the job card agree, but lives in the AI layer so tools can call it
 * without reaching across into the web app.
 */
export type PostingLegitimacyLevel = "verified" | "likely" | "uncertain";

export interface PostingLegitimacy {
  level: PostingLegitimacyLevel;
  reasons: string[];
}

export function assessPostingLegitimacy(input: {
  hasSalary?: boolean;
  descriptionLength?: number;
  /** Explicit corpus signal (`jobs.legitimacy`), if present — overrides the heuristic. */
  corpusSignal?: PostingLegitimacyLevel | null;
  /** Reasons reported alongside the corpus signal, surfaced verbatim when present. */
  corpusReasons?: string[] | null;
}): PostingLegitimacy {
  if (input.corpusSignal) {
    const reasons =
      input.corpusReasons && input.corpusReasons.length > 0
        ? input.corpusReasons
        : ["Source-corpus legitimacy signal."];
    return { level: input.corpusSignal, reasons };
  }

  const reasons: string[] = [];
  let concerns = 0;
  if (input.hasSalary === false) {
    reasons.push("No salary disclosed.");
    concerns += 1;
  }
  if ((input.descriptionLength ?? 0) < 300) {
    reasons.push("Very short / thin job description.");
    concerns += 1;
  }

  if (concerns >= 2) return { level: "uncertain", reasons };
  if (concerns === 1) return { level: "likely", reasons };
  return { level: "likely", reasons: ["Has salary and a substantive description."] };
}

/** Fixed advisory note attached to Block G — reminds the reader it is orthogonal to fit. */
export const LEGITIMACY_NOTE =
  "Posting legitimacy is orthogonal to fit — informational only, never folded into the score.";
