import type { UserPreferences, AlertCriteria } from "@/lib/api-schemas";
import {
  MODEL_CATALOG,
  PROVIDER_LABELS,
  type ByokProviderId,
} from "@ever-hust/plugin";

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
  /** Provider-qualified selection key (persisted in preferences.aiModel). */
  id: string;
  name: string;
  desc: string;
  free: boolean;
  provider: string;
  providerLabel: string;
  /** Non-"hust" providers need the user's own API key to be usable. */
  byokOnly: boolean;
}

/**
 * Flat model list (kept for the org AI-config card). The user-facing model
 * picker uses the grouped, connection-aware catalog directly (see
 * ai-model-card.tsx). `id` is the catalog selection key.
 */
export const AI_MODELS: AIModelOption[] = MODEL_CATALOG.map((m) => ({
  id: m.key,
  name: m.name,
  desc: m.desc,
  free: m.tier === "free",
  provider: m.provider,
  providerLabel: PROVIDER_LABELS[m.provider],
  byokOnly: m.provider !== "hust",
}));

export type { ByokProviderId };
