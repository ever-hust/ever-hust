import {
  negotiationArtifact,
  negotiationSummarySchema,
  NEGOTIATION_SCHEMA_VERSION,
} from "./negotiation";

function valid() {
  return {
    jobId: 7,
    summary: "Offer stage for a senior backend role; you have room to counter.",
    targetRange: {
      low: 150000,
      high: 175000,
      basis: "Anchored to the posting range and your stated target.",
    },
    leveragePoints: [
      "Led payments services at Acme",
      "Deep Go and distributed-systems experience",
      "Competing interest in the market",
    ],
    scripts: [
      { scenario: "counter" as const, script: "Thank you for the offer. Based on the role's scope..." },
      {
        scenario: "non_comp_ask" as const,
        script: "If base is fixed, could we revisit the signing bonus or start date?",
      },
    ],
    pitfalls: ["Don't accept on the spot", "Avoid naming a number first without basis"],
    grounded: true,
    flaggedClaims: [],
  };
}

describe("negotiationArtifact", () => {
  it("validates a well-formed summary", () => {
    expect(negotiationSummarySchema.safeParse(valid()).success).toBe(true);
  });
  it("rejects too few leverage points", () => {
    expect(
      negotiationSummarySchema.safeParse({ ...valid(), leveragePoints: ["only one"] }).success,
    ).toBe(false);
  });
  it("rejects an unknown script scenario", () => {
    expect(
      negotiationSummarySchema.safeParse({
        ...valid(),
        scripts: [{ scenario: "ultimatum", script: "or else" }],
      }).success,
    ).toBe(false);
  });
  it("builds a versioned artifact", () => {
    const a = negotiationArtifact.build(valid());
    expect(a.kind).toBe("negotiation");
    expect(a.schemaVersion).toBe(NEGOTIATION_SCHEMA_VERSION);
  });
});
