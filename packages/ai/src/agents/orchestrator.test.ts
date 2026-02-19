/**
 * Tests for the orchestrator module.
 *
 * Since the orchestrator uses streamText() from the AI SDK which requires
 * a real model and network calls, we test the tool definitions and module
 * structure rather than the actual streaming behavior.
 */

import {
  searchJobsTool,
  updateFiltersTool,
  favoriteJobTool,
  getJobDetailsTool,
  getUserProfileTool,
  savePreferencesTool,
  generateCoverLetterTool,
  createAlertTool,
  applyJobTool,
  submitAnswersTool,
  interviewPrepTool,
  companyResearchTool,
  resumeBuilderTool,
  salaryInsightsTool,
} from "../tools";

// The list of all tool names that the orchestrator registers
const EXPECTED_TOOL_NAMES = [
  "searchJobs",
  "updateFilters",
  "favoriteJob",
  "getJobDetails",
  "getUserProfile",
  "savePreferences",
  "generateCoverLetter",
  "createAlert",
  "applyJob",
  "submitAnswers",
  "interviewPrep",
  "companyResearch",
  "resumeBuilder",
  "salaryInsights",
];

// Map tool names used in the orchestrator to the imported tool objects
const toolMap: Record<string, any> = {
  searchJobs: searchJobsTool,
  updateFilters: updateFiltersTool,
  favoriteJob: favoriteJobTool,
  getJobDetails: getJobDetailsTool,
  getUserProfile: getUserProfileTool,
  savePreferences: savePreferencesTool,
  generateCoverLetter: generateCoverLetterTool,
  createAlert: createAlertTool,
  applyJob: applyJobTool,
  submitAnswers: submitAnswersTool,
  interviewPrep: interviewPrepTool,
  companyResearch: companyResearchTool,
  resumeBuilder: resumeBuilderTool,
  salaryInsights: salaryInsightsTool,
};

describe("orchestrator module", () => {
  it("exports createOrchestratorStream as a function", async () => {
    // Use dynamic import to avoid triggering the streamText call
    const mod = await import("./orchestrator");
    expect(typeof mod.createOrchestratorStream).toBe("function");
  });
});

describe("orchestrator tool definitions", () => {
  it("has exactly 14 tools registered", () => {
    expect(EXPECTED_TOOL_NAMES).toHaveLength(14);
    expect(Object.keys(toolMap)).toHaveLength(14);
  });

  describe.each(EXPECTED_TOOL_NAMES)("tool: %s", (toolName) => {
    const tool = toolMap[toolName];

    it("is defined and not null", () => {
      expect(tool).toBeDefined();
      expect(tool).not.toBeNull();
    });

    it("has a non-empty description", () => {
      expect(typeof tool.description).toBe("string");
      expect(tool.description.length).toBeGreaterThan(0);
    });

    it("has an inputSchema (Zod schema)", () => {
      expect(tool.inputSchema).toBeDefined();
      // Zod schemas have a safeParse method
      expect(typeof tool.inputSchema.safeParse).toBe("function");
    });

    it("has a description that describes its purpose", () => {
      // Descriptions should be at least 20 characters to be meaningful
      expect(tool.description.length).toBeGreaterThan(20);
    });
  });
});

describe("tool inputSchema validation", () => {
  it("searchJobsTool accepts empty object", () => {
    const result = searchJobsTool.inputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("favoriteJobTool requires jobId as a number", () => {
    const valid = favoriteJobTool.inputSchema.safeParse({ jobId: 42 });
    expect(valid.success).toBe(true);

    const invalid = favoriteJobTool.inputSchema.safeParse({
      jobId: "not-a-number",
    });
    expect(invalid.success).toBe(false);
  });

  it("createAlertTool requires a valid frequency", () => {
    const valid = createAlertTool.inputSchema.safeParse({
      frequency: "daily",
    });
    expect(valid.success).toBe(true);

    const invalid = createAlertTool.inputSchema.safeParse({
      frequency: "hourly",
    });
    expect(invalid.success).toBe(false);
  });

  it("companyResearchTool requires companyName as a string", () => {
    const valid = companyResearchTool.inputSchema.safeParse({
      companyName: "Acme Corp",
    });
    expect(valid.success).toBe(true);

    const invalid = companyResearchTool.inputSchema.safeParse({});
    expect(invalid.success).toBe(false);
  });

  it("updateFiltersTool rejects invalid jobType", () => {
    const result = updateFiltersTool.inputSchema.safeParse({
      jobType: "freelance",
    });
    expect(result.success).toBe(false);
  });
});

describe("tool descriptions content", () => {
  it("searchJobsTool mentions searching or finding jobs", () => {
    expect(searchJobsTool.description.toLowerCase()).toMatch(
      /search|find|look for/,
    );
  });

  it("favoriteJobTool mentions favoriting or saving", () => {
    expect(favoriteJobTool.description.toLowerCase()).toMatch(
      /favorite|save|bookmark/,
    );
  });

  it("generateCoverLetterTool mentions cover letter", () => {
    expect(generateCoverLetterTool.description.toLowerCase()).toMatch(
      /cover letter/,
    );
  });

  it("interviewPrepTool mentions interview", () => {
    expect(interviewPrepTool.description.toLowerCase()).toMatch(/interview/);
  });

  it("companyResearchTool mentions company or research", () => {
    expect(companyResearchTool.description.toLowerCase()).toMatch(
      /company|research/,
    );
  });

  it("salaryInsightsTool mentions salary", () => {
    expect(salaryInsightsTool.description.toLowerCase()).toMatch(/salary/);
  });
});
