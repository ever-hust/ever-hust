import type {
  EvaluationSummary,
  EvaluationLlmPart,
} from "../structured/schemas/evaluation";
import { DEFAULT_DIMENSIONS, computeScore } from "./scoring";
import { LEGITIMACY_NOTE, type PostingLegitimacy } from "./legitimacy";

function clamp5(x: number): number {
  if (!Number.isFinite(x)) return 3;
  return Math.max(1, Math.min(5, x));
}

export interface DeterministicDimResult {
  score5: number;
  rationale: string;
}

export interface DeterministicInputs {
  comp: DeterministicDimResult;
  remote: DeterministicDimResult;
  level: DeterministicDimResult;
}

/**
 * Pure assembly of the final {@link EvaluationSummary} (spec #3): merge the server-computed
 * deterministic dimensions with the LLM-reasoned ones, apply the resolved weights, compute
 * the aggregate score + band, and attach the A–F blocks. Missing LLM dimensions degrade to a
 * neutral 3 ("not assessed") rather than failing. No I/O — fully unit-testable.
 */
export function assembleEvaluation(input: {
  jobId: number;
  jobFamily: string;
  archetype: string;
  weights: Record<string, number>;
  deterministic: DeterministicInputs;
  llmPart: EvaluationLlmPart;
  includeInterviewPlan: boolean;
  /** Block G — posting legitimacy (spec #7), attached deterministically; orthogonal to fit. */
  legitimacy?: PostingLegitimacy;
}): EvaluationSummary {
  const {
    jobId,
    jobFamily,
    archetype,
    weights,
    deterministic,
    llmPart,
    includeInterviewPlan,
    legitimacy,
  } = input;

  const llmByKey = new Map(llmPart.dimensions.map((d) => [d.key, d]));
  const detByKey: Record<string, DeterministicDimResult> = {
    comp: deterministic.comp,
    remote: deterministic.remote,
    level: deterministic.level,
  };

  const dimensions = DEFAULT_DIMENSIONS.map((def) => {
    const weight = weights[def.key] ?? def.weight;
    if (def.source === "deterministic") {
      const d = detByKey[def.key] ?? { score5: 3, rationale: "Not assessed." };
      return {
        key: def.key,
        weight,
        score5: clamp5(d.score5),
        rationale: d.rationale,
        source: "deterministic" as const,
      };
    }
    const l = llmByKey.get(def.key);
    return {
      key: def.key,
      weight,
      score5: l ? clamp5(l.score5) : 3,
      rationale: l?.rationale ?? "Not assessed.",
      source: "llm" as const,
    };
  });

  const { score5, score100, band } = computeScore(dimensions);

  const blocks: EvaluationSummary["blocks"] = {
    roleSummary: llmPart.blocks.roleSummary,
    cvMatch: llmPart.blocks.cvMatch,
    levelStrategy: llmPart.blocks.levelStrategy,
    compDemand: llmPart.blocks.compDemand,
    customization: llmPart.blocks.customization,
  };
  if (includeInterviewPlan && llmPart.blocks.interviewPlan) {
    blocks.interviewPlan = llmPart.blocks.interviewPlan;
  }
  // Block G — posting legitimacy is attached server-side and stays orthogonal to the fit score.
  if (legitimacy) {
    blocks.legitimacy = {
      level: legitimacy.level,
      reasons: legitimacy.reasons,
      note: LEGITIMACY_NOTE,
    };
  }

  return {
    jobId,
    score: score100,
    score5,
    band,
    jobFamily,
    archetype,
    dimensions,
    blocks,
    recommendation: llmPart.recommendation,
  };
}
