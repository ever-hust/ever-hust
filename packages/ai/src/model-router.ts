import { anthropic } from "@ai-sdk/anthropic";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import {
  findModelByKey,
  DEFAULT_HUST_FREE_KEY,
  DEFAULT_HUST_PRO_KEY,
  type AIProviderPlugin,
  type ByokProviderId,
  type CatalogModel,
} from "@ever-hust/plugin";
import { anthropicPlugin } from "@ever-hust/plugin-anthropic";
import { openaiPlugin } from "@ever-hust/plugin-openai";
import { openrouterPlugin } from "@ever-hust/plugin-openrouter";
import { googlePlugin } from "@ever-hust/plugin-google";
import { decryptApiKey } from "./crypto";
import {
  FREE_FALLBACK_MODEL_ID,
  FREE_FALLBACK_PROVIDER_ROUTING,
  withFreeModelFallback,
  type FallbackState,
} from "./credit-fallback";

/**
 * BYOK provider plugin registry. Adding a provider = drop a package under
 * packages/plugins and register it here (workspace knowledge: "Pluggable
 * features = plugins").
 */
const PLUGINS: Record<ByokProviderId, AIProviderPlugin> = {
  anthropic: anthropicPlugin,
  openai: openaiPlugin,
  openrouter: openrouterPlugin,
  google: googlePlugin,
};

interface UserForModel {
  subscriptionStatus: string;
  preferences?: {
    aiModel?: string;
    apiKeys?: Partial<Record<ByokProviderId, string>>;
  } | null;
}

// ── Platform (Hust) provider: served via Hust's own OpenRouter key ───────────
let openRouterProvider: ReturnType<typeof createOpenRouter> | null = null;

function getOpenRouterProvider(): ReturnType<typeof createOpenRouter> | null {
  if (openRouterProvider) return openRouterProvider;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  openRouterProvider = createOpenRouter({ apiKey });
  return openRouterProvider;
}

/**
 * Map platform OpenRouter routes → real Anthropic model ids, used only on the
 * degraded fallback path when no platform OpenRouter key is configured (the
 * route slugs like "claude-opus-4.8" are not valid direct-Anthropic ids).
 */
const ANTHROPIC_ROUTE_FALLBACK: Record<string, string> = {
  "anthropic/claude-haiku-4.5": "claude-haiku-4-5-20251001",
  "anthropic/claude-opus-5.5": "claude-opus-5-5",
  "anthropic/claude-sonnet-5.5": "claude-sonnet-5-5",
};

/**
 * Serve a "hust" platform model. Their modelIds are OpenRouter routes
 * (e.g. "anthropic/claude-opus-5.5") billed to Hust's OpenRouter key. If that
 * account runs out of credits the call is retried on free OpenRouter models
 * (see credit-fallback.ts). Falls back to direct Anthropic when no platform
 * OpenRouter key is configured.
 */
function getPlatformModel(modelId: string, fallbackState?: FallbackState): LanguageModel {
  const or = getOpenRouterProvider();
  if (or) {
    return withFreeModelFallback(
      or.chat(modelId),
      or.chat(FREE_FALLBACK_MODEL_ID, { provider: FREE_FALLBACK_PROVIDER_ROUTING }),
      fallbackState,
    );
  }
  // No platform OpenRouter key → best-effort direct Anthropic.
  const mapped = ANTHROPIC_ROUTE_FALLBACK[modelId];
  if (mapped) return anthropic(mapped);
  if (modelId.startsWith("anthropic/")) {
    return anthropic(modelId.slice("anthropic/".length));
  }
  // Non-Anthropic Hust routes need the platform OpenRouter key. Every deployed
  // env has it (startup checks warn when it is missing); say so rather than
  // swapping models silently on a key-less dev setup.
  if (!warnedNoRouteFor.has(modelId)) {
    warnedNoRouteFor.add(modelId);
    console.warn(
      `[ai] OPENROUTER_API_KEY is not set: "${modelId}" cannot run without it — answering with Claude Haiku 4.5 instead.`,
    );
  }
  return anthropic("claude-haiku-4-5-20251001");
}

const warnedNoRouteFor = new Set<string>();

export interface ModelForUserOptions {
  /** Set to `usedFallback: true` when a free model answered for want of platform credits. */
  fallbackState?: FallbackState;
}

/**
 * Decrypt the user's BYOK keys per provider. Skips empty values and keys that
 * fail to decrypt (e.g. BYOK_ENCRYPTION_KEY missing) so ciphertext is never sent
 * as an API key.
 */
function decryptKeys(
  apiKeys: Partial<Record<ByokProviderId, string>> | undefined,
): Partial<Record<ByokProviderId, string>> {
  const out: Partial<Record<ByokProviderId, string>> = {};
  if (!apiKeys) return out;
  for (const [pid, raw] of Object.entries(apiKeys) as [ByokProviderId, string | undefined][]) {
    if (!raw || !raw.trim()) continue;
    const decrypted = decryptApiKey(raw);
    if (decrypted === null && raw.includes(":")) continue; // looks encrypted but failed → skip
    const key = (decrypted ?? raw).trim();
    if (key) out[pid] = key;
  }
  return out;
}

/** The catalog model a user is served, plus their key when it is a BYOK model. */
interface ServedModel {
  model: CatalogModel;
  /** The user's decrypted key — set only when the model runs on it (BYOK). */
  byokKey?: string;
}

/**
 * Pick the catalog model a user is served. Every caller goes through here so
 * the model that runs and the model billed can never disagree.
 *
 * - A selected **BYOK** model with a saved key → that model on the user's own
 *   key (works on any tier).
 * - A selected **Hust** model → that model (free tier is capped to free-tier
 *   Hust models; paid gets the selected one).
 * - Anything else (no selection, BYOK without a key, a Hust pro model on the
 *   free tier, unknown/legacy id) → the Hust default for the tier.
 */
function pickServedModel(user: UserForModel): ServedModel {
  const keys = decryptKeys(user.preferences?.apiKeys);
  const isPaid =
    user.subscriptionStatus === "active" || user.subscriptionStatus === "past_due";

  const selected = user.preferences?.aiModel
    ? findModelByKey(user.preferences.aiModel)
    : undefined;

  if (selected) {
    if (selected.provider !== "hust") {
      // BYOK: user's own key → use it on any tier. No key → fall through to Hust.
      const key = keys[selected.provider];
      if (key) return { model: selected, byokKey: key };
    } else if (isPaid || selected.tier === "free") {
      // Hust platform model. Free users are capped to free-tier Hust models.
      return { model: selected };
    }
  }

  // Default / fallback for the tier.
  const defaultModel = findModelByKey(isPaid ? DEFAULT_HUST_PRO_KEY : DEFAULT_HUST_FREE_KEY);
  if (!defaultModel) throw new Error("[ai] The Hust default model is missing from the catalog");
  return { model: defaultModel };
}

export interface ModelSelection {
  /** Catalog key of the model actually served (what credits are priced on). */
  modelKey: string;
  /** True when the call runs on the user's own key, so it is not metered. */
  isByok: boolean;
}

/**
 * The model a user is actually served — the same choice getModelForUser makes —
 * for credit metering. Bill this `modelKey`, never the saved `aiModel` string:
 * a free user's pro pick, a BYOK pick with no key and an unknown id all serve
 * the tier default.
 */
export function resolveModelSelection(user: UserForModel): ModelSelection {
  const { model, byokKey } = pickServedModel(user);
  return { modelKey: model.key, isByok: byokKey !== undefined };
}

function buildModel({ model, byokKey }: ServedModel, fallbackState?: FallbackState): LanguageModel {
  if (byokKey !== undefined && model.provider !== "hust") {
    return PLUGINS[model.provider].createModel(byokKey, model.modelId);
  }
  return getPlatformModel(model.modelId, fallbackState);
}

/** Resolve the LanguageModel for a user (see pickServedModel for the rules). */
export function getModelForUser(
  user: UserForModel,
  { fallbackState }: ModelForUserOptions = {},
): LanguageModel {
  return buildModel(pickServedModel(user), fallbackState);
}

/**
 * getModelForUser and resolveModelSelection from one pick. Use this when a
 * caller needs both (the chat route): each key decrypt runs PBKDF2, so the
 * keys are decrypted once instead of twice.
 */
export function getModelWithSelection(
  user: UserForModel,
  { fallbackState }: ModelForUserOptions = {},
): ModelSelection & { model: LanguageModel } {
  const served = pickServedModel(user);
  return {
    model: buildModel(served, fallbackState),
    modelKey: served.model.key,
    isByok: served.byokKey !== undefined,
  };
}
