import type { UserPreferences, AlertCriteria } from "@/lib/api-schemas";

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

export const AI_MODELS = [
  {
    id: "claude-haiku-4-5-20251001",
    name: "Claude Haiku 4.5",
    desc: "Fast, efficient. Great for basic queries.",
    free: true,
  },
  {
    id: "claude-opus-4-6",
    name: "Claude Opus 4.6",
    desc: "Most capable. Best for complex tasks.",
    free: false,
  },
] as const;
