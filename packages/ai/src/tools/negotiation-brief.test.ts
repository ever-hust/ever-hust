import { negotiationBriefTool } from "./negotiation-brief";

describe("negotiationBriefTool guards (no DB / no LLM hit)", () => {
  it("requires auth", async () => {
    const r = await negotiationBriefTool.execute!({ jobId: 1 } as never, {} as never);
    expect(r).toEqual({ briefed: false, jobId: 1, error: "Not authenticated." });
  });
  it("requires a model", async () => {
    const r = await negotiationBriefTool.execute!(
      { jobId: 1, userId: "u1" } as never,
      {} as never,
    );
    expect(r).toEqual({ briefed: false, jobId: 1, error: "No model available." });
  });
});
