import {
  companyResearchArtifact,
  companyResearchSummarySchema,
  COMPANY_RESEARCH_SCHEMA_VERSION,
} from "./company-research";

function valid() {
  return {
    jobId: 5,
    companyName: "Ever Co.",
    industry: "Software",
    size: "201-500",
    openRolesInCorpus: 7,
    overview: "Ever Co. builds an open business-automation platform...",
    smartQuestions: ["How is the team structured?"],
    greenFlags: ["Actively hiring across departments"],
    thingsToVerify: ["Funding stage and runway"],
    grounded: true,
    flaggedClaims: [],
  };
}

describe("companyResearchArtifact", () => {
  it("validates a well-formed summary", () => {
    expect(companyResearchSummarySchema.safeParse(valid()).success).toBe(true);
  });
  it("rejects a negative open-roles count", () => {
    expect(
      companyResearchSummarySchema.safeParse({ ...valid(), openRolesInCorpus: -1 }).success,
    ).toBe(false);
  });
  it("builds a versioned artifact", () => {
    const a = companyResearchArtifact.build(valid());
    expect(a.kind).toBe("company_research");
    expect(a.schemaVersion).toBe(COMPANY_RESEARCH_SCHEMA_VERSION);
  });
});
