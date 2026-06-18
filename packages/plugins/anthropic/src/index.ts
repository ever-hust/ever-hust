import { createAnthropic } from "@ai-sdk/anthropic";
import type { AIProviderPlugin } from "@ever-hust/plugin";
import { MODEL_CATALOG, PROVIDER_META } from "@ever-hust/plugin";

/** Anthropic (Claude) provider plugin — direct BYOK access. */
export const anthropicPlugin: AIProviderPlugin = {
  kind: "ai-provider",
  id: "anthropic",
  label: "Anthropic",
  meta: PROVIDER_META.anthropic,
  models: MODEL_CATALOG.filter((m) => m.provider === "anthropic"),
  createModel(apiKey: string, modelId: string) {
    return createAnthropic({ apiKey })(modelId);
  },
};

export default anthropicPlugin;
