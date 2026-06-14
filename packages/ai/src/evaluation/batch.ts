import { evaluateCostGate } from "../policy/cost-gate";
import type { CostGateReason } from "../policy/cost-gate";
import { BATCH_EVAL_MAX_CONCURRENCY } from "../policy/limits";

/**
 * Batch-evaluation planner (spec #19). Pure: decide which candidates to fully evaluate, applying
 * the cost gate (spec #6) — a score floor (cheap pre-filter on any known score) and a hard cap so
 * expensive LLM evaluation only runs where it's worth it. No I/O; unit-tested.
 */
export interface BatchCandidate {
  jobId: number;
  score?: number | null;
}

export interface BatchPlan {
  toEvaluate: number[];
  skipped: { jobId: number; reason: CostGateReason }[];
}

export function planBatchEvaluation(
  candidates: BatchCandidate[],
  opts: { scoreFloor?: number; max?: number } = {},
): BatchPlan {
  const max = opts.max ?? BATCH_EVAL_MAX_CONCURRENCY;
  const toEvaluate: number[] = [];
  const skipped: { jobId: number; reason: CostGateReason }[] = [];

  for (const candidate of candidates) {
    if (toEvaluate.length >= max) {
      skipped.push({ jobId: candidate.jobId, reason: "over_quota" });
      continue;
    }
    const decision = evaluateCostGate({
      score: candidate.score ?? null,
      scoreFloor: opts.scoreFloor,
    });
    if (!decision.allowed) {
      skipped.push({ jobId: candidate.jobId, reason: decision.reason });
      continue;
    }
    toEvaluate.push(candidate.jobId);
  }

  return { toEvaluate, skipped };
}
