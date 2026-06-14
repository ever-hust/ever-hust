import { assembleEvaluation, type DeterministicInputs } from "./assemble";
import { resolveWeights } from "./scoring";
import { evaluationSummarySchema } from "../structured/schemas/evaluation";
import type { EvaluationLlmPart } from "../structured/schemas/evaluation";

const deterministic: DeterministicInputs = {
  comp: { score5: 4, rationale: "Pays at market." },
  remote: { score5: 5, rationale: "Remote matches preference." },
  level: { score5: 5, rationale: "Role is at your level." },
};

function llmPart(overrides: Partial<EvaluationLlmPart> = {}): EvaluationLlmPart {
  return {
    dimensions: [
      { key: "north_star", score5: 5, rationale: "Bullseye for target role." },
      { key: "cv_match", score5: 4, rationale: "Strong overlap." },
      { key: "growth", score5: 4, rationale: "Clear path." },
      { key: "reputation", score5: 4, rationale: "Solid employer." },
      { key: "tech", score5: 4, rationale: "Modern stack." },
      { key: "speed", score5: 3, rationale: "Average process." },
      { key: "culture", score5: 4, rationale: "Builder culture." },
    ],
    blocks: {
      roleSummary: "Backend role on payments.",
      cvMatch: { evidence: [{ requirement: "Go", cvEvidence: "3y Go at Acme", met: true }], gaps: [] },
      levelStrategy: "Position as senior.",
      compDemand: { summary: "Within band.", budgetFit: "good_fit" },
      customization: "Emphasize payments reliability.",
      interviewPlan: [{ theme: "System design", starSeed: "Payments migration." }],
    },
    recommendation: "Strong fit — apply.",
    ...overrides,
  };
}

describe("assembleEvaluation", () => {
  it("produces a schema-valid summary", () => {
    const { weights } = resolveWeights({});
    const summary = assembleEvaluation({
      jobId: 7,
      jobFamily: "Software Eng",
      archetype: "Backend",
      weights,
      deterministic,
      llmPart: llmPart(),
      includeInterviewPlan: false,
    });
    expect(evaluationSummarySchema.safeParse(summary).success).toBe(true);
  });

  it("merges 3 deterministic + 7 llm dimensions (10 total)", () => {
    const { weights } = resolveWeights({});
    const summary = assembleEvaluation({
      jobId: 7,
      jobFamily: "Software Eng",
      archetype: "Backend",
      weights,
      deterministic,
      llmPart: llmPart(),
      includeInterviewPlan: false,
    });
    expect(summary.dimensions).toHaveLength(10);
    expect(summary.dimensions.filter((d) => d.source === "deterministic")).toHaveLength(3);
    expect(summary.dimensions.filter((d) => d.source === "llm")).toHaveLength(7);
  });

  it("computes a high score + apply_now band for a strong fit", () => {
    const { weights } = resolveWeights({});
    const summary = assembleEvaluation({
      jobId: 7,
      jobFamily: "Software Eng",
      archetype: "Backend",
      weights,
      deterministic,
      llmPart: llmPart(),
      includeInterviewPlan: false,
    });
    expect(summary.score).toBeGreaterThanOrEqual(80);
    expect(["apply_now", "worth_it"]).toContain(summary.band);
  });

  it("drops the interview plan unless opted in", () => {
    const { weights } = resolveWeights({});
    const withoutPlan = assembleEvaluation({
      jobId: 7, jobFamily: "X", archetype: "Y", weights, deterministic,
      llmPart: llmPart(), includeInterviewPlan: false,
    });
    expect(withoutPlan.blocks.interviewPlan).toBeUndefined();

    const withPlan = assembleEvaluation({
      jobId: 7, jobFamily: "X", archetype: "Y", weights, deterministic,
      llmPart: llmPart(), includeInterviewPlan: true,
    });
    expect(withPlan.blocks.interviewPlan).toHaveLength(1);
  });

  it("defaults a missing LLM dimension to a neutral 3", () => {
    const { weights } = resolveWeights({});
    const sparse = llmPart({
      dimensions: [{ key: "north_star", score5: 5, rationale: "Great." }],
    });
    const summary = assembleEvaluation({
      jobId: 7, jobFamily: "X", archetype: "Y", weights, deterministic,
      llmPart: sparse, includeInterviewPlan: false,
    });
    const culture = summary.dimensions.find((d) => d.key === "culture");
    expect(culture?.score5).toBe(3);
    expect(culture?.rationale).toBe("Not assessed.");
  });

  it("yields not_recommended for a poor fit", () => {
    const { weights } = resolveWeights({});
    const poorDet: DeterministicInputs = {
      comp: { score5: 1, rationale: "Underpays." },
      remote: { score5: 2, rationale: "On-site, you want remote." },
      level: { score5: 2, rationale: "Two levels off." },
    };
    const poorLlm = llmPart({
      dimensions: [
        { key: "north_star", score5: 2, rationale: "Off-target." },
        { key: "cv_match", score5: 2, rationale: "Weak overlap." },
        { key: "growth", score5: 2, rationale: "Limited." },
        { key: "reputation", score5: 3, rationale: "Unknown." },
        { key: "tech", score5: 2, rationale: "Legacy stack." },
        { key: "speed", score5: 3, rationale: "Average." },
        { key: "culture", score5: 2, rationale: "Bureaucratic." },
      ],
      recommendation: "Skip — off-target and underpaid.",
    });
    const summary = assembleEvaluation({
      jobId: 7, jobFamily: "X", archetype: "Y", weights, deterministic: poorDet,
      llmPart: poorLlm, includeInterviewPlan: false,
    });
    expect(summary.band).toBe("not_recommended");
  });
});
