import { APICallError, wrapLanguageModel } from "ai";

/** The provider-level model type `wrapLanguageModel` takes (not re-exported by `ai`). */
type LanguageModelV3 = Parameters<typeof wrapLanguageModel>[0]["model"];

/**
 * Platform-credit fallback for Hust's own OpenRouter key.
 *
 * When the platform OpenRouter account runs out of credits, every paid call
 * fails with HTTP 402 and the chat shows "Something went wrong". Instead we
 * retry the same call on OpenRouter's free-model router so chat keeps working
 * (lower quality, but answering), and flag it so the UI can show a small
 * notice. BYOK calls are never wrapped — those are the user's own key/cost.
 */

/**
 * OpenRouter's router over the currently free models. It picks one that
 * supports the request (incl. tool calls), so it survives free-model churn
 * better than pinning a single `:free` slug.
 */
export const FREE_FALLBACK_MODEL_ID = "openrouter/free";

/**
 * Output cap for platform calls that set none. Without it OpenRouter reserves
 * the model's maximum (65,536 tokens for Sonnet), so a low balance rejects even
 * a one-line answer.
 */
export const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

/** After a 402, go straight to the free model for this long before retrying paid. */
const CREDITS_EXHAUSTED_COOLDOWN_MS = 5 * 60_000;

let creditsExhaustedUntil = 0;

/** Per-request record of whether the free fallback answered (for the UI notice). */
export interface FallbackState {
  usedFallback: boolean;
}

/** HTTP 402 = OpenRouter "insufficient credits / max cost exceeds balance". */
export function isInsufficientCreditsError(error: unknown): boolean {
  return APICallError.isInstance(error) && error.statusCode === 402;
}

/** Test hook: forget a previous 402 so tests don't leak into each other. */
export function resetCreditFallbackForTests(): void {
  creditsExhaustedUntil = 0;
}

function onCreditsExhausted(error: unknown): void {
  creditsExhaustedUntil = Date.now() + CREDITS_EXHAUSTED_COOLDOWN_MS;
  console.warn(
    `[ai] Platform OpenRouter credits exhausted (HTTP 402) — using free models (${FREE_FALLBACK_MODEL_ID}) for ${CREDITS_EXHAUSTED_COOLDOWN_MS / 60_000} min:`,
    error instanceof Error ? error.message : error,
  );
}

/**
 * Wrap a platform model so an out-of-credits error is retried on `fallback`
 * (normally `openrouter/free` on the same key) instead of failing the request.
 */
export function withFreeModelFallback(
  primary: LanguageModelV3,
  fallback: LanguageModelV3,
  state?: FallbackState,
): LanguageModelV3 {
  const markFallback = () => {
    if (state) state.usedFallback = true;
  };

  return wrapLanguageModel({
    model: primary,
    middleware: {
      specificationVersion: "v3",
      transformParams: async ({ params }) =>
        params.maxOutputTokens == null
          ? { ...params, maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS }
          : params,
      wrapGenerate: async ({ doGenerate, params }) => {
        if (Date.now() < creditsExhaustedUntil) {
          markFallback();
          return fallback.doGenerate(params);
        }
        try {
          return await doGenerate();
        } catch (error) {
          if (!isInsufficientCreditsError(error)) throw error;
          onCreditsExhausted(error);
          markFallback();
          return fallback.doGenerate(params);
        }
      },
      wrapStream: async ({ doStream, params }) => {
        if (Date.now() < creditsExhaustedUntil) {
          markFallback();
          return fallback.doStream(params);
        }
        try {
          return await doStream();
        } catch (error) {
          if (!isInsufficientCreditsError(error)) throw error;
          onCreditsExhausted(error);
          markFallback();
          return fallback.doStream(params);
        }
      },
    },
  });
}
