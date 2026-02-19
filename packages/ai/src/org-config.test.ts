import { mergeOrgConfig, type OrgAiConfigRow, type MergedAiConfig } from "./org-config";

/**
 * Helper to build a minimal OrgAiConfigRow with sensible defaults.
 * Override any field by passing a partial.
 */
function makeOrgConfig(overrides: Partial<OrgAiConfigRow> = {}): OrgAiConfigRow {
  return {
    id: 1,
    organizationId: 100,
    preferredModel: null,
    customSystemPrompt: null,
    maxTokens: null,
    temperature: null,
    apiKeys: null,
    enabledTools: null,
    isActive: true,
    ...overrides,
  };
}

describe("mergeOrgConfig", () => {
  // ── Null / undefined inputs ──────────────────────────────────────────────

  it("returns empty object when both inputs are null", () => {
    expect(mergeOrgConfig(null, null)).toEqual({});
  });

  it("returns empty object when both inputs are undefined", () => {
    expect(mergeOrgConfig(undefined, undefined)).toEqual({});
  });

  it("returns empty object when user is null and org is undefined", () => {
    expect(mergeOrgConfig(null, undefined)).toEqual({});
  });

  // ── User config only ────────────────────────────────────────────────────

  it("uses user aiModel when only user config is provided", () => {
    const result = mergeOrgConfig(
      { aiModel: "claude-sonnet-4-20250514" },
      null,
    );
    expect(result.preferredModel).toBe("claude-sonnet-4-20250514");
  });

  it("uses user apiKeys when only user config is provided", () => {
    const result = mergeOrgConfig(
      { apiKeys: { anthropic: "sk-ant-user" } },
      null,
    );
    expect(result.apiKeys).toEqual({ anthropic: "sk-ant-user" });
  });

  it("uses both user aiModel and apiKeys when only user config is provided", () => {
    const result = mergeOrgConfig(
      {
        aiModel: "claude-haiku-4-5-20251001",
        apiKeys: { anthropic: "sk-ant-user", openai: "sk-openai-user" },
      },
      null,
    );
    expect(result.preferredModel).toBe("claude-haiku-4-5-20251001");
    expect(result.apiKeys).toEqual({
      anthropic: "sk-ant-user",
      openai: "sk-openai-user",
    });
  });

  // ── Org config only ─────────────────────────────────────────────────────

  it("uses org preferredModel when only org config is provided", () => {
    const result = mergeOrgConfig(
      null,
      makeOrgConfig({ preferredModel: "claude-opus-4-6" }),
    );
    expect(result.preferredModel).toBe("claude-opus-4-6");
  });

  it("applies org customSystemPrompt, maxTokens, and temperature", () => {
    const result = mergeOrgConfig(
      null,
      makeOrgConfig({
        customSystemPrompt: "You are a helpful recruiter.",
        maxTokens: 2048,
        temperature: 0.7,
      }),
    );
    expect(result.customSystemPrompt).toBe("You are a helpful recruiter.");
    expect(result.maxTokens).toBe(2048);
    expect(result.temperature).toBe(0.7);
  });

  it("applies org enabledTools", () => {
    const tools = ["searchJobs", "favoriteJob", "generateCoverLetter"];
    const result = mergeOrgConfig(
      null,
      makeOrgConfig({ enabledTools: tools }),
    );
    expect(result.enabledTools).toEqual(tools);
  });

  it("applies org apiKeys when only org config is provided", () => {
    const result = mergeOrgConfig(
      null,
      makeOrgConfig({ apiKeys: { anthropic: "sk-ant-org", google: "goog-org" } }),
    );
    expect(result.apiKeys).toEqual({
      anthropic: "sk-ant-org",
      google: "goog-org",
    });
  });

  // ── preferredModel: org overrides user ──────────────────────────────────

  it("org preferredModel overrides user aiModel", () => {
    const result = mergeOrgConfig(
      { aiModel: "claude-haiku-4-5-20251001" },
      makeOrgConfig({ preferredModel: "claude-sonnet-4-20250514" }),
    );
    expect(result.preferredModel).toBe("claude-sonnet-4-20250514");
  });

  it("falls back to user aiModel when org preferredModel is null", () => {
    const result = mergeOrgConfig(
      { aiModel: "claude-haiku-4-5-20251001" },
      makeOrgConfig({ preferredModel: null }),
    );
    expect(result.preferredModel).toBe("claude-haiku-4-5-20251001");
  });

  // ── apiKeys: user BYOK overrides org ────────────────────────────────────

  it("user BYOK anthropic key overrides org anthropic key", () => {
    const result = mergeOrgConfig(
      { apiKeys: { anthropic: "sk-ant-user" } },
      makeOrgConfig({ apiKeys: { anthropic: "sk-ant-org", openai: "sk-openai-org" } }),
    );
    expect(result.apiKeys).toEqual({
      anthropic: "sk-ant-user",
      openai: "sk-openai-org",
    });
  });

  it("user BYOK keys merge with org keys (user takes priority per provider)", () => {
    const result = mergeOrgConfig(
      { apiKeys: { anthropic: "sk-ant-user", google: "goog-user" } },
      makeOrgConfig({ apiKeys: { anthropic: "sk-ant-org", openai: "sk-openai-org" } }),
    );
    expect(result.apiKeys).toEqual({
      anthropic: "sk-ant-user",
      openai: "sk-openai-org",
      google: "goog-user",
    });
  });

  it("org keys are used when user has no apiKeys", () => {
    const result = mergeOrgConfig(
      { aiModel: "claude-sonnet-4-20250514" },
      makeOrgConfig({ apiKeys: { anthropic: "sk-ant-org" } }),
    );
    expect(result.apiKeys).toEqual({ anthropic: "sk-ant-org" });
  });

  // ── Empty apiKeys cleanup ───────────────────────────────────────────────

  it("removes apiKeys object when all keys are empty strings", () => {
    const result = mergeOrgConfig(
      { apiKeys: { anthropic: "", openai: "" } },
      makeOrgConfig({ apiKeys: { anthropic: "", google: "" } }),
    );
    // Falsy strings should be cleaned up, resulting in no apiKeys property
    expect(result.apiKeys).toBeUndefined();
  });

  it("removes apiKeys object when all keys are undefined", () => {
    const result = mergeOrgConfig(
      { apiKeys: {} },
      makeOrgConfig({ apiKeys: {} }),
    );
    expect(result.apiKeys).toBeUndefined();
  });

  it("cleans up individual empty keys but keeps valid ones", () => {
    const result = mergeOrgConfig(
      { apiKeys: { anthropic: "", openai: "sk-openai-user" } },
      makeOrgConfig({ apiKeys: { anthropic: "", google: "" } }),
    );
    expect(result.apiKeys).toEqual({ openai: "sk-openai-user" });
    // Verify empty keys are not present
    expect(result.apiKeys).not.toHaveProperty("anthropic");
    expect(result.apiKeys).not.toHaveProperty("google");
  });

  // ── Org-only fields not affected by user config ─────────────────────────

  it("does not set customSystemPrompt from user config (org-only field)", () => {
    const result = mergeOrgConfig(
      { aiModel: "claude-sonnet-4-20250514" },
      makeOrgConfig({ customSystemPrompt: null }),
    );
    expect(result.customSystemPrompt).toBeUndefined();
  });

  it("does not set enabledTools from user config (org-only field)", () => {
    const result = mergeOrgConfig(
      { aiModel: "claude-sonnet-4-20250514" },
      makeOrgConfig({ enabledTools: null }),
    );
    expect(result.enabledTools).toBeUndefined();
  });

  it("does not set maxTokens or temperature from user config (org-only fields)", () => {
    const result = mergeOrgConfig(
      { aiModel: "claude-sonnet-4-20250514" },
      makeOrgConfig({ maxTokens: null, temperature: null }),
    );
    expect(result.maxTokens).toBeUndefined();
    expect(result.temperature).toBeUndefined();
  });

  // ── Full merge scenario ─────────────────────────────────────────────────

  it("merges all fields correctly in a full scenario", () => {
    const result = mergeOrgConfig(
      {
        aiModel: "claude-haiku-4-5-20251001",
        apiKeys: { anthropic: "sk-ant-user" },
      },
      makeOrgConfig({
        preferredModel: "claude-sonnet-4-20250514",
        customSystemPrompt: "Act as a tech recruiter.",
        maxTokens: 4096,
        temperature: 0.5,
        apiKeys: { anthropic: "sk-ant-org", openai: "sk-openai-org" },
        enabledTools: ["searchJobs", "favoriteJob"],
      }),
    );

    expect(result).toEqual({
      preferredModel: "claude-sonnet-4-20250514", // org wins
      customSystemPrompt: "Act as a tech recruiter.",
      maxTokens: 4096,
      temperature: 0.5,
      enabledTools: ["searchJobs", "favoriteJob"],
      apiKeys: {
        anthropic: "sk-ant-user", // user BYOK wins
        openai: "sk-openai-org", // org fallback
      },
    } satisfies MergedAiConfig);
  });

  // ── Edge cases ──────────────────────────────────────────────────────────

  it("handles temperature of 0 correctly (falsy but valid)", () => {
    const result = mergeOrgConfig(
      null,
      makeOrgConfig({ temperature: 0 }),
    );
    expect(result.temperature).toBe(0);
  });

  it("handles maxTokens of 0 correctly (falsy but valid)", () => {
    const result = mergeOrgConfig(
      null,
      makeOrgConfig({ maxTokens: 0 }),
    );
    expect(result.maxTokens).toBe(0);
  });

  it("handles empty enabledTools array", () => {
    // An empty array is truthy, so it should be set
    const result = mergeOrgConfig(
      null,
      makeOrgConfig({ enabledTools: [] }),
    );
    expect(result.enabledTools).toEqual([]);
  });
});
