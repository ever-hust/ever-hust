import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { AIProviderPlugin } from "@ever-hust/plugin";
import { PROVIDER_LABELS } from "@ever-hust/plugin";

/** Google (Gemini) provider plugin — direct BYOK access. */
export const googlePlugin: AIProviderPlugin = {
  kind: "ai-provider",
  id: "google",
  label: PROVIDER_LABELS.google,
  createModel(apiKey: string, modelId: string) {
    return createGoogleGenerativeAI({ apiKey })(modelId);
  },
};

export default googlePlugin;
