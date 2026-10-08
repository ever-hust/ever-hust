import { APICallError, wrapLanguageModel } from "ai";

/** The provider-level model type `wrapLanguageModel` takes (not re-exported by `ai`). */
type LanguageModelV3 = Parameters<typeof wrapLanguageModel>[0]["model"];

/**
 * Platform-credit fallback for Hust's own OpenRouter key.
 *
 * When the platform OpenRouter account runs out of credits (HTTP 402), or the
 * platform key hits its own credit limit (HTTP 403 "Key limit exceeded"), every
 * paid call fails and the chat shows "Something went wrong". Instead we retry
 * the same call on OpenRouter's free-model router so chat keeps working (lower
 * quality, but answering), and flag it so the UI can show a small notice. BYOK
 * calls are never wrapped — those are the user's own key/cost.
 */

/**
 * OpenRouter's router over the currently free models. It picks one that
 * supports the request (incl. tool calls), so it survives free-model churn
 * better than pinning a single `:free` slug.
 */
export const FREE_FALLBACK_MODEL_ID = "openrouter/free";

/**
 * OpenRouter routing for the fallback: chat carries profile, CV and inbox
 * content, so only providers that neither retain nor train on prompts, and only
 * ones that support every request parameter (tool calls). Verified live
 * 2026-10-05: `openrouter/free` still answers with tool calls under this.
 */
export const FREE_FALLBACK_PROVIDER_ROUTING = {
  data_collection: "deny",
  require_parameters: true,
} as const;

/**
 * Output cap for platform calls that set none. Without it OpenRouter reserves
 * the model's maximum (65,536 tokens for Sonnet), so a low balance rejects even
 * a one-line answer.
 */
export const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

/** After a 402 (or a 403 key limit), go straight to the free model for this long before retrying paid. */
const CREDITS_EXHAUSTED_COOLDOWN_MS = 5 * 60_000;

let creditsExhaustedUntil = 0;

/** Per-request record of whether the free fallback answered (for the UI notice). */
export interface FallbackState {
  usedFallback: boolean;
}

/**
 * Why a platform call ran out of money, in the words the log line uses:
 *  - HTTP 402: the OpenRouter account's balance cannot cover the request
 *    ("insufficient credits / max cost exceeds balance");
 *  - HTTP 403 "Key limit exceeded": the platform key's own credit limit is
 *    spent while the account may still have balance. Verified live 2026-10-08:
 *    `{"error":{"message":"Key limit exceeded (total limit). Manage it using
 *    https://openrouter.ai/...","code":403}}`, while `openrouter/free` still
 *    answers 200 on the same key.
 */
const CREDITS_EXHAUSTED_REASON = {
  402: "insufficient credits",
  403: "per-key credit limit",
} as const;

/**
 * OpenRouter's per-key limit message. Anchored at the start of the error
 * message on purpose: 403 is also OpenRouter's moderation code ("… requires
 * moderation … flagged"), and a moderation body echoes the user's flagged
 * input (`metadata.flagged_input`). A substring match on the raw body would let
 * a user who types "Key limit exceeded" turn a moderation block into a free
 * fallback, so only the error's own message is tested, never the whole body.
 */
const KEY_LIMIT_EXCEEDED = /^\s*key limit exceeded\b/i;

/** `error.message` of an OpenRouter error body (`{ error: { message } }`), if it has one. */
function openRouterErrorMessage(body: unknown): string | undefined {
  if (body === null || typeof body !== "object") return undefined;
  const inner = (body as { error?: unknown }).error;
  if (inner === null || typeof inner !== "object") return undefined;
  const message = (inner as { message?: unknown }).message;
  return typeof message === "string" ? message : undefined;
}

/** The OpenRouter error messages of an API error: the SDK's `message`, the parsed `data`, and the JSON `responseBody`. */
function errorMessages(error: APICallError): string[] {
  const messages = [error.message];
  const fromData = openRouterErrorMessage(error.data);
  if (fromData !== undefined) messages.push(fromData);
  if (error.responseBody) {
    try {
      const fromBody = openRouterErrorMessage(JSON.parse(error.responseBody));
      if (fromBody !== undefined) messages.push(fromBody);
    } catch {
      // Not JSON (e.g. an HTML error page): nothing more to read.
    }
  }
  return messages;
}

/** HTTP 403 whose OpenRouter error message is the per-key credit limit ("Key limit exceeded …"). */
export function isKeyLimitExceededError(error: unknown): boolean {
  return (
    APICallError.isInstance(error) &&
    error.statusCode === 403 &&
    errorMessages(error).some((m) => KEY_LIMIT_EXCEEDED.test(m))
  );
}

/**
 * True when a platform call failed for want of credits and the free model
 * should answer instead: HTTP 402 (account balance), or HTTP 403 "Key limit
 * exceeded" (the platform key's own limit). Every other error, a moderation
 * 403 included, is rethrown.
 */
export function isInsufficientCreditsError(error: unknown): boolean {
  if (!APICallError.isInstance(error)) return false;
  return error.statusCode === 402 || isKeyLimitExceededError(error);
}

/** Test hook: forget a previous 402/403 so tests don't leak into each other. */
export function resetCreditFallbackForTests(): void {
  creditsExhaustedUntil = 0;
}

function onCreditsExhausted(error: unknown): void {
  creditsExhaustedUntil = Date.now() + CREDITS_EXHAUSTED_COOLDOWN_MS;
  const status = APICallError.isInstance(error) ? error.statusCode : undefined;
  const reason =
    status === 402 || status === 403 ? CREDITS_EXHAUSTED_REASON[status] : "out of credits";
  // Keep the "[ai] Platform OpenRouter credits exhausted" prefix stable: log searches key on it.
  console.warn(
    `[ai] Platform OpenRouter credits exhausted (HTTP ${status ?? "?"}: ${reason}) — using free models (${FREE_FALLBACK_MODEL_ID}) for ${CREDITS_EXHAUSTED_COOLDOWN_MS / 60_000} min:`,
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
