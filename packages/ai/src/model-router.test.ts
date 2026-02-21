import { getModelForUser } from "./model-router";

// Mock the @ai-sdk/anthropic module
jest.mock("@ai-sdk/anthropic", () => ({
  anthropic: (modelId: string) => ({
    modelId,
    provider: "anthropic",
  }),
  createAnthropic: (opts: { apiKey: string }) => (modelId: string) => ({
    modelId,
    provider: "anthropic-byok",
    apiKey: opts.apiKey,
  }),
}));

// Mock the @openrouter/ai-sdk-provider module
jest.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: () => null, // Not configured in test env
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

  it("should return paid-tier default (sonnet) for paid users with no preferences", () => {
    // PAID_MODEL_ID resolves at module load: process.env.DEFAULT_AI_MODEL ?? "claude-sonnet-4-5-20250929"
    const model = getModelForUser({
      subscriptionStatus: "active",
      preferences: null,
    });
    expect((model as { modelId: string }).modelId).toBe(
      "claude-sonnet-4-5-20250929"
    );
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

  it("should accept claude-sonnet-4-6 as a valid model choice", () => {
    const model = getModelForUser({
      subscriptionStatus: "active",
      preferences: { aiModel: "claude-sonnet-4-6" },
    });
    expect((model as { modelId: string }).modelId).toBe("claude-sonnet-4-6");
  });

  it("should reject unlisted model IDs and fall back to paid default", () => {
    const model = getModelForUser({
      subscriptionStatus: "active",
      preferences: { aiModel: "gpt-4o-mini" },
    });
    // Falls through to PAID_MODEL_ID since "gpt-4o-mini" is not in ALLOWED_MODELS
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

  it("should use BYOK with user's preferred model", () => {
    const model = getModelForUser({
      subscriptionStatus: "free",
      preferences: {
        aiModel: "claude-haiku-4-5-20251001",
        apiKeys: { anthropic: "sk-ant-123" },
      },
    });
    // BYOK uses user's own key but respects their model preference
    expect((model as { modelId: string }).modelId).toBe(
      "claude-haiku-4-5-20251001"
    );
  });

  it("should use BYOK with opus when no model preference set", () => {
    const model = getModelForUser({
      subscriptionStatus: "free",
      preferences: {
        apiKeys: { anthropic: "sk-ant-123" },
      },
    });
    // BYOK without model preference defaults to opus
    expect((model as { modelId: string }).modelId).toBe("claude-opus-4-6");
  });

  it("should use PAID_MODEL_ID resolved at module load for paid users", () => {
    // NOTE: PAID_MODEL_ID is a module-level const, so changing process.env
    // after import has no effect.  This test verifies the default path uses
    // the resolved PAID_MODEL_ID ("claude-sonnet-4-5-20250929").
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
    // Empty preferences → no aiModel set → falls through to PAID_MODEL_ID default
    expect((model as { modelId: string }).modelId).toBe(
      "claude-sonnet-4-5-20250929"
    );
  });

  it("should ignore model preference for free users (prevent cost bypass)", () => {
    const model = getModelForUser({
      subscriptionStatus: "free",
      preferences: { aiModel: "claude-opus-4-6" },
    });
    // Free users always get haiku regardless of model preference
    expect((model as { modelId: string }).modelId).toBe(
      "claude-haiku-4-5-20251001"
    );
  });

  it("should treat past_due users as paid tier (grace period)", () => {
    const model = getModelForUser({
      subscriptionStatus: "past_due",
      preferences: { aiModel: "claude-sonnet-4-5-20250929" },
    });
    // past_due users retain Pro access during Stripe's grace period
    expect((model as { modelId: string }).modelId).toBe(
      "claude-sonnet-4-5-20250929"
    );
  });

  it("should treat null subscriptionStatus as free tier", () => {
    const model = getModelForUser({
      subscriptionStatus: null as unknown as string,
      preferences: null,
    });
    expect((model as { modelId: string }).modelId).toBe(
      "claude-haiku-4-5-20251001"
    );
  });

  it("should treat undefined subscriptionStatus as free tier", () => {
    const model = getModelForUser({
      subscriptionStatus: undefined as unknown as string,
      preferences: null,
    });
    expect((model as { modelId: string }).modelId).toBe(
      "claude-haiku-4-5-20251001"
    );
  });

  it("should not use empty string BYOK key as valid API key", () => {
    const model = getModelForUser({
      subscriptionStatus: "free",
      preferences: {
        apiKeys: { anthropic: "" },
      },
    });
    // Empty string is falsy — should fall through to free tier haiku
    expect((model as { modelId: string }).modelId).toBe(
      "claude-haiku-4-5-20251001"
    );
  });

  it("should not use whitespace-only BYOK key as valid API key", () => {
    const model = getModelForUser({
      subscriptionStatus: "free",
      preferences: {
        apiKeys: { anthropic: "   " },
      },
    });
    // Whitespace-only key should fall through to free tier haiku
    expect((model as { modelId: string }).modelId).toBe(
      "claude-haiku-4-5-20251001"
    );
  });

  it("should use BYOK but fall back to opus when model preference is invalid", () => {
    const model = getModelForUser({
      subscriptionStatus: "free",
      preferences: {
        aiModel: "gpt-4o-turbo",
        apiKeys: { anthropic: "sk-ant-valid-key" },
      },
    });
    // BYOK with invalid model preference → should use opus default
    expect((model as { modelId: string }).modelId).toBe("claude-opus-4-6");
  });

  // ===========================================================================
  // BYOK ciphertext fallback (when BYOK_ENCRYPTION_KEY is missing)
  // ===========================================================================

  describe("BYOK ciphertext fallback", () => {
    it("should fall back to platform model when encrypted key has colons and decryption returns null", () => {
      // Simulate encrypted ciphertext format: iv:authTag:ciphertext
      // When BYOK_ENCRYPTION_KEY is missing, decryptApiKey() throws → returns null
      // The model router should detect this and fall through to platform model
      const model = getModelForUser({
        subscriptionStatus: "active",
        preferences: {
          apiKeys: { anthropic: "dGVzdA==:dGVzdA==:Y2lwaGVy" },
        },
      });
      // Should get paid model (active subscription) instead of trying BYOK
      expect((model as { modelId: string }).modelId).toBe(
        "claude-sonnet-4-5-20250929"
      );
    });

    it("should fall back to free model for non-active user with encrypted ciphertext", () => {
      const model = getModelForUser({
        subscriptionStatus: "free",
        preferences: {
          apiKeys: { anthropic: "dGVzdA==:dGVzdA==:Y2lwaGVy" },
        },
      });
      // Free user + ciphertext fallback → free model
      expect((model as { modelId: string }).modelId).toBe(
        "claude-haiku-4-5-20251001"
      );
    });

    it("should use plaintext BYOK key when it has no colons (backwards compat)", () => {
      const model = getModelForUser({
        subscriptionStatus: "free",
        preferences: {
          apiKeys: { anthropic: "sk-ant-plain-text-key-123" },
        },
      });
      // Plaintext key (no colons) → decryptApiKey returns it as-is → use BYOK
      expect((model as { modelId: string }).modelId).toBe("claude-opus-4-6");
      expect((model as { provider: string }).provider).toBe("anthropic-byok");
    });
  });
});
