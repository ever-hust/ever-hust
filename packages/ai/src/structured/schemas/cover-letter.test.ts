import {
  coverLetterArtifact,
  coverLetterSummarySchema,
  COVER_LETTER_SCHEMA_VERSION,
} from "./cover-letter";

function valid() {
  return {
    jobId: 5,
    tone: "professional" as const,
    greeting: "Dear Hiring Team,",
    body: "I led payments services at Acme...",
    closing: "Sincerely, Jordan",
    highlightedSkills: ["Go", "Payments"],
    grounded: true,
    flaggedClaims: [],
  };
}

describe("coverLetterArtifact", () => {
  it("validates a well-formed summary", () => {
    expect(coverLetterSummarySchema.safeParse(valid()).success).toBe(true);
  });
  it("rejects an unknown tone", () => {
    expect(coverLetterSummarySchema.safeParse({ ...valid(), tone: "snarky" }).success).toBe(false);
  });
  it("builds a versioned artifact", () => {
    const a = coverLetterArtifact.build(valid());
    expect(a.kind).toBe("cover_letter");
    expect(a.schemaVersion).toBe(COVER_LETTER_SCHEMA_VERSION);
  });
});
