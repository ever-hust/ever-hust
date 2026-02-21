import { getOrchestratorPrompt, getPrompt } from "./prompts";

beforeEach(() => {
  // Ensure Langfuse is not configured (uses fallback)
  delete process.env.LANGFUSE_PUBLIC_KEY;
  delete process.env.LANGFUSE_SECRET_KEY;
});

describe("getOrchestratorPrompt", () => {
  it("should return a fallback prompt when Langfuse is not configured", async () => {
    const result = await getOrchestratorPrompt();

    expect(result.text).toBeDefined();
    expect(typeof result.text).toBe("string");
    expect(result.text.length).toBeGreaterThan(100);
    expect(result.langfusePrompt).toBeUndefined();
  });

  it("should contain key sections in the default prompt", async () => {
    const result = await getOrchestratorPrompt();

    // Check for essential prompt sections
    expect(result.text).toContain("Hust AI");
    expect(result.text).toContain("searchJobs");
    expect(result.text).toContain("Onboarding Flow");
    expect(result.text).toContain("Behavior Guidelines");
    expect(result.text).toContain("Cover Letters");
    expect(result.text).toContain("Job Applications");
    expect(result.text).toContain("Job Alerts");
    expect(result.text).toContain("Interview Prep");
  });

  it("should mention all tools in the default prompt", async () => {
    const result = await getOrchestratorPrompt();

    const tools = [
      "searchJobs",
      "updateFilters",
      "favoriteJob",
      "getJobDetails",
      "getUserProfile",
      "savePreferences",
      "generateCoverLetter",
      "createAlert",
      "applyJob",
      "interviewPrep",
      "submitAnswers",
    ];

    for (const tool of tools) {
      expect(result.text).toContain(tool);
    }
  });
});

describe("getPrompt", () => {
  it("should return fallback when Langfuse is not configured", async () => {
    const fallback = "This is a fallback prompt";
    const result = await getPrompt("test-prompt", fallback);

    expect(result.text).toBe(fallback);
    expect(result.langfusePrompt).toBeUndefined();
  });

  it("should return the exact fallback text", async () => {
    const fallback = "Hello {{name}}, welcome!";
    const result = await getPrompt("greeting", fallback);

    expect(result.text).toBe(fallback);
  });

  it("should handle empty fallback", async () => {
    const result = await getPrompt("empty", "");
    expect(result.text).toBe("");
  });

  it("should handle multiline fallback", async () => {
    const fallback = `Line 1
Line 2
Line 3`;
    const result = await getPrompt("multiline", fallback);
    expect(result.text).toBe(fallback);
    expect(result.text.split("\n")).toHaveLength(3);
  });
});
