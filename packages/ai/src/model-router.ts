import { anthropic } from "@ai-sdk/anthropic";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import {
  MODEL_CATALOG,
  PROVIDER_IDS,
  providerForModel,
  type AIProviderPlugin,
  type ProviderId,
} from "@ever-hust/plugin";
import { anthropicPlugin } from "@ever-hust/plugin-anthropic";
import { openaiPlugin } from "@ever-hust/plugin-openai";
import { openrouterPlugin } from "@ever-hust/plugin-openrouter";
import { googlePlugin } from "@ever-hust/plugin-google";
import { decryptApiKey } from "./crypto";

/**
 * Provider plugin registry. Each entry knows how to build a LanguageModel from a
 * decrypted BYOK key. Adding a provider = drop a package under packages/plugins
 * and register it here (see workspace knowledge: "Pluggable features = plugins").
 */
const PLUGINS: Record<ProviderId, AIProviderPlugin> = {
  anthropic: anthropicPlugin,
  openai: openaiPlugin,
  openrouter: openrouterPlugin,
  google: googlePlugin,
};

// Allowlist of selectable models — derived from the shared catalog so the
// Settings picker, the catalog, and the router can never drift apart.
const ALLOWED_MODELS = new Set(MODEL_CATALOG.map((m) => m.id));

interface UserForModel {
  subscriptionStatus: string;
  preferences?: {
    aiModel?: string;
    apiKeys?: Partial<Record<ProviderId, string>>;
  } | null;
}

/** Map of Anthropic model IDs to their OpenRouter equivalents (platform path). */
const ANTHROPIC_TO_OPENROUTER: Record<string, string> = {
  "claude-opus-4-8": "anthropic/claude-opus-4",
  "claude-opus-4-6": "anthropic/claude-opus-4",
  "claude-sonnet-4-6": "anthropic/claude-sonnet-4",
  "claude-sonnet-4-20250514": "anthropic/claude-sonnet-4",
  "claude-sonnet-4-5-20250929": "anthropic/claude-sonnet-4-5",
  "claude-haiku-4-5-20251001": "anthropic/claude-3.5-haiku",
  "claude-3-5-sonnet-20241022": "anthropic/claude-3.5-sonnet",
};

// Singleton OpenRouter provider for the PLATFORM key (not BYOK).
let openRouterProvider: ReturnType<typeof createOpenRouter> | null = null;

function getOpenRouterProvider(): ReturnType<typeof createOpenRouter> | null {
  if (openRouterProvider) return openRouterProvider;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  openRouterProvider = createOpenRouter({ apiKey });
  return openRouterProvider;
}

/**
 * Platform model (no BYOK): OpenRouter when configured (300+ models, Langfuse
 * cost tracking), else direct Anthropic. Anthropic catalog ids are translated to
 * OpenRouter ids; OpenRouter-native ids pass through.
 */
function getPlatformModel(modelId: string): LanguageModel {
  const or = getOpenRouterProvider();
  if (or) {
    const orModelId = ANTHROPIC_TO_OPENROUTER[modelId] ?? modelId;
    return or.chat(orModelId);
  }
  return anthropic(modelId);
}

/** Free-tier default (fast, cheap Anthropic via platform). */
const FREE_MODEL_ID = "claude-haiku-4-5-20251001";

/** Paid-tier platform default. */
const PAID_MODEL_ID = process.env.DEFAULT_AI_MODEL ?? "claude-sonnet-4-6";
const PAID_FALLBACK_ID = ALLOWED_MODELS.has(PAID_MODEL_ID)
  ? PAID_MODEL_ID
  : "claude-sonnet-4-6";

if (process.env.DEFAULT_AI_MODEL && !ALLOWED_MODELS.has(process.env.DEFAULT_AI_MODEL)) {
  console.warn(
    `[model-router] DEFAULT_AI_MODEL="${process.env.DEFAULT_AI_MODEL}" is not in the model catalog; falling back to "${PAID_FALLBACK_ID}".`,
  );
}

/** Models the platform (no BYOK) can actually serve via OpenRouter/Anthropic. */
function platformCanServe(modelId: string): boolean {
  const prov = providerForModel(modelId);
  return prov === "anthropic" || prov === "openrouter";
}

/**
 * Decrypt the user's stored BYOK keys per provider. Skips empty values and keys
 * that fail to decrypt (e.g. BYOK_ENCRYPTION_KEY missing) so we never send
 * ciphertext as an API key.
 */
function decryptKeys(
  apiKeys: Partial<Record<ProviderId, string>> | undefined,
): Partial<Record<ProviderId, string>> {
  const out: Partial<Record<ProviderId, string>> = {};
  if (!apiKeys) return out;
  for (const pid of PROVIDER_IDS) {
    const raw = apiKeys[pid];
    if (!raw || !raw.trim()) continue;
    const decrypted = decryptApiKey(raw);
    // looks encrypted but failed → skip (don't leak ciphertext as a key)
    if (decrypted === null && raw.includes(":")) continue;
    const key = (decrypted ?? raw).trim();
    if (key) out[pid] = key;
  }
  return out;
}

/**
 * Resolve a BYOK model from the user's keys + selected model:
 *  1. selected model's provider has a key → that provider plugin.
 *  2. otherwise the first provider (display order) with a key → its first model.
 * Returns null when the user has no usable BYOK key.
 */
function resolveByokModel(
  aiModel: string | undefined,
  keys: Partial<Record<ProviderId, string>>,
): LanguageModel | null {
  const selProvider = aiModel ? providerForModel(aiModel) : undefined;
  if (aiModel && selProvider && keys[selProvider]) {
    return PLUGINS[selProvider].createModel(keys[selProvider]!, aiModel);
  }
  for (const pid of PROVIDER_IDS) {
    const key = keys[pid];
    if (!key) continue;
    const defaultModel = PLUGINS[pid].models[0]?.id;
    if (defaultModel) return PLUGINS[pid].createModel(key, defaultModel);
  }
  return null;
}

/**
 * Resolve the correct LanguageModel for a given user.
 *
 * Priority: BYOK (any of the 4 providers) → free-tier model → paid preference
 * (platform-servable) → platform default. Langfuse tracing is wired at the
 * Next.js instrumentation layer; this only picks the model.
 */
export function getModelForUser(user: UserForModel): LanguageModel {
  // 1. BYOK across providers (OpenRouter / Anthropic / OpenAI / Google).
  const keys = decryptKeys(user.preferences?.apiKeys);
  const byok = resolveByokModel(user.preferences?.aiModel, keys);
  if (byok) return byok;

  const isPaid =
    user.subscriptionStatus === "active" || user.subscriptionStatus === "past_due";

  // 2. Free tier always gets the free model (no preference override).
  if (!isPaid) return getPlatformModel(FREE_MODEL_ID);

  // 3. Paid preference — only if the platform can serve it without a BYOK key
  //    (OpenAI/Google models require the user's own key, handled in step 1).
  const sel = user.preferences?.aiModel;
  if (sel && ALLOWED_MODELS.has(sel) && platformCanServe(sel)) {
    return getPlatformModel(sel);
  }

  // 4. Platform default.
  return getPlatformModel(PAID_FALLBACK_ID);
}
