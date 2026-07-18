import { createOpenAI } from "@ai-sdk/openai";
import type { AIProviderPlugin } from "@ever-hust/plugin";
import { PROVIDER_LABELS } from "@ever-hust/plugin";

/** OpenAI (GPT) provider plugin — direct BYOK access. */
export const openaiPlugin: AIProviderPlugin = {
  kind: "ai-provider",
  id: "openai",
  label: PROVIDER_LABELS.openai,
  createModel(apiKey: string, modelId: string) {
    return createOpenAI({ apiKey })(modelId);
  },
};

export default openaiPlugin;
