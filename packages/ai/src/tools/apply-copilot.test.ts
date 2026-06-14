import { applyCopilotTool } from "./apply-copilot";

describe("applyCopilotTool guards (no DB / no LLM hit)", () => {
  it("requires auth", async () => {
    const r = await applyCopilotTool.execute!({ jobId: 1 } as never, {} as never);
    expect(r).toEqual({ drafted: false, jobId: 1, error: "Not authenticated." });
  });
  it("requires a model", async () => {
    const r = await applyCopilotTool.execute!(
      { jobId: 1, userId: "u1" } as never,
      {} as never,
    );
    expect(r).toEqual({ drafted: false, jobId: 1, error: "No model available." });
  });
});
