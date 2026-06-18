import { anthropic } from "@ai-sdk/anthropic";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import {
  findModelByKey,
  DEFAULT_HUST_FREE_KEY,
  DEFAULT_HUST_PRO_KEY,
  type AIProviderPlugin,
  type ByokProviderId,
} from "@ever-hust/plugin";
import { anthropicPlugin } from "@ever-hust/plugin-anthropic";
import { openaiPlugin } from "@ever-hust/plugin-openai";
import { openrouterPlugin } from "@ever-hust/plugin-openrouter";
import { googlePlugin } from "@ever-hust/plugin-google";
import { decryptApiKey } from "./crypto";

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
  "anthropic/claude-opus-4.8": "claude-opus-4-8",
  "anthropic/claude-sonnet-4.6": "claude-sonnet-4-6",
};

/**
 * Serve a "hust" platform model. Their modelIds are OpenRouter routes
 * (e.g. "anthropic/claude-opus-4.8") billed to Hust's OpenRouter key. Falls back
 * to direct Anthropic when no platform OpenRouter key is configured.
 */
function getPlatformModel(modelId: string): LanguageModel {
  const or = getOpenRouterProvider();
  if (or) return or.chat(modelId);
  // No platform OpenRouter key → best-effort direct Anthropic.
  const mapped = ANTHROPIC_ROUTE_FALLBACK[modelId];
  if (mapped) return anthropic(mapped);
  if (modelId.startsWith("anthropic/")) {
    return anthropic(modelId.slice("anthropic/".length));
  }
  return anthropic("claude-haiku-4-5-20251001");
}

function platformModelIdForKey(key: string): string {
  return findModelByKey(key)?.modelId ?? "anthropic/claude-haiku-4.5";
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

/**
 * Resolve the LanguageModel for a user.
 *
 * - A selected **BYOK** model with a saved key → that provider plugin (user's
 *   own key/cost — works on any tier).
 * - A selected **Hust** model → platform (free tier is capped to the free Hust
 *   model; paid gets the selected one).
 * - Anything else (no selection, BYOK without a key, unknown/legacy id) →
 *   the Hust default for the tier.
 */
export function getModelForUser(user: UserForModel): LanguageModel {
  const keys = decryptKeys(user.preferences?.apiKeys);
  const isPaid =
    user.subscriptionStatus === "active" || user.subscriptionStatus === "past_due";

  const selected = user.preferences?.aiModel
    ? findModelByKey(user.preferences.aiModel)
    : undefined;

  if (selected) {
    if (selected.provider !== "hust") {
      const pid = selected.provider;
      const key = keys[pid];
      // BYOK: user's own key → use it on any tier. No key → fall through to Hust.
      if (key) return PLUGINS[pid].createModel(key, selected.modelId);
    } else {
      // Hust platform model. Free users are capped to free-tier Hust models.
      if (isPaid || selected.tier === "free") {
        return getPlatformModel(selected.modelId);
      }
    }
  }

  // Default / fallback for the tier.
  return getPlatformModel(
    platformModelIdForKey(isPaid ? DEFAULT_HUST_PRO_KEY : DEFAULT_HUST_FREE_KEY),
  );
}
