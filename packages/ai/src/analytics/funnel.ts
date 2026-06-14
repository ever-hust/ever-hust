import type { PipelineStage } from "../pipeline/stages";

/**
 * Funnel analytics (spec #8). Pure computation over the user's applications (their pipeline
 * stage, spec #2) joined with their evaluations (fit score, spec #3) — so it depends only on
 * data both already produce. No I/O; fully unit-tested. Surfaces conversion rates and the
 * score-vs-outcome signal that the learning loop (#13) and growth advisor (#18) build on.
 */
export interface FunnelRow {
  stage: PipelineStage;
  score: number | null;
}

export interface Funnel {
  total: number;
  byStage: Record<PipelineStage, number>;
  conversions: {
    appliedToScreening: number | null;
    screeningToInterview: number | null;
    interviewToOffer: number | null;
    overallOfferRate: number | null;
  };
  avgScore: number | null;
  avgScoreByOutcome: { offer: number | null; rejected: number | null };
}

// Furthest-reached rank used for conversion math. saved (0) is pre-application and excluded
// from the funnel. rejected/withdrawn imply the user did at least apply (rank 1).
const RANK: Record<PipelineStage, number> = {
  saved: 0,
  applied: 1,
  screening: 2,
  interviewing: 3,
  offer: 4,
  rejected: 1,
  withdrawn: 1,
};

function emptyByStage(): Record<PipelineStage, number> {
  return {
    saved: 0,
    applied: 0,
    screening: 0,
    interviewing: 0,
    offer: 0,
    rejected: 0,
    withdrawn: 0,
  };
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 100) / 100;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

export function computeFunnel(rows: FunnelRow[]): Funnel {
  const byStage = emptyByStage();
  for (const r of rows) byStage[r.stage] += 1;

  // reached(level) = applications whose furthest-reached rank is >= level (among applied+).
  const reached = (level: number) =>
    rows.filter((r) => RANK[r.stage] >= level).length;
  const appliedPlus = reached(1);

  const conversions = {
    appliedToScreening: ratio(reached(2), appliedPlus),
    screeningToInterview: ratio(reached(3), reached(2)),
    interviewToOffer: ratio(reached(4), reached(3)),
    overallOfferRate: ratio(reached(4), appliedPlus),
  };

  const scores = rows
    .map((r) => r.score)
    .filter((s): s is number => typeof s === "number");

  const offerScores = rows
    .filter((r) => r.stage === "offer" && typeof r.score === "number")
    .map((r) => r.score as number);
  const rejectedScores = rows
    .filter((r) => r.stage === "rejected" && typeof r.score === "number")
    .map((r) => r.score as number);

  return {
    total: rows.length,
    byStage,
    conversions,
    avgScore: mean(scores),
    avgScoreByOutcome: {
      offer: mean(offerScores),
      rejected: mean(rejectedScores),
    },
  };
}
