import { anthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

// Allowlist of models users can select — prevents arbitrary model strings
const ALLOWED_MODELS = new Set([
  "claude-haiku-4-5-20251001",
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

export function getModelForUser(user: UserForModel): LanguageModel {
  // 1. BYOK: user has their own Anthropic API key
  if (user.preferences?.apiKeys?.anthropic) {
    return anthropic("claude-opus-4-6");
  }

  // 2. User preference: validate against allowlist before use
  if (
    user.preferences?.aiModel &&
    ALLOWED_MODELS.has(user.preferences.aiModel)
  ) {
    return anthropic(user.preferences.aiModel);
  }

  // 3. Tier default: free = haiku, paid = opus
  if (user.subscriptionStatus === "free") {
    return anthropic("claude-haiku-4-5-20251001");
  }

  // 4. Platform default from env var (also validated)
  const defaultModel = process.env.DEFAULT_AI_MODEL ?? "claude-opus-4-6";
  return anthropic(
    ALLOWED_MODELS.has(defaultModel) ? defaultModel : "claude-opus-4-6"
  );
}
