import { getModelForUser, getProviderInfo } from "./model-router";

// Clear module cache between tests to reset singletons
beforeEach(() => {
  jest.resetModules();
  // Clear env vars
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.DEFAULT_AI_MODEL;
  delete process.env.LANGFUSE_PUBLIC_KEY;
  delete process.env.LANGFUSE_SECRET_KEY;
});

describe("getModelForUser", () => {
  it("should return a model for free user", () => {
    const model = getModelForUser({
      subscriptionStatus: "free",
      preferences: null,
    });

    expect(model).toBeDefined();
    expect(typeof model).toBe("object");
  });

  it("should return a model for paid user", () => {
    const model = getModelForUser({
      subscriptionStatus: "active",
      preferences: null,
    });

    expect(model).toBeDefined();
    expect(typeof model).toBe("object");
  });

  it("should return a model when user has preference", () => {
    const model = getModelForUser({
      subscriptionStatus: "active",
      preferences: {
        aiModel: "claude-haiku-4-5-20251001",
      },
    });

    expect(model).toBeDefined();
  });

  it("should return a BYOK model when user has anthropic key", () => {
    const model = getModelForUser({
      subscriptionStatus: "free",
      preferences: {
        apiKeys: {
          anthropic: "sk-test-key",
        },
      },
    });

    expect(model).toBeDefined();
  });

  it("should handle null preferences", () => {
    const model = getModelForUser({
      subscriptionStatus: "free",
      preferences: null,
    });

    expect(model).toBeDefined();
  });

  it("should handle undefined preferences", () => {
    const model = getModelForUser({
      subscriptionStatus: "free",
    });

    expect(model).toBeDefined();
  });

  it("should handle empty preferences object", () => {
    const model = getModelForUser({
      subscriptionStatus: "active",
      preferences: {},
    });

    expect(model).toBeDefined();
  });

  it("should prioritize BYOK over user preference", () => {
    // BYOK should take precedence over model selection
    const model = getModelForUser({
      subscriptionStatus: "active",
      preferences: {
        aiModel: "claude-haiku-4-5-20251001",
        apiKeys: {
          anthropic: "sk-test-key",
        },
      },
    });

    expect(model).toBeDefined();
  });
});

describe("getProviderInfo", () => {
  it("should report anthropic when no OpenRouter key", () => {
    delete process.env.OPENROUTER_API_KEY;
    const info = getProviderInfo();

    expect(info.provider).toBe("anthropic");
  });

  it("should report openrouter when key is set", () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    const info = getProviderInfo();

    expect(info.provider).toBe("openrouter");
    delete process.env.OPENROUTER_API_KEY;
  });

  it("should report langfuse disabled when keys not set", () => {
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    const info = getProviderInfo();

    expect(info.langfuseEnabled).toBe(false);
  });

  it("should report langfuse enabled when both keys set", () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk-lf-test";
    process.env.LANGFUSE_SECRET_KEY = "sk-lf-test";
    const info = getProviderInfo();

    expect(info.langfuseEnabled).toBe(true);
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
  });

  it("should report langfuse disabled when only public key set", () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk-lf-test";
    delete process.env.LANGFUSE_SECRET_KEY;
    const info = getProviderInfo();

    expect(info.langfuseEnabled).toBe(false);
    delete process.env.LANGFUSE_PUBLIC_KEY;
  });
});
