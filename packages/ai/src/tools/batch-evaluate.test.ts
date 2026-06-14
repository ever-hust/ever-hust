import { batchEvaluateTool } from "./batch-evaluate";

describe("batchEvaluateTool guards (no DB / no LLM hit)", () => {
  it("requires auth", async () => {
    const r = await batchEvaluateTool.execute!({ jobIds: [1, 2] } as never, {} as never);
    expect(r).toEqual({ evaluated: false, error: "Not authenticated." });
  });
  it("requires a model", async () => {
    const r = await batchEvaluateTool.execute!(
      { jobIds: [1], userId: "u1" } as never,
      {} as never,
    );
    expect(r).toEqual({ evaluated: false, error: "No model available." });
  });
  it("validates jobIds", () => {
    expect(batchEvaluateTool.inputSchema.safeParse({ jobIds: [] }).success).toBe(false);
    expect(batchEvaluateTool.inputSchema.safeParse({ jobIds: [1, 2, 3] }).success).toBe(true);
  });
});
