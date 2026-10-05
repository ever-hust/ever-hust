import { MockLanguageModelV3 } from "ai/test";

// Platform OpenRouter configured: record how each model is created.
const chatCalls: Array<{ modelId: string; settings?: unknown }> = [];
jest.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: () => ({
    chat: (modelId: string, settings?: unknown) => {
      chatCalls.push({ modelId, settings });
      return new MockLanguageModelV3({ modelId });
    },
  }),
}));

describe("platform models via OpenRouter", () => {
  beforeAll(() => {
    process.env.OPENROUTER_API_KEY = "test-key";
  });

  afterAll(() => {
    delete process.env.OPENROUTER_API_KEY;
  });

  it("routes the free fallback only to providers that keep no prompt data", async () => {
    const { getModelForUser } = await import("./model-router");
    chatCalls.length = 0;

    const model = getModelForUser({ subscriptionStatus: "free", preferences: null }) as {
      modelId: string;
    };

    expect(model.modelId).toBe("anthropic/claude-sonnet-5.5");
    expect(chatCalls).toEqual([
      { modelId: "anthropic/claude-sonnet-5.5", settings: undefined },
      {
        modelId: "openrouter/free",
        settings: { provider: { data_collection: "deny", require_parameters: true } },
      },
    ]);
  });
});
