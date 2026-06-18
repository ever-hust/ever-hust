import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { AIProviderPlugin } from "@ever-hust/plugin";
import { MODEL_CATALOG, PROVIDER_META } from "@ever-hust/plugin";

/** Google (Gemini) provider plugin — direct BYOK access. */
export const googlePlugin: AIProviderPlugin = {
  kind: "ai-provider",
  id: "google",
  label: "Google AI",
  meta: PROVIDER_META.google,
  models: MODEL_CATALOG.filter((m) => m.provider === "google"),
  createModel(apiKey: string, modelId: string) {
    return createGoogleGenerativeAI({ apiKey })(modelId);
  },
};

export default googlePlugin;
