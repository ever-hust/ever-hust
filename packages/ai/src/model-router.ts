import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";

// Allowlist of models users can select — prevents arbitrary model strings
const ALLOWED_MODELS = new Set([
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-20250514",
  "claude-sonnet-4-5-20250929",
  "claude-opus-4-6",
]);

interface UserForModel {
  subscriptionStatus: string;
  preferences?: {
    aiModel?: string;
    apiKeys?: {
      anthropic?: string;
      openai?: string;
      google?: string;
    };
  } | null;
}

/** Map of Anthropic model IDs to their OpenRouter equivalents */
const ANTHROPIC_TO_OPENROUTER: Record<string, string> = {
  "claude-opus-4-6": "anthropic/claude-opus-4",
  "claude-sonnet-4-20250514": "anthropic/claude-sonnet-4",
  "claude-haiku-4-5-20251001": "anthropic/claude-3.5-haiku",
  "claude-3-5-sonnet-20241022": "anthropic/claude-3.5-sonnet",
};

// Singleton OpenRouter provider
let openRouterProvider: ReturnType<typeof createOpenRouter> | null = null;

function getOpenRouterProvider(): ReturnType<typeof createOpenRouter> | null {
  if (openRouterProvider) return openRouterProvider;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  openRouterProvider = createOpenRouter({
    apiKey,
  });
  return openRouterProvider;
}

/**
 * Get a LanguageModel using the platform provider (OpenRouter or direct Anthropic).
 * OpenRouter is preferred when configured — it gives us access to 300+ models
 * and integrates with Langfuse for tracing & cost tracking.
 */
function getPlatformModel(modelId: string): LanguageModel {
  const or = getOpenRouterProvider();

  if (or) {
    // Translate Anthropic model IDs to OpenRouter format if needed
    const orModelId = ANTHROPIC_TO_OPENROUTER[modelId] ?? modelId;
    return or.chat(orModelId);
  }

  // Fallback: direct Anthropic SDK
  return anthropic(modelId);
}

/**
 * Free-tier default model.
 * Uses a smaller, faster model to keep costs manageable.
 */
const FREE_MODEL_ID = "claude-haiku-4-5-20251001";

/**
 * Paid-tier default model.
 */
const PAID_MODEL_ID =
  process.env.DEFAULT_AI_MODEL ?? "claude-sonnet-4-20250514";

/**
 * Resolve the correct LanguageModel for a given user.
 *
 * Route:  Vercel AI SDK  ──(OTEL)──>  Langfuse  ──>  OpenRouter / Anthropic
 *
 * Langfuse tracing is handled at the Next.js instrumentation layer
 * (see apps/web/instrumentation.ts) — this function only picks the model.
 */
export function getModelForUser(user: UserForModel): LanguageModel {
  // 1. BYOK: user has their own Anthropic API key → direct Anthropic
  //    Respect their aiModel preference if set; fall back to opus otherwise.
  if (user.preferences?.apiKeys?.anthropic) {
    const byokProvider = createAnthropic({
      apiKey: user.preferences.apiKeys.anthropic,
    });
    const preferredModel = user.preferences.aiModel;
    const modelId =
      preferredModel && ALLOWED_MODELS.has(preferredModel)
        ? preferredModel
        : "claude-opus-4-6";
    return byokProvider(modelId);
  }

  // 2. Free-tier users always get the free model — no model preference override.
  //    This prevents free users from setting aiModel to an expensive model
  //    and having the platform pay for it through OpenRouter.
  if (user.subscriptionStatus !== "active") {
    return getPlatformModel(FREE_MODEL_ID);
  }

  // 3. Paid user preference: validate against allowlist, route through platform
  if (
    user.preferences?.aiModel &&
    ALLOWED_MODELS.has(user.preferences.aiModel)
  ) {
    return getPlatformModel(user.preferences.aiModel);
  }

  // 4. Platform default: use PAID_MODEL_ID (from env or hardcoded fallback)
  return getPlatformModel(
    ALLOWED_MODELS.has(PAID_MODEL_ID) ? PAID_MODEL_ID : "claude-opus-4-6"
  );
}
