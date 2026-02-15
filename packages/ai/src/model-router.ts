import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

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
    const byokProvider = createAnthropic({
      apiKey: user.preferences.apiKeys.anthropic,
    });
    return byokProvider("claude-opus-4-6");
  }

  // 2. User preference: user selected a specific model in settings
  if (user.preferences?.aiModel) {
    return anthropic(user.preferences.aiModel);
  }

  // 3. Tier default: free = haiku, paid = opus
  if (user.subscriptionStatus === "free") {
    return anthropic("claude-haiku-4-5-20251001");
  }

  // 4. Platform default from env var
  const defaultModel = process.env.DEFAULT_AI_MODEL ?? "claude-opus-4-6";
  return anthropic(defaultModel);
}
