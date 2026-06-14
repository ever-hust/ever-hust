import { prepInterviewTool } from "./prep-interview";

describe("prepInterviewTool guards (no DB / no LLM hit)", () => {
  it("requires auth", async () => {
    const r = await prepInterviewTool.execute!({ jobId: 1 } as never, {} as never);
    expect(r).toEqual({ prepped: false, jobId: 1, error: "Not authenticated." });
  });
  it("requires a model", async () => {
    const r = await prepInterviewTool.execute!(
      { jobId: 1, userId: "u1" } as never,
      {} as never,
    );
    expect(r).toEqual({ prepped: false, jobId: 1, error: "No model available." });
  });
});
