/**
 * @ever-hust/plugin — the base plugin contract for the Hust platform.
 *
 * Hust features that are meant to be swappable/extensible are modelled as
 * "plugins": a small, typed package under `packages/plugins/<name>` that
 * implements a contract defined here. The first family is **AI providers**
 * (Anthropic, OpenAI, OpenRouter, Google), but the same pattern is intended for
 * future pluggable surfaces (apply automation, job sources, parsers, …).
 *
 * This module is intentionally **runtime-dependency-free** (only a type-only
 * import from `ai`) so it is safe to import from client components — e.g. the
 * Settings UI consumes {@link MODEL_CATALOG} and {@link PROVIDER_META} without
 * pulling any provider SDK into the browser bundle. The actual model
 * construction lives in the per-provider plugin packages (server-only).
 */
import type { LanguageModel } from "ai";

/** Generic base every Hust plugin satisfies. */
export interface Plugin {
  /** Stable unique id within its kind. */
  id: string;
  /** Plugin family, e.g. "ai-provider". */
  kind: string;
  /** Human-readable label. */
  label: string;
}

/** The AI providers Hust can talk to (BYOK or platform). */
export type ProviderId = "anthropic" | "openai" | "openrouter" | "google";

export type ModelTier = "free" | "pro";

/** A model a provider exposes (pure metadata — safe for the client). */
export interface ProviderModelDef {
  /** Provider-native model id passed to the SDK. */
  id: string;
  /** Display name. */
  name: string;
  /** Short description. */
  desc: string;
  /** Lowest plan tier that may select this model. */
  tier: ModelTier;
}

/** BYOK / display metadata for a provider (pure data — safe for the client). */
export interface ProviderMeta {
  id: ProviderId;
  label: string;
  /** Placeholder for the API-key input. */
  keyPlaceholder: string;
  /** Short hint shown under the key input. */
  keyHint: string;
  /** Where the user gets a key. */
  getKeyUrl: string;
}

/**
 * The runtime contract a provider plugin implements (server-only — the
 * implementation imports the provider's `@ai-sdk/*` package).
 */
export interface AIProviderPlugin extends Plugin {
  kind: "ai-provider";
  id: ProviderId;
  meta: ProviderMeta;
  /** Models this provider exposes in the catalog. */
  models: ProviderModelDef[];
  /** Build a Vercel-AI-SDK `LanguageModel` from a decrypted BYOK key + model id. */
  createModel(apiKey: string, modelId: string): LanguageModel;
}

/** Provider display + BYOK metadata. Order = the order shown in Settings. */
export const PROVIDER_META: Record<ProviderId, ProviderMeta> = {
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    keyPlaceholder: "sk-or-v1-...",
    keyHint: "One key, many models. Routes to Anthropic/OpenAI/Google and more.",
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

/** Ordered provider ids (matches PROVIDER_META display order). */
export const PROVIDER_IDS: ProviderId[] = ["openrouter", "anthropic", "openai", "google"];

/**
 * The full model catalog across providers (pure metadata). The Settings model
 * picker and the router's allow-list both derive from this single source.
 * Keep model ids in sync with each provider plugin's `models`.
 */
export const MODEL_CATALOG: (ProviderModelDef & { provider: ProviderId })[] = [
  // Anthropic (Claude)
  {
    provider: "anthropic",
    id: "claude-opus-4-8",
    name: "Claude Opus 4.8",
    desc: "Anthropic's most capable model. Best for complex reasoning.",
    tier: "pro",
  },
  {
    provider: "anthropic",
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    desc: "Balanced speed and capability. Great default.",
    tier: "pro",
  },
  {
    provider: "anthropic",
    id: "claude-haiku-4-5-20251001",
    name: "Claude Haiku 4.5",
    desc: "Fast and efficient. Great for everyday queries.",
    tier: "free",
  },
  // OpenAI
  {
    provider: "openai",
    id: "gpt-4o",
    name: "GPT-4o",
    desc: "OpenAI's multimodal flagship.",
    tier: "pro",
  },
  {
    provider: "openai",
    id: "gpt-4o-mini",
    name: "GPT-4o mini",
    desc: "Fast, low-cost OpenAI model.",
    tier: "free",
  },
  // Google (Gemini)
  {
    provider: "google",
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    desc: "Google's fast multimodal model.",
    tier: "pro",
  },
  {
    provider: "google",
    id: "gemini-1.5-flash",
    name: "Gemini 1.5 Flash",
    desc: "Fast, low-cost Google model.",
    tier: "free",
  },
  // OpenRouter (one key → many models)
  {
    provider: "openrouter",
    id: "anthropic/claude-opus-4",
    name: "Claude Opus 4 (via OpenRouter)",
    desc: "Anthropic Opus routed through OpenRouter.",
    tier: "pro",
  },
  {
    provider: "openrouter",
    id: "openai/gpt-4o",
    name: "GPT-4o (via OpenRouter)",
    desc: "OpenAI GPT-4o routed through OpenRouter.",
    tier: "pro",
  },
  {
    provider: "openrouter",
    id: "google/gemini-2.0-flash-001",
    name: "Gemini 2.0 Flash (via OpenRouter)",
    desc: "Google Gemini routed through OpenRouter.",
    tier: "pro",
  },
];

/** Find a model's metadata by id. */
export function findModel(modelId: string) {
  return MODEL_CATALOG.find((m) => m.id === modelId);
}

/** Which provider owns a given model id (or undefined). */
export function providerForModel(modelId: string): ProviderId | undefined {
  return findModel(modelId)?.provider;
}
