import { followUpSuggestionsTool } from "./follow-up-suggestions";
import { recordFollowUpTool } from "./record-follow-up";

describe("follow-up tools guards (no DB hit)", () => {
  it("followUpSuggestions requires auth", async () => {
    const r = await followUpSuggestionsTool.execute!({} as never, {} as never);
    expect(r).toEqual({ error: "Not authenticated.", suggestions: [], count: 0 });
  });

  it("recordFollowUp requires auth", async () => {
    const r = await recordFollowUpTool.execute!(
      { applicationId: 1 } as never,
      {} as never,
    );
    expect(r).toEqual({ recorded: false, applicationId: 1, error: "Not authenticated." });
  });

  it("recordFollowUp validates applicationId", () => {
    expect(recordFollowUpTool.inputSchema.safeParse({ applicationId: 0 }).success).toBe(false);
    expect(recordFollowUpTool.inputSchema.safeParse({ applicationId: 5 }).success).toBe(true);
  });
});
