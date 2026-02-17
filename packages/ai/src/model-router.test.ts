import { getModelForUser } from "./model-router";

// Mock the @ai-sdk/anthropic module
jest.mock("@ai-sdk/anthropic", () => ({
  anthropic: (modelId: string) => ({
    modelId,
    provider: "anthropic",
  }),
}));

describe("getModelForUser", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.DEFAULT_AI_MODEL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("should return haiku for free users with no preferences", () => {
    const model = getModelForUser({
      subscriptionStatus: "free",
      preferences: null,
    });
    expect((model as { modelId: string }).modelId).toBe(
      "claude-haiku-4-5-20251001"
    );
  });

  it("should return opus for paid users with no preferences", () => {
    const model = getModelForUser({
      subscriptionStatus: "active",
      preferences: null,
    });
    expect((model as { modelId: string }).modelId).toBe("claude-opus-4-6");
  });

  it("should use user-selected model when set in preferences", () => {
    const model = getModelForUser({
      subscriptionStatus: "active",
      preferences: { aiModel: "claude-sonnet-4-5-20250929" },
    });
    expect((model as { modelId: string }).modelId).toBe(
      "claude-sonnet-4-5-20250929"
    );
  });

  it("should use BYOK key and return opus when anthropic key is provided", () => {
    const model = getModelForUser({
      subscriptionStatus: "free",
      preferences: {
        apiKeys: { anthropic: "sk-ant-123" },
      },
    });
    expect((model as { modelId: string }).modelId).toBe("claude-opus-4-6");
  });

  it("should prioritize BYOK over user model preference", () => {
    const model = getModelForUser({
      subscriptionStatus: "free",
      preferences: {
        aiModel: "claude-haiku-4-5-20251001",
        apiKeys: { anthropic: "sk-ant-123" },
      },
    });
    // BYOK takes priority (step 1 in the function)
    expect((model as { modelId: string }).modelId).toBe("claude-opus-4-6");
  });

  it("should use DEFAULT_AI_MODEL env var for paid users", () => {
    process.env.DEFAULT_AI_MODEL = "claude-sonnet-4-5-20250929";
    const model = getModelForUser({
      subscriptionStatus: "active",
      preferences: null,
    });
    expect((model as { modelId: string }).modelId).toBe(
      "claude-sonnet-4-5-20250929"
    );
  });

  it("should handle undefined preferences gracefully", () => {
    const model = getModelForUser({
      subscriptionStatus: "free",
    });
    expect((model as { modelId: string }).modelId).toBe(
      "claude-haiku-4-5-20251001"
    );
  });

  it("should handle empty preferences object", () => {
    const model = getModelForUser({
      subscriptionStatus: "active",
      preferences: {},
    });
    expect((model as { modelId: string }).modelId).toBe("claude-opus-4-6");
  });
});
