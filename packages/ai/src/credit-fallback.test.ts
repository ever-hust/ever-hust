import { APICallError, generateText, streamText } from "ai";
import { MockLanguageModelV3, convertArrayToReadableStream } from "ai/test";
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  isInsufficientCreditsError,
  resetCreditFallbackForTests,
  withFreeModelFallback,
  type FallbackState,
} from "./credit-fallback";

const usage = {
  inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 2, text: 2, reasoning: 0 },
};

function creditsError(): APICallError {
  return new APICallError({
    message: "This request requires more credits, or fewer max_tokens.",
    url: "https://openrouter.ai/api/v1/chat/completions",
    requestBodyValues: {},
    statusCode: 402,
    isRetryable: false,
  });
}

function answering(text: string): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: "stop" },
      usage,
      warnings: [],
    }),
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

function outOfCredits(): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async () => {
      throw creditsError();
    },
    doStream: async () => {
      throw creditsError();
    },
  });
}

beforeEach(() => {
  resetCreditFallbackForTests();
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("isInsufficientCreditsError", () => {
  it("is true only for an HTTP 402 API error", () => {
    expect(isInsufficientCreditsError(creditsError())).toBe(true);
    expect(
      isInsufficientCreditsError(
        new APICallError({
          message: "rate limited",
          url: "x",
          requestBodyValues: {},
          statusCode: 429,
        }),
      ),
    ).toBe(false);
    expect(isInsufficientCreditsError(new Error("boom"))).toBe(false);
  });
});

describe("withFreeModelFallback", () => {
  it("uses the primary model while it has credits", async () => {
    const state: FallbackState = { usedFallback: false };
    const free = answering("free answer");
    const model = withFreeModelFallback(answering("paid answer"), free, state);

    const { text } = await generateText({ model, prompt: "hi" });

    expect(text).toBe("paid answer");
    expect(state.usedFallback).toBe(false);
    expect(free.doGenerateCalls).toHaveLength(0);
  });

  it("retries a generate call on the free model when the primary returns 402", async () => {
    const state: FallbackState = { usedFallback: false };
    const model = withFreeModelFallback(outOfCredits(), answering("free answer"), state);

    const { text } = await generateText({ model, prompt: "hi" });

    expect(text).toBe("free answer");
    expect(state.usedFallback).toBe(true);
  });

  it("retries a streaming call on the free model when the primary returns 402", async () => {
    const state: FallbackState = { usedFallback: false };
    const model = withFreeModelFallback(outOfCredits(), answering("free stream"), state);

    const result = streamText({ model, prompt: "hi" });

    expect(await result.text).toBe("free stream");
    expect(state.usedFallback).toBe(true);
  });

  it("does not swallow errors other than 402", async () => {
    const broken = new MockLanguageModelV3({
      doGenerate: async () => {
        throw new APICallError({
          message: "bad request",
          url: "x",
          requestBodyValues: {},
          statusCode: 400,
          isRetryable: false,
        });
      },
    });
    const free = answering("free answer");
    const model = withFreeModelFallback(broken, free);

    await expect(generateText({ model, prompt: "hi", maxRetries: 0 })).rejects.toThrow(
      "bad request",
    );
    expect(free.doGenerateCalls).toHaveLength(0);
  });

  it("skips the paid model for later calls once credits ran out", async () => {
    const paid = outOfCredits();
    const free = answering("free answer");

    await generateText({ model: withFreeModelFallback(paid, free), prompt: "first" });
    const state: FallbackState = { usedFallback: false };
    await generateText({ model: withFreeModelFallback(paid, free, state), prompt: "second" });

    expect(paid.doGenerateCalls).toHaveLength(1);
    expect(free.doGenerateCalls).toHaveLength(2);
    expect(state.usedFallback).toBe(true);
  });

  it("caps output tokens when the caller sets none, and keeps an explicit cap", async () => {
    const paid = answering("ok");
    await generateText({ model: withFreeModelFallback(paid, answering("x")), prompt: "a" });
    await generateText({
      model: withFreeModelFallback(paid, answering("x")),
      prompt: "b",
      maxOutputTokens: 300,
    });

    expect(paid.doGenerateCalls[0]!.maxOutputTokens).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
    expect(paid.doGenerateCalls[1]!.maxOutputTokens).toBe(300);
  });
});
