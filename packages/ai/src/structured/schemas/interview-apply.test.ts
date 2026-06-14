import {
  interviewPrepArtifact,
  interviewPrepSummarySchema,
} from "./interview-prep";
import { applyDraftArtifact, applyDraftSummarySchema } from "./apply-draft";

describe("interviewPrepArtifact", () => {
  const valid = {
    jobId: 3,
    themes: [{ theme: "System design", why: "Core to the role." }],
    starStories: [
      {
        theme: "Scaling",
        situation: "Payments latency spiked.",
        task: "Cut p99.",
        action: "Reworked the hot path.",
        result: "p99 down 60%.",
      },
    ],
    questionsToAsk: ["What does success look like in 90 days?"],
    grounded: true,
    flaggedClaims: [],
  };
  it("validates and builds", () => {
    expect(interviewPrepSummarySchema.safeParse(valid).success).toBe(true);
    expect(interviewPrepArtifact.build(valid).kind).toBe("interview_prep");
  });
  it("rejects empty star stories", () => {
    expect(
      interviewPrepSummarySchema.safeParse({ ...valid, starStories: [] }).success,
    ).toBe(false);
  });
});

describe("applyDraftArtifact", () => {
  const valid = {
    jobId: 3,
    proposal: "I'd bring payments reliability experience...",
    screeningQA: [{ question: "Years of Go?", answer: "3 years at Acme." }],
    grounded: true,
    flaggedClaims: [],
  };
  it("validates and builds (suggestedTerms optional)", () => {
    expect(applyDraftSummarySchema.safeParse(valid).success).toBe(true);
    expect(applyDraftArtifact.build(valid).kind).toBe("apply_draft");
  });
});
