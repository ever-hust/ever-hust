/**
 * @ever-hust/plugin — the base plugin contract for the Hust platform.
 *
 * Hust features meant to be swappable/extensible are modelled as "plugins" (see
 * workspace knowledge: "Pluggable features = plugins"). The first family is AI
 * providers. This module is runtime-dependency-free (only a type-only import
 * from `ai`) so client components (Settings) can import the catalog + provider
 * metadata without pulling any provider SDK into the browser bundle.
 *
 * Model selection model:
 *  - **"hust"** is the default provider — Hust's platform AI (served via Hust's
 *    own OpenRouter key). A small curated set of the best models; no BYOK needed
 *    (the user pays Hust / hits plan limits).
 *  - The **BYOK** providers (openrouter / anthropic / openai / google) only
 *    surface their models once the user saves their own key for that provider.
 *  - Each catalog entry has a provider-qualified `key` (what we persist in
 *    `preferences.aiModel`) so two providers can expose the same underlying
 *    `modelId` without ambiguity.
 */
import type { LanguageModel } from "ai";

/** Generic base every Hust plugin satisfies. */
export interface Plugin {
  id: string;
  kind: string;
  label: string;
}

/** All providers (incl. the virtual "hust" platform provider). */
export type ProviderId = "hust" | "openrouter" | "anthropic" | "openai" | "google";
/** Providers the user can bring their own key for. */
export type ByokProviderId = Exclude<ProviderId, "hust">;

export const BYOK_PROVIDER_IDS: ByokProviderId[] = [
  "openrouter",
  "anthropic",
  "openai",
  "google",
];

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  hust: "Hust",
  openrouter: "OpenRouter",
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google AI",
};

export type ModelTier = "free" | "pro";

/** BYOK key-input metadata (pure data — client-safe). */
export interface ByokProviderMeta {
  id: ByokProviderId;
  label: string;
  keyPlaceholder: string;
  keyHint: string;
  getKeyUrl: string;
}

/** Order = the order shown in the API-keys provider picker. */
export const BYOK_PROVIDER_META: Record<ByokProviderId, ByokProviderMeta> = {
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    keyPlaceholder: "sk-or-v1-...",
    keyHint: "One key, many models — your own OpenRouter account.",
    getKeyUrl: "https://openrouter.ai/keys",
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    keyPlaceholder: "sk-ant-api03-...",
    keyHint: "Direct access to Claude models.",
    getKeyUrl: "https://console.anthropic.com/settings/keys",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    keyPlaceholder: "sk-proj-...",
    keyHint: "Direct access to GPT models.",
    getKeyUrl: "https://platform.openai.com/api-keys",
  },
  google: {
    id: "google",
    label: "Google AI",
    keyPlaceholder: "AIzaSy...",
    keyHint: "Direct access to Gemini models.",
    getKeyUrl: "https://aistudio.google.com/app/apikey",
  },
};

/** A selectable model. `key` is persisted; `modelId` is passed to the SDK. */
export interface CatalogModel {
  /** Stable, provider-qualified selection key (stored in preferences.aiModel). */
  key: string;
  provider: ProviderId;
  /** Native model id passed to the provider SDK / platform. */
  modelId: string;
  name: string;
  desc: string;
  tier: ModelTier;
}

function m(
  provider: ProviderId,
  modelId: string,
  name: string,
  desc: string,
  tier: ModelTier,
): CatalogModel {
  return { key: `${provider}:${modelId}`, provider, modelId, name, desc, tier };
}

/**
 * The model catalog. "hust" models are served via Hust's platform OpenRouter key
 * (their `modelId` is an OpenRouter route); BYOK models use the user's key.
 * Curated to the current best models per provider — no legacy/low-end ids.
 */
export const MODEL_CATALOG: CatalogModel[] = [
  // ── Hust (default platform provider — no BYOK needed) ──────────────────────
  // Names always state the real underlying model. Routes are OpenRouter slugs
  // verified against the live catalog.
  m("hust", "anthropic/claude-sonnet-4.6", "Hust · Claude Sonnet 4.6", "Balanced speed and reasoning — recommended default.", "free"),
  m("hust", "anthropic/claude-haiku-4.5", "Hust · Claude Haiku 4.5", "Fastest, lightweight everyday answers.", "free"),
  m("hust", "anthropic/claude-opus-4.8", "Hust · Claude Opus 4.8", "Anthropic's most capable — deep reasoning.", "pro"),
  m("hust", "openai/gpt-5.5", "Hust · GPT-5.5", "OpenAI's flagship.", "pro"),
  m("hust", "google/gemini-3.1-pro-preview", "Hust · Gemini 3.1 Pro", "Google's flagship — huge context.", "pro"),

  // ── Anthropic (BYOK) ───────────────────────────────────────────────────────
  m("anthropic", "claude-opus-4-8", "Claude Opus 4.8", "Anthropic's most capable model.", "pro"),
  m("anthropic", "claude-sonnet-4-6", "Claude Sonnet 4.6", "Balanced speed and capability.", "pro"),

  // ── OpenAI (BYOK) ──────────────────────────────────────────────────────────
  m("openai", "gpt-5.5", "GPT-5.5", "OpenAI's flagship model.", "pro"),
  m("openai", "gpt-5.5-pro", "GPT-5.5 Pro", "OpenAI's top-tier reasoning model.", "pro"),

  // ── Google (BYOK) ──────────────────────────────────────────────────────────
  m("google", "gemini-3.1-pro-preview", "Gemini 3.1 Pro", "Google's flagship reasoning model.", "pro"),
  m("google", "gemini-3.5-flash", "Gemini 3.5 Flash", "Google's fast, newest model.", "pro"),

  // ── OpenRouter (BYOK — your own OpenRouter key, many models) ────────────────
  m("openrouter", "anthropic/claude-opus-4.8", "Claude Opus 4.8 (OpenRouter)", "Via your OpenRouter key.", "pro"),
  m("openrouter", "openai/gpt-5.5", "GPT-5.5 (OpenRouter)", "Via your OpenRouter key.", "pro"),
  m("openrouter", "google/gemini-3.1-pro-preview", "Gemini 3.1 Pro (OpenRouter)", "Via your OpenRouter key.", "pro"),
];

export function findModelByKey(key: string): CatalogModel | undefined {
  return MODEL_CATALOG.find((x) => x.key === key);
}

export function modelsByProvider(provider: ProviderId): CatalogModel[] {
  return MODEL_CATALOG.filter((x) => x.provider === provider);
}

/** Default model key for a tier (used when the user hasn't picked one). */
export const DEFAULT_HUST_FREE_KEY = "hust:anthropic/claude-sonnet-4.6";
export const DEFAULT_HUST_PRO_KEY = "hust:anthropic/claude-opus-4.8";

/**
 * Runtime contract for a BYOK provider plugin (server-only; the implementation
 * imports the provider's `@ai-sdk/*` package).
 */
export interface AIProviderPlugin extends Plugin {
  kind: "ai-provider";
  id: ByokProviderId;
  createModel(apiKey: string, modelId: string): LanguageModel;
}
