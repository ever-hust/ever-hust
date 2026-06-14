import {
  careerGrowthArtifact,
  careerGrowthSummarySchema,
  CAREER_GROWTH_SCHEMA_VERSION,
} from "./career-growth";

function valid() {
  return {
    recurringGaps: [{ skill: "Kubernetes", frequency: 3 }],
    recommendations: [
      {
        action: "Ship a small k8s side project",
        type: "project" as const,
        rationale: "Closes the most frequent gap with demonstrable evidence.",
        priority: "high" as const,
      },
    ],
    summary: "Focus on infra depth.",
  };
}

describe("careerGrowthArtifact", () => {
  it("validates a well-formed summary", () => {
    expect(careerGrowthSummarySchema.safeParse(valid()).success).toBe(true);
  });
  it("rejects an invalid recommendation type", () => {
    const bad = valid();
    (bad.recommendations[0] as { type: string }).type = "vibes";
    expect(careerGrowthSummarySchema.safeParse(bad).success).toBe(false);
  });
  it("builds a versioned artifact", () => {
    const a = careerGrowthArtifact.build(valid());
    expect(a.kind).toBe("career_growth");
    expect(a.schemaVersion).toBe(CAREER_GROWTH_SCHEMA_VERSION);
  });
});
