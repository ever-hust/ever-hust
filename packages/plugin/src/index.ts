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
  // verified against the live catalog (all support tool calling, which chat
  // needs). Free-tier entries cost no more per token than Haiku.
  m("hust", "anthropic/claude-sonnet-5.5", "Hust · Claude Sonnet 5.5", "Balanced speed and reasoning — recommended default.", "free"),
  m("hust", "anthropic/claude-haiku-4.5", "Hust · Claude Haiku 4.5", "Fast, lightweight everyday answers.", "free"),
  m("hust", "google/gemini-3.8-flash", "Hust · Gemini 3.8 Flash", "Google's fast model — huge context.", "free"),
  m("hust", "openai/gpt-6-luna", "Hust · GPT-6 Luna", "OpenAI's fast, low-cost GPT-6 model.", "free"),
  m("hust", "deepseek/deepseek-v4.1-flash", "Hust · DeepSeek V4.1 Flash", "Fast open-weight model.", "free"),
  m("hust", "anthropic/claude-opus-5.5", "Hust · Claude Opus 5.5", "Anthropic's flagship — deep reasoning.", "pro"),
  m("hust", "openai/gpt-6.1-sol", "Hust · GPT-6.1 Sol", "OpenAI's high-end GPT-6 model.", "pro"),
  m("hust", "google/gemini-3.1-pro-preview", "Hust · Gemini 3.1 Pro", "Google's flagship — huge context.", "pro"),
  m("hust", "x-ai/grok-4.7", "Hust · Grok 4.7", "Grok's flagship model.", "pro"),

  // ── Anthropic (BYOK) ───────────────────────────────────────────────────────
  m("anthropic", "claude-fable-5-1", "Claude Fable 5.1", "Anthropic's most capable model.", "pro"),
  m("anthropic", "claude-opus-5-5", "Claude Opus 5.5", "Flagship for demanding reasoning.", "pro"),
  m("anthropic", "claude-sonnet-5-5", "Claude Sonnet 5.5", "Balanced speed and capability.", "pro"),
  m("anthropic", "claude-haiku-4-5-20251001", "Claude Haiku 4.5", "Fastest Claude model.", "pro"),

  // ── OpenAI (BYOK) ──────────────────────────────────────────────────────────
  m("openai", "gpt-6-astra", "GPT-6 Astra", "OpenAI's flagship model.", "pro"),
  m("openai", "gpt-6.1-sol", "GPT-6.1 Sol", "High-end, cost-efficient GPT-6 model.", "pro"),
  m("openai", "gpt-6-luna", "GPT-6 Luna", "Fast, low-cost GPT-6 model.", "pro"),

  // ── Google (BYOK) ──────────────────────────────────────────────────────────
  m("google", "gemini-3.1-pro-preview", "Gemini 3.1 Pro", "Google's flagship reasoning model.", "pro"),
  m("google", "gemini-3.8-flash", "Gemini 3.8 Flash", "Google's fast, newest model.", "pro"),

  // ── OpenRouter (BYOK — your own OpenRouter key, many models) ────────────────
  m("openrouter", "anthropic/claude-opus-5.5", "Claude Opus 5.5 (OpenRouter)", "Via your OpenRouter key.", "pro"),
  m("openrouter", "anthropic/claude-sonnet-5.5", "Claude Sonnet 5.5 (OpenRouter)", "Via your OpenRouter key.", "pro"),
  m("openrouter", "openai/gpt-6-astra", "GPT-6 Astra (OpenRouter)", "Via your OpenRouter key.", "pro"),
  m("openrouter", "openai/gpt-6.1-sol", "GPT-6.1 Sol (OpenRouter)", "Via your OpenRouter key.", "pro"),
  m("openrouter", "google/gemini-3.1-pro-preview", "Gemini 3.1 Pro (OpenRouter)", "Via your OpenRouter key.", "pro"),
  m("openrouter", "google/gemini-3.8-flash", "Gemini 3.8 Flash (OpenRouter)", "Via your OpenRouter key.", "pro"),
  m("openrouter", "x-ai/grok-4.7", "Grok 4.7 (OpenRouter)", "Via your OpenRouter key.", "pro"),
  m("openrouter", "deepseek/deepseek-v4.1-flash", "DeepSeek V4.1 Flash (OpenRouter)", "Via your OpenRouter key.", "pro"),
  m("openrouter", "qwen/qwen3.8-max-0902", "Qwen3.8 Max (OpenRouter)", "Via your OpenRouter key.", "pro"),
  m("openrouter", "moonshotai/kimi-k3", "Kimi K3 (OpenRouter)", "Via your OpenRouter key.", "pro"),
  m("openrouter", "z-ai/glm-5.3", "GLM 5.3 (OpenRouter)", "Via your OpenRouter key.", "pro"),
];

/**
 * Keys users may still have saved in `preferences.aiModel` for models that
 * were replaced in the catalog → the successor they now get.
 */
const LEGACY_MODEL_KEYS: Record<string, string> = {
  "hust:anthropic/claude-sonnet-4.6": "hust:anthropic/claude-sonnet-5.5",
  "hust:anthropic/claude-opus-4.8": "hust:anthropic/claude-opus-5.5",
  "hust:openai/gpt-5.5": "hust:openai/gpt-6.1-sol",
  "anthropic:claude-opus-4-8": "anthropic:claude-opus-5-5",
  "anthropic:claude-sonnet-4-6": "anthropic:claude-sonnet-5-5",
  "openai:gpt-5.5": "openai:gpt-6.1-sol",
  "openai:gpt-5.5-pro": "openai:gpt-6-astra",
  "google:gemini-3.5-flash": "google:gemini-3.8-flash",
  "openrouter:anthropic/claude-opus-4.8": "openrouter:anthropic/claude-opus-5.5",
  "openrouter:openai/gpt-5.5": "openrouter:openai/gpt-6.1-sol",
};

/** The current catalog key for a saved key (follows legacy renames), or undefined. */
export function resolveModelKey(key: string | null | undefined): string | undefined {
  if (!key) return undefined;
  const current = LEGACY_MODEL_KEYS[key] ?? key;
  return MODEL_CATALOG.some((x) => x.key === current) ? current : undefined;
}

export function findModelByKey(key: string): CatalogModel | undefined {
  const current = resolveModelKey(key);
  return current ? MODEL_CATALOG.find((x) => x.key === current) : undefined;
}

export function modelsByProvider(provider: ProviderId): CatalogModel[] {
  return MODEL_CATALOG.filter((x) => x.provider === provider);
}

/** Default model key for a tier (used when the user hasn't picked one). */
export const DEFAULT_HUST_FREE_KEY = "hust:anthropic/claude-sonnet-5.5";
export const DEFAULT_HUST_PRO_KEY = "hust:anthropic/claude-opus-5.5";

/**
 * Runtime contract for a BYOK provider plugin (server-only; the implementation
 * imports the provider's `@ai-sdk/*` package).
 */
export interface AIProviderPlugin extends Plugin {
  kind: "ai-provider";
  id: ByokProviderId;
  createModel(apiKey: string, modelId: string): LanguageModel;
}

// ── Notification providers (email / push / in-app) ───────────────────────────
// Notifications are pluggable too (workspace rule: "pluggable features =
// plugins"). Implementations live in packages/plugins/notify-* and are
// dispatched by @ever-hust/notifications.

export type NotificationChannel = "email" | "push" | "in_app" | "sms";

export interface NotificationRecipient {
  /** Stable recipient id (use the Hust user id) — required by workflow providers. */
  subscriberId: string;
  email?: string;
  name?: string;
}

export interface NotificationMessage {
  recipient: NotificationRecipient;
  /** Provider-agnostic event key (maps to a Novu workflow id). */
  event: string;
  subject?: string;
  /** Pre-rendered HTML for direct email providers (e.g. Resend). */
  html?: string;
  text?: string;
  /** Structured data for template/workflow interpolation. */
  payload?: Record<string, unknown>;
  /** Restrict to these channels; defaults to the provider's channels. */
  channels?: NotificationChannel[];
  /** Provider-specific overrides (passed through verbatim). */
  overrides?: Record<string, unknown>;
}

export interface NotificationSendResult {
  ok: boolean;
  id?: string | null;
  skipped?: boolean;
  error?: string;
}

export interface NotificationProviderPlugin extends Plugin {
  kind: "notification-provider";
  id: "resend" | "novu";
  channels: NotificationChannel[];
  /** True when the provider has the env/config it needs. */
  isConfigured(): boolean;
  send(message: NotificationMessage): Promise<NotificationSendResult>;
}
