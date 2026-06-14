/**
 * Cost / score-floor gating policy (spec #6 §3). Pure decision core so expensive generation
 * (PDF render, batch evaluation) only runs when a job's fit score clears a floor and/or the
 * user is under quota. Consumed by #19 (batch) and the document epics; built score-agnostic
 * (the score is passed in) so it stays decoupled from epic #3.
 */
export type CostGateReason = "ok" | "below_score_floor" | "over_quota";

export interface CostGateInput {
  /** Fit score (0–100) for the target job, if known. */
  score?: number | null;
  /** Minimum score required to run the expensive work. */
  scoreFloor?: number;
  /** Whether the user is within their per-tier quota (null/undefined = not checked). */
  underQuota?: boolean | null;
}

export interface CostGateDecision {
  allowed: boolean;
  reason: CostGateReason;
}

export function evaluateCostGate(input: CostGateInput): CostGateDecision {
  if (
    input.scoreFloor != null &&
    (input.score == null || input.score < input.scoreFloor)
  ) {
    return { allowed: false, reason: "below_score_floor" };
  }
  if (input.underQuota === false) {
    return { allowed: false, reason: "over_quota" };
  }
  return { allowed: true, reason: "ok" };
}

/**
 * Wrap an expensive operation behind a cost gate. `resolveInput` supplies the score/quota at
 * call time; if the gate blocks, `onBlocked` produces the skip result instead of running `run`.
 */
export function withCostGate<TArgs extends unknown[], TResult>(opts: {
  resolveInput: (...args: TArgs) => Promise<CostGateInput> | CostGateInput;
  run: (...args: TArgs) => Promise<TResult>;
  onBlocked: (decision: CostGateDecision, ...args: TArgs) => TResult;
}): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    const decision = evaluateCostGate(await opts.resolveInput(...args));
    if (!decision.allowed) return opts.onBlocked(decision, ...args);
    return opts.run(...args);
  };
}
