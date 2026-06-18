import type { UserPreferences, AlertCriteria } from "@/lib/api-schemas";
import { MODEL_CATALOG, PROVIDER_META, type ProviderId } from "@ever-hust/plugin";

export interface UserSettings {
  name: string;
  email: string;
  headline: string | null;
  location: string | null;
  subscriptionStatus: string;
  preferences: UserPreferences | null;
}

export interface Alert {
  id: number;
  frequency: string;
  email: string;
  isActive: boolean;
  criteria: AlertCriteria | null;
  createdAt: string;
}

export interface AIModelOption {
  id: string;
  name: string;
  desc: string;
  free: boolean;
  provider: ProviderId;
  providerLabel: string;
  /** Non-platform providers require the user's own API key (see API Keys card). */
  byokOnly: boolean;
}

/**
 * Selectable AI models, derived from the shared plugin catalog so Settings and
 * the model router never drift. Anthropic models run on the platform; OpenAI /
 * Google models require a BYOK key; OpenRouter routes via a BYOK OpenRouter key.
 */
export const AI_MODELS: AIModelOption[] = MODEL_CATALOG.map((m) => ({
  id: m.id,
  name: m.name,
  desc: m.desc,
  free: m.tier === "free",
  provider: m.provider,
  providerLabel: PROVIDER_META[m.provider].label,
  byokOnly: m.provider !== "anthropic",
}));
