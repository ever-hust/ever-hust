import { evaluateJobTool, evaluateJobInput } from "./evaluate-job";

describe("evaluateJobInput", () => {
  it("accepts a positive integer jobId and defaults includeInterviewPlan to false", () => {
    const parsed = evaluateJobInput.parse({ jobId: 12 });
    expect(parsed.jobId).toBe(12);
    expect(parsed.includeInterviewPlan).toBe(false);
  });

  it("rejects a non-integer / non-positive jobId", () => {
    expect(evaluateJobInput.safeParse({ jobId: 0 }).success).toBe(false);
    expect(evaluateJobInput.safeParse({ jobId: 1.5 }).success).toBe(false);
    expect(evaluateJobInput.safeParse({ jobId: "x" }).success).toBe(false);
  });
});

describe("evaluateJobTool guards (no DB / no LLM hit)", () => {
  it("returns not-authenticated when userId is missing", async () => {
    const result = await evaluateJobTool.execute!(
      { jobId: 1 } as never,
      {} as never,
    );
    expect(result).toEqual({
      evaluated: false,
      jobId: 1,
      error: "Not authenticated.",
    });
  });

  it("returns no-model when the model was not injected", async () => {
    const result = await evaluateJobTool.execute!(
      { jobId: 1, userId: "user_1" } as never,
      {} as never,
    );
    expect(result).toEqual({
      evaluated: false,
      jobId: 1,
      error: "No model available for evaluation.",
    });
  });
});
