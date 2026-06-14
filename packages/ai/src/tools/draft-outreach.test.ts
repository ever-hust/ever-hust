import { draftOutreachTool } from "./draft-outreach";

describe("draftOutreachTool guards (no DB / no LLM hit)", () => {
  it("requires auth", async () => {
    const r = await draftOutreachTool.execute!(
      { jobId: 1, contactType: "recruiter" } as never,
      {} as never,
    );
    expect(r).toEqual({ drafted: false, jobId: 1, error: "Not authenticated." });
  });
  it("requires a model", async () => {
    const r = await draftOutreachTool.execute!(
      { jobId: 1, contactType: "recruiter", userId: "u1" } as never,
      {} as never,
    );
    expect(r).toEqual({ drafted: false, jobId: 1, error: "No model available." });
  });
});
