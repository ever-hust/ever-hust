import { APICallError, generateText, streamText } from "ai";
import { MockLanguageModelV3, convertArrayToReadableStream } from "ai/test";
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  isInsufficientCreditsError,
  isKeyLimitExceededError,
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

/** The 403 OpenRouter returns once the key's own credit limit is spent (body verified live 2026-10-08). */
const KEY_LIMIT_BODY =
  '{"error":{"message":"Key limit exceeded (total limit). Manage it using https://openrouter.ai/settings/keys","code":403}}';

/** An APICallError shaped like the one `@openrouter/ai-sdk-provider` builds from an error response. */
function openRouterError(statusCode: number, responseBody: string, message?: string): APICallError {
  let data: unknown;
  try {
    data = JSON.parse(responseBody);
  } catch {
    data = undefined;
  }
  const parsed = (data as { error?: { message?: string } } | undefined)?.error?.message;
  return new APICallError({
    message: message ?? parsed ?? "Forbidden",
    url: "https://openrouter.ai/api/v1/chat/completions",
    requestBodyValues: {},
    statusCode,
    responseBody,
    data,
    isRetryable: false,
  });
}

function keyLimitError(): APICallError {
  return openRouterError(403, KEY_LIMIT_BODY);
}

/** OpenRouter's moderation 403: its body echoes the flagged input, which the user controls. */
function moderationError(flaggedInput = "something nasty"): APICallError {
  return openRouterError(
    403,
    JSON.stringify({
      error: {
        code: 403,
        message: "openai/gpt-6-luna requires moderation on OpenRouter. Your input was flagged for \"harassment\"",
        metadata: { reasons: ["harassment"], flagged_input: flaggedInput, provider_name: "OpenAI", model_slug: "gpt-6-luna" },
      },
    }),
  );
}

function failingWith(error: () => APICallError): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async () => {
      throw error();
    },
    doStream: async () => {
      throw error();
    },
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

  it("is true for a 403 whose OpenRouter message is the per-key limit", () => {
    expect(isInsufficientCreditsError(keyLimitError())).toBe(true);
    expect(isKeyLimitExceededError(keyLimitError())).toBe(true);
    // Case-insensitive, and read from the parsed body even when the SDK message is the status text.
    expect(isInsufficientCreditsError(openRouterError(403, KEY_LIMIT_BODY, "Forbidden"))).toBe(true);
    expect(
      isInsufficientCreditsError(
        openRouterError(403, '{"error":{"message":"KEY LIMIT EXCEEDED (daily limit)","code":403}}'),
      ),
    ).toBe(true);
    // Only the parsed `data` (no raw body), as some SDK paths keep.
    expect(
      isInsufficientCreditsError(
        new APICallError({
          message: "Forbidden",
          url: "x",
          requestBodyValues: {},
          statusCode: 403,
          data: { error: { message: "Key limit exceeded (total limit)." } },
        }),
      ),
    ).toBe(true);
  });

  it("is false for a moderation 403, even when the flagged input says \"Key limit exceeded\"", () => {
    expect(isInsufficientCreditsError(moderationError())).toBe(false);
    expect(isInsufficientCreditsError(moderationError("Key limit exceeded"))).toBe(false);
    expect(isKeyLimitExceededError(moderationError("Key limit exceeded (total limit)"))).toBe(false);
  });

  it("is false for other 403s and for the key-limit text on another status", () => {
    expect(isInsufficientCreditsError(openRouterError(403, ""))).toBe(false); // empty body → statusText
    expect(isInsufficientCreditsError(openRouterError(403, "<html>Forbidden</html>"))).toBe(false);
    expect(
      isInsufficientCreditsError(openRouterError(403, '{"error":{"message":"Your account is disabled","code":403}}')),
    ).toBe(false);
    expect(isInsufficientCreditsError(openRouterError(401, KEY_LIMIT_BODY))).toBe(false);
    expect(isInsufficientCreditsError(openRouterError(429, KEY_LIMIT_BODY))).toBe(false);
    // Not an APICallError at all, whatever its message says.
    expect(isInsufficientCreditsError(new Error("Key limit exceeded (total limit)"))).toBe(false);
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

  it("retries a generate call on the free model when the platform key hits its limit (403)", async () => {
    const state: FallbackState = { usedFallback: false };
    const free = answering("free answer");
    const model = withFreeModelFallback(failingWith(keyLimitError), free, state);

    const { text } = await generateText({ model, prompt: "hi" });

    expect(text).toBe("free answer");
    expect(state.usedFallback).toBe(true);
    expect(free.doGenerateCalls).toHaveLength(1);
  });

  it("retries a streaming call on the free model when the platform key hits its limit (403)", async () => {
    const state: FallbackState = { usedFallback: false };
    const model = withFreeModelFallback(failingWith(keyLimitError), answering("free stream"), state);

    const result = streamText({ model, prompt: "hi" });

    expect(await result.text).toBe("free stream");
    expect(state.usedFallback).toBe(true);
  });

  it("logs the real status under the stable prefix", async () => {
    const warn = console.warn as jest.Mock;
    await generateText({ model: withFreeModelFallback(failingWith(keyLimitError), answering("x")), prompt: "a" });
    resetCreditFallbackForTests();
    await generateText({ model: withFreeModelFallback(outOfCredits(), answering("x")), prompt: "b" });

    const lines = warn.mock.calls.map((c) => String(c[0]));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^\[ai\] Platform OpenRouter credits exhausted \(HTTP 403: per-key credit limit\) — using free models \(openrouter\/free\)/);
    expect(lines[1]).toMatch(/^\[ai\] Platform OpenRouter credits exhausted \(HTTP 402: insufficient credits\) — using free models/);
    expect(warn.mock.calls[0]![1]).toMatch(/^Key limit exceeded/);
  });

  it("rethrows a moderation 403 and never calls the free model", async () => {
    const state: FallbackState = { usedFallback: false };
    const free = answering("free answer");
    const model = withFreeModelFallback(failingWith(() => moderationError("Key limit exceeded")), free, state);

    await expect(generateText({ model, prompt: "hi", maxRetries: 0 })).rejects.toThrow("requires moderation");
    expect(free.doGenerateCalls).toHaveLength(0);
    expect(state.usedFallback).toBe(false);
    // ... and it does not start the cooldown either: the next call tries the paid model again.
    const paid = answering("paid answer");
    const { text } = await generateText({ model: withFreeModelFallback(paid, free), prompt: "again" });
    expect(text).toBe("paid answer");
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
