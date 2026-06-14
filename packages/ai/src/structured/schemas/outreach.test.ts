import {
  outreachArtifact,
  outreachSummarySchema,
  OUTREACH_SCHEMA_VERSION,
} from "./outreach";

function valid() {
  return {
    jobId: 5,
    contactType: "recruiter" as const,
    hook: "I saw you're hiring for the Payments Engineer role at Acme.",
    credibility: "I led payments services at a prior company and shipped Go at scale.",
    ask: "Would you be open to a quick chat about the team?",
    message:
      "I saw you're hiring for the Payments Engineer role at Acme. I led payments services at a " +
      "prior company and shipped Go at scale. Would you be open to a quick chat about the team?",
    highlightedBackground: ["Go", "Payments"],
    grounded: true,
    flaggedClaims: [],
  };
}

describe("outreachArtifact", () => {
  it("validates a well-formed summary", () => {
    expect(outreachSummarySchema.safeParse(valid()).success).toBe(true);
  });
  it("rejects an unknown contactType", () => {
    expect(
      outreachSummarySchema.safeParse({ ...valid(), contactType: "cold_email" }).success,
    ).toBe(false);
  });
  it("builds a versioned artifact", () => {
    const a = outreachArtifact.build(valid());
    expect(a.kind).toBe("outreach");
    expect(a.schemaVersion).toBe(OUTREACH_SCHEMA_VERSION);
  });
});
