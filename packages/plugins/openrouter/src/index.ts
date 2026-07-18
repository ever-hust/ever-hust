import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { AIProviderPlugin } from "@ever-hust/plugin";
import { PROVIDER_LABELS } from "@ever-hust/plugin";

/**
 * OpenRouter provider plugin — the user's own OpenRouter key routes to many
 * upstream models (model ids are OpenRouter's `provider/model` form).
 */
export const openrouterPlugin: AIProviderPlugin = {
  kind: "ai-provider",
  id: "openrouter",
  label: PROVIDER_LABELS.openrouter,
  createModel(apiKey: string, modelId: string) {
    return createOpenRouter({ apiKey }).chat(modelId);
  },
};

export default openrouterPlugin;
