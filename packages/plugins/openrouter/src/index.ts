import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { AIProviderPlugin } from "@ever-hust/plugin";
import { MODEL_CATALOG, PROVIDER_META } from "@ever-hust/plugin";

/**
 * OpenRouter provider plugin — one BYOK key routes to many upstream models
 * (Anthropic/OpenAI/Google/…). Model ids are OpenRouter's `provider/model` form.
 */
export const openrouterPlugin: AIProviderPlugin = {
  kind: "ai-provider",
  id: "openrouter",
  label: "OpenRouter",
  meta: PROVIDER_META.openrouter,
  models: MODEL_CATALOG.filter((m) => m.provider === "openrouter"),
  createModel(apiKey: string, modelId: string) {
    return createOpenRouter({ apiKey }).chat(modelId);
  },
};

export default openrouterPlugin;
