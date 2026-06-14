import {
  resumeArtifact,
  resumeSummarySchema,
  RESUME_SCHEMA_VERSION,
} from "./resume";

function valid() {
  return {
    jobId: 5,
    professionalSummary: "Senior engineer who led payments services at Acme...",
    bulletSuggestions: [
      "Shipped a payments service handling high transaction volume.",
      "Mentored engineers across two teams.",
      "Reduced checkout latency through caching.",
    ],
    keywordsToAlign: ["Go", "Payments", "Distributed Systems"],
    atsTips: ["Use a single-column layout.", "Avoid tables and text boxes."],
    grounded: true,
    flaggedClaims: [],
  };
}

describe("resumeArtifact", () => {
  it("validates a well-formed summary", () => {
    expect(resumeSummarySchema.safeParse(valid()).success).toBe(true);
  });
  it("rejects fewer than 3 bullet suggestions", () => {
    expect(
      resumeSummarySchema.safeParse({ ...valid(), bulletSuggestions: ["only one"] }).success,
    ).toBe(false);
  });
  it("builds a versioned artifact", () => {
    const a = resumeArtifact.build(valid());
    expect(a.kind).toBe("resume");
    expect(a.schemaVersion).toBe(RESUME_SCHEMA_VERSION);
  });
});
