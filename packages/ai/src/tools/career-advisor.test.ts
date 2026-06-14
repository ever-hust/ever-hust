import { careerAdvisorTool } from "./career-advisor";

describe("careerAdvisorTool guards (no DB / no LLM hit)", () => {
  it("requires auth", async () => {
    const r = await careerAdvisorTool.execute!({} as never, {} as never);
    expect(r).toEqual({ advised: false, error: "Not authenticated." });
  });
  it("requires a model", async () => {
    const r = await careerAdvisorTool.execute!(
      { userId: "u1" } as never,
      {} as never,
    );
    expect(r).toEqual({ advised: false, error: "No model available." });
  });
});
