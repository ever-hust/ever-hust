import { getModelForUser } from "./model-router";

// Mock the @ai-sdk/anthropic module (used for both the platform degraded
// fallback and the Anthropic BYOK plugin).
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

// Platform OpenRouter is not configured in the test env → getPlatformModel
// takes the direct-Anthropic fallback path.
jest.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: () => null,
}));

type M = { modelId: string; provider?: string; apiKey?: string };

describe("getModelForUser", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OPENROUTER_API_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // ── Defaults (no model selected) ───────────────────────────────────────────

  it("free user, no preferences → Hust free default (Sonnet 5.5)", () => {
    const model = getModelForUser({ subscriptionStatus: "free", preferences: null }) as M;
    expect(model.modelId).toBe("claude-sonnet-5-5");
  });

  it("paid user, no preferences → Hust pro default (Opus 5.5)", () => {
    const model = getModelForUser({ subscriptionStatus: "active", preferences: null }) as M;
    expect(model.modelId).toBe("claude-opus-5-5");
  });

  it("past_due retains pro default (grace period)", () => {
    const model = getModelForUser({ subscriptionStatus: "past_due", preferences: null }) as M;
    expect(model.modelId).toBe("claude-opus-5-5");
  });

  it("null subscriptionStatus → free tier", () => {
    const model = getModelForUser({
      subscriptionStatus: null as unknown as string,
      preferences: null,
    }) as M;
    expect(model.modelId).toBe("claude-sonnet-5-5");
  });

  it("undefined subscriptionStatus → free tier", () => {
    const model = getModelForUser({
      subscriptionStatus: undefined as unknown as string,
      preferences: null,
    }) as M;
    expect(model.modelId).toBe("claude-sonnet-5-5");
  });

  it("undefined preferences handled gracefully", () => {
    const model = getModelForUser({ subscriptionStatus: "free" }) as M;
    expect(model.modelId).toBe("claude-sonnet-5-5");
  });

  it("empty preferences object → tier default", () => {
    const model = getModelForUser({ subscriptionStatus: "active", preferences: {} }) as M;
    expect(model.modelId).toBe("claude-opus-5-5");
  });

  // ── Hust platform model selection ───────────────────────────────────────────

  it("free user selecting the Hust free model gets it", () => {
    const model = getModelForUser({
      subscriptionStatus: "free",
      preferences: { aiModel: "hust:anthropic/claude-haiku-4.5" },
    }) as M;
    expect(model.modelId).toBe("claude-haiku-4-5-20251001");
  });

  it("paid user selecting a Hust pro model gets it", () => {
    const model = getModelForUser({
      subscriptionStatus: "active",
      preferences: { aiModel: "hust:anthropic/claude-opus-5.5" },
    }) as M;
    expect(model.modelId).toBe("claude-opus-5-5");
  });

  it("free user selecting a Hust PRO model is denied → free default (no cost bypass)", () => {
    const model = getModelForUser({
      subscriptionStatus: "free",
      preferences: { aiModel: "hust:anthropic/claude-opus-5.5" },
    }) as M;
    expect(model.modelId).toBe("claude-sonnet-5-5");
  });

  it("a saved key for a retired Hust model follows its successor", () => {
    const model = getModelForUser({
      subscriptionStatus: "active",
      preferences: { aiModel: "hust:anthropic/claude-sonnet-4.6" },
    }) as M;
    expect(model.modelId).toBe("claude-sonnet-5-5");
  });

  it("a saved key for a retired BYOK model follows its successor on the user's key", () => {
    const model = getModelForUser({
      subscriptionStatus: "free",
      preferences: {
        aiModel: "anthropic:claude-opus-4-8",
        apiKeys: { anthropic: "sk-ant-123" },
      },
    }) as M;
    expect(model.modelId).toBe("claude-opus-5-5");
    expect(model.provider).toBe("anthropic-byok");
  });

  it("unknown / legacy model id → tier default", () => {
    const model = getModelForUser({
      subscriptionStatus: "active",
      preferences: { aiModel: "gpt-4o" },
    }) as M;
    expect(model.modelId).toBe("claude-opus-5-5");
  });

  // ── BYOK (user's own key — works on any tier, requires a model selection) ────

  it("BYOK Anthropic model + key works for a FREE user (own key, any tier)", () => {
    const model = getModelForUser({
      subscriptionStatus: "free",
      preferences: {
        aiModel: "anthropic:claude-opus-5-5",
        apiKeys: { anthropic: "sk-ant-123" },
      },
    }) as M;
    expect(model.modelId).toBe("claude-opus-5-5");
    expect(model.provider).toBe("anthropic-byok");
    expect(model.apiKey).toBe("sk-ant-123");
  });

  it("BYOK respects the selected Anthropic model id", () => {
    const model = getModelForUser({
      subscriptionStatus: "active",
      preferences: {
        aiModel: "anthropic:claude-sonnet-5-5",
        apiKeys: { anthropic: "sk-ant-123" },
      },
    }) as M;
    expect(model.modelId).toBe("claude-sonnet-5-5");
    expect(model.provider).toBe("anthropic-byok");
  });

  it("BYOK model selected but NO key → falls back to Hust tier default", () => {
    const model = getModelForUser({
      subscriptionStatus: "free",
      preferences: { aiModel: "anthropic:claude-opus-5-5" },
    }) as M;
    // No usable key → not BYOK → Hust free default.
    expect(model.modelId).toBe("claude-sonnet-5-5");
  });

  it("a saved key without selecting that provider's model stays on Hust default", () => {
    const model = getModelForUser({
      subscriptionStatus: "active",
      preferences: { apiKeys: { anthropic: "sk-ant-123" } },
    }) as M;
    // Hust is the default; switching requires selecting a BYOK model.
    expect(model.modelId).toBe("claude-opus-5-5");
    expect(model.provider).toBe("anthropic");
  });

  it("empty-string BYOK key is ignored", () => {
    const model = getModelForUser({
      subscriptionStatus: "free",
      preferences: {
        aiModel: "anthropic:claude-opus-5-5",
        apiKeys: { anthropic: "" },
      },
    }) as M;
    expect(model.modelId).toBe("claude-sonnet-5-5");
  });

  it("whitespace-only BYOK key is ignored", () => {
    const model = getModelForUser({
      subscriptionStatus: "free",
      preferences: {
        aiModel: "anthropic:claude-opus-5-5",
        apiKeys: { anthropic: "   " },
      },
    }) as M;
    expect(model.modelId).toBe("claude-sonnet-5-5");
  });

  // ── BYOK ciphertext fallback (when BYOK_ENCRYPTION_KEY is missing) ───────────

  describe("BYOK ciphertext fallback", () => {
    it("ciphertext that fails to decrypt is skipped → Hust pro default for paid", () => {
      const model = getModelForUser({
        subscriptionStatus: "active",
        preferences: {
          aiModel: "anthropic:claude-opus-5-5",
          apiKeys: { anthropic: "dGVzdA==:dGVzdA==:Y2lwaGVy" },
        },
      }) as M;
      expect(model.modelId).toBe("claude-opus-5-5");
      expect(model.provider).toBe("anthropic");
    });

    it("ciphertext skipped → Hust free default for free user", () => {
      const model = getModelForUser({
        subscriptionStatus: "free",
        preferences: {
          aiModel: "anthropic:claude-opus-5-5",
          apiKeys: { anthropic: "dGVzdA==:dGVzdA==:Y2lwaGVy" },
        },
      }) as M;
      expect(model.modelId).toBe("claude-sonnet-5-5");
    });

    it("plaintext key (no colons) is used as-is for backwards compat", () => {
      const model = getModelForUser({
        subscriptionStatus: "free",
        preferences: {
          aiModel: "anthropic:claude-opus-5-5",
          apiKeys: { anthropic: "sk-ant-plain-text-key-123" },
        },
      }) as M;
      expect(model.modelId).toBe("claude-opus-5-5");
      expect(model.provider).toBe("anthropic-byok");
    });
  });
});
