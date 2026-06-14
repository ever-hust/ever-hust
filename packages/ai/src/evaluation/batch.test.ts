import { planBatchEvaluation } from "./batch";

describe("planBatchEvaluation", () => {
  it("evaluates candidates up to the cap and marks the rest over_quota", () => {
    const candidates = Array.from({ length: 8 }, (_, i) => ({ jobId: i + 1 }));
    const plan = planBatchEvaluation(candidates, { max: 3 });
    expect(plan.toEvaluate).toEqual([1, 2, 3]);
    expect(plan.skipped).toHaveLength(5);
    expect(plan.skipped.every((s) => s.reason === "over_quota")).toBe(true);
  });

  it("skips candidates below the score floor", () => {
    const plan = planBatchEvaluation(
      [
        { jobId: 1, score: 90 },
        { jobId: 2, score: 40 },
        { jobId: 3, score: 70 },
      ],
      { scoreFloor: 60, max: 10 },
    );
    expect(plan.toEvaluate).toEqual([1, 3]);
    expect(plan.skipped).toEqual([{ jobId: 2, reason: "below_score_floor" }]);
  });

  it("with no constraints evaluates everything up to the default cap", () => {
    const plan = planBatchEvaluation([{ jobId: 1 }, { jobId: 2 }]);
    expect(plan.toEvaluate).toEqual([1, 2]);
    expect(plan.skipped).toEqual([]);
  });
});
