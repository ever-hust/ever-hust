import { funnelAnalyticsTool } from "./funnel-analytics";

describe("funnelAnalyticsTool", () => {
  it("returns not-authenticated when userId is missing (no DB hit)", async () => {
    const result = await funnelAnalyticsTool.execute!(
      {} as never,
      {} as never,
    );
    expect(result).toEqual({ error: "Not authenticated.", total: 0 });
  });
});
