import { captureWritingStyleTool } from "./capture-writing-style";

describe("captureWritingStyleTool guards (no DB hit)", () => {
  it("requires auth", async () => {
    const r = await captureWritingStyleTool.execute!(
      { samples: ["hello world"] } as never,
      {} as never,
    );
    expect(r).toEqual({ captured: false, error: "Not authenticated." });
  });

  it("requires at least one sample", () => {
    expect(captureWritingStyleTool.inputSchema.safeParse({ samples: [] }).success).toBe(false);
    expect(
      captureWritingStyleTool.inputSchema.safeParse({ samples: ["a"] }).success,
    ).toBe(true);
  });
});
