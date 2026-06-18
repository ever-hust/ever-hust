import { createOpenAI } from "@ai-sdk/openai";
import type { AIProviderPlugin } from "@ever-hust/plugin";
import { MODEL_CATALOG, PROVIDER_META } from "@ever-hust/plugin";

/** OpenAI (GPT) provider plugin — direct BYOK access. */
export const openaiPlugin: AIProviderPlugin = {
  kind: "ai-provider",
  id: "openai",
  label: "OpenAI",
  meta: PROVIDER_META.openai,
  models: MODEL_CATALOG.filter((m) => m.provider === "openai"),
  createModel(apiKey: string, modelId: string) {
    return createOpenAI({ apiKey })(modelId);
  },
};

export default openaiPlugin;
