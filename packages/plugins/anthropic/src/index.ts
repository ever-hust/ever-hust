import { createAnthropic } from "@ai-sdk/anthropic";
import type { AIProviderPlugin } from "@ever-hust/plugin";
import { PROVIDER_LABELS } from "@ever-hust/plugin";

/** Anthropic (Claude) provider plugin — direct BYOK access. */
export const anthropicPlugin: AIProviderPlugin = {
  kind: "ai-provider",
  id: "anthropic",
  label: PROVIDER_LABELS.anthropic,
  createModel(apiKey: string, modelId: string) {
    return createAnthropic({ apiKey })(modelId);
  },
};

export default anthropicPlugin;
