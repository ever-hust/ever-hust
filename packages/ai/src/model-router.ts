import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";

// ---------------------------------------------------------------------------
// Model routing: Vercel AI SDK → Langfuse (tracing) → OpenRouter / Anthropic
//
// Priority chain:
//   1. BYOK (user's own Anthropic key) → direct Anthropic
//   2. User preference model → platform provider
//   3. Tier-based default → platform provider
//   4. Platform default from env → platform provider
//
// "Platform provider" is OpenRouter when OPENROUTER_API_KEY is set,
// otherwise falls back to direct Anthropic via ANTHROPIC_API_KEY.
// ---------------------------------------------------------------------------

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
  if (user.preferences?.apiKeys?.anthropic) {
    const byokProvider = createAnthropic({
      apiKey: user.preferences.apiKeys.anthropic,
    });
    return byokProvider("claude-opus-4-6");
  }

  // 2. User preference: user selected a specific model in settings
  if (user.preferences?.aiModel) {
    return getPlatformModel(user.preferences.aiModel);
  }

  // 3. Tier default: free = haiku, paid = sonnet/opus
  if (user.subscriptionStatus === "free") {
    return getPlatformModel(FREE_MODEL_ID);
  }

  // 4. Platform default from env var
  return getPlatformModel(PAID_MODEL_ID);
}

/**
 * Check whether Langfuse + OpenRouter integration is active.
 * Useful for displaying status in admin/settings.
 */
export function getProviderInfo(): {
  provider: "openrouter" | "anthropic";
  langfuseEnabled: boolean;
} {
  return {
    provider: process.env.OPENROUTER_API_KEY ? "openrouter" : "anthropic",
    langfuseEnabled: !!(
      process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY
    ),
  };
}
