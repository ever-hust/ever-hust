import {
  EVALUATION_SCHEMA_VERSION,
  evaluationArtifact,
  evaluationSummarySchema,
  evaluationLlmPartSchema,
} from "./evaluation";

function validBlocks() {
  return {
    roleSummary: "Backend role building payment services.",
    cvMatch: {
      evidence: [
        { requirement: "5y backend", cvEvidence: "6y at Acme on payments", met: true },
      ],
      gaps: ["No Kubernetes experience stated"],
    },
    levelStrategy: "Position as senior; lead a recent migration.",
    compDemand: { summary: "Within market band for the metro.", budgetFit: "good_fit" as const },
    customization: "Emphasize payments + reliability.",
  };
}

function validSummary() {
  return {
    jobId: 42,
    score: 82,
    score5: 4.6,
    band: "apply_now" as const,
    jobFamily: "Software Eng",
    archetype: "Backend",
    dimensions: [
      {
        key: "north_star",
        weight: 25,
        score5: 5,
        rationale: "Direct match to target backend role.",
        source: "llm" as const,
      },
      {
        key: "comp",
        weight: 10,
        score5: 4,
        rationale: "Top-half of market for the metro.",
        source: "deterministic" as const,
      },
    ],
    blocks: validBlocks(),
    recommendation: "Strong fit — apply.",
  };
}

describe("evaluationSummarySchema", () => {
  it("accepts a well-formed summary", () => {
    expect(evaluationSummarySchema.safeParse(validSummary()).success).toBe(true);
  });

  it("rejects an out-of-range score", () => {
    expect(
      evaluationSummarySchema.safeParse({ ...validSummary(), score: 140 }).success,
    ).toBe(false);
  });

  it("rejects an unknown band", () => {
    expect(
      evaluationSummarySchema.safeParse({ ...validSummary(), band: "maybe" }).success,
    ).toBe(false);
  });

  it("rejects a non-integer jobId", () => {
    expect(
      evaluationSummarySchema.safeParse({ ...validSummary(), jobId: 1.5 }).success,
    ).toBe(false);
  });

  it("rejects a dimension score5 outside 1..5", () => {
    const bad = validSummary();
    bad.dimensions[0]!.score5 = 6;
    expect(evaluationSummarySchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an invalid budgetFit enum", () => {
    const bad = validSummary();
    (bad.blocks.compDemand as { budgetFit: string }).budgetFit = "nope";
    expect(evaluationSummarySchema.safeParse(bad).success).toBe(false);
  });

  it("allows an optional interview plan", () => {
    const withPlan = validSummary();
    (withPlan.blocks as { interviewPlan?: unknown }).interviewPlan = [
      { theme: "System design", starSeed: "Describe the payments migration." },
    ];
    expect(evaluationSummarySchema.safeParse(withPlan).success).toBe(true);
  });
});

describe("evaluationLlmPartSchema", () => {
  it("accepts the LLM-produced subset", () => {
    const part = {
      dimensions: [{ key: "growth", score5: 4, rationale: "Clear path to staff." }],
      blocks: validBlocks(),
      recommendation: "Worth applying.",
    };
    expect(evaluationLlmPartSchema.safeParse(part).success).toBe(true);
  });

  it("rejects an empty dimensions array", () => {
    const part = {
      dimensions: [],
      blocks: validBlocks(),
      recommendation: "x",
    };
    expect(evaluationLlmPartSchema.safeParse(part).success).toBe(false);
  });
});

describe("evaluationArtifact", () => {
  it("is registered as version 1 with kind 'evaluation'", () => {
    expect(evaluationArtifact.kind).toBe("evaluation");
    expect(evaluationArtifact.version).toBe(EVALUATION_SCHEMA_VERSION);
    expect(EVALUATION_SCHEMA_VERSION).toBe(1);
  });

  it("builds a versioned evaluation artifact", () => {
    const artifact = evaluationArtifact.build(validSummary(), "Narration.");
    expect(artifact.kind).toBe("evaluation");
    expect(artifact.schemaVersion).toBe(1);
    expect(artifact.summary.score).toBe(82);
    expect(artifact.prose).toBe("Narration.");
  });
});
