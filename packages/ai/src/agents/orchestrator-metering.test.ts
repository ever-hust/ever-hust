import { APICallError } from "ai";
import { MockLanguageModelV3, convertArrayToReadableStream } from "ai/test";
import { recordChatUsage } from "../credits";
import {
  resetCreditFallbackForTests,
  withFreeModelFallback,
  type FallbackState,
} from "../credit-fallback";
import { createOrchestratorStream } from "./orchestrator";

jest.mock("../credits", () => ({ recordChatUsage: jest.fn(async () => 0) }));
jest.mock("../prompts", () => ({
  getOrchestratorPrompt: async () => ({ text: "You are Hust.", langfusePrompt: null }),
}));

const usage = {
  inputTokens: { total: 1000, noCache: 1000, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 500, text: 500, reasoning: 0 },
};

function answering(text: string): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: "text-start", id: "t" },
        { type: "text-delta", id: "t", delta: text },
        { type: "text-end", id: "t" },
        { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
      ]),
    }),
  });
}

const outOfCredits = () =>
  new MockLanguageModelV3({
    doStream: async () => {
      throw new APICallError({
        message: "requires more credits",
        url: "https://openrouter.ai/api/v1/chat/completions",
        requestBodyValues: {},
        statusCode: 402,
        isRetryable: false,
      });
    },
  });

async function runTurn(model: MockLanguageModelV3 | ReturnType<typeof withFreeModelFallback>, fallbackState?: FallbackState) {
  const result = await createOrchestratorStream({
    model,
    messages: [{ role: "user", content: "hi" }],
    userId: "user-1",
    modelKey: "hust:anthropic/claude-sonnet-5.5",
    meterCredits: true,
    fallbackState,
  });
  await result.consumeStream();
  // onFinish runs after the stream ends; let its promise settle.
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  resetCreditFallbackForTests();
  jest.mocked(recordChatUsage).mockClear();
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("chat credit metering", () => {
  it("charges the selected model when it answered", async () => {
    await runTurn(answering("paid"), { usedFallback: false });

    expect(recordChatUsage).toHaveBeenCalledWith({
      userId: "user-1",
      modelKey: "hust:anthropic/claude-sonnet-5.5",
      inputTokens: 1000,
      outputTokens: 500,
    });
  });

  it("charges nothing when a free fallback model answered", async () => {
    const state: FallbackState = { usedFallback: false };
    await runTurn(withFreeModelFallback(outOfCredits(), answering("free"), state), state);

    expect(state.usedFallback).toBe(true);
    expect(recordChatUsage).not.toHaveBeenCalled();
  });
});
