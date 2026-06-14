import { updateApplicationStageTool } from "./update-application-stage";

describe("updateApplicationStageTool", () => {
  it("accepts a valid stage and rejects an invalid one", () => {
    const schema = updateApplicationStageTool.inputSchema;
    expect(schema.safeParse({ applicationId: 1, stage: "interviewing" }).success).toBe(true);
    expect(schema.safeParse({ applicationId: 1, stage: "ghosted" }).success).toBe(false);
    expect(schema.safeParse({ applicationId: 0, stage: "applied" }).success).toBe(false);
  });

  it("returns not-authenticated when userId is missing (no DB hit)", async () => {
    const result = await updateApplicationStageTool.execute!(
      { applicationId: 1, stage: "applied" } as never,
      {} as never,
    );
    expect(result).toEqual({
      updated: false,
      applicationId: 1,
      error: "Not authenticated.",
    });
  });
});
