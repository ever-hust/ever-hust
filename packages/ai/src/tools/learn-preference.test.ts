import { learnPreferenceTool } from "./learn-preference";

describe("learnPreferenceTool guards (no DB hit)", () => {
  it("requires auth", async () => {
    const r = await learnPreferenceTool.execute!(
      { adjustments: { comp: 25 } } as never,
      {} as never,
    );
    expect(r).toEqual({ updated: false, error: "Not authenticated." });
  });

  it("rejects an adjustment with no known dimensions", async () => {
    const r = await learnPreferenceTool.execute!(
      { adjustments: { not_a_dim: 50 }, userId: "u1" } as never,
      {} as never,
    );
    expect(r).toEqual({
      updated: false,
      error: "No known evaluation dimensions in the adjustment.",
    });
  });
});
