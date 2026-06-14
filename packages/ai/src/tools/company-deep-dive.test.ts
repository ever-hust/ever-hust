import { companyDeepDiveTool } from "./company-deep-dive";

describe("companyDeepDiveTool guards (no DB / no LLM hit)", () => {
  it("requires auth", async () => {
    const r = await companyDeepDiveTool.execute!({ jobId: 1 } as never, {} as never);
    expect(r).toEqual({ researched: false, jobId: 1, error: "Not authenticated." });
  });
  it("requires a model", async () => {
    const r = await companyDeepDiveTool.execute!(
      { jobId: 1, userId: "u1" } as never,
      {} as never,
    );
    expect(r).toEqual({ researched: false, jobId: 1, error: "No model available." });
  });
});
