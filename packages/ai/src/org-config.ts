import { db } from "@ever-hust/db";
import { organizationAiConfigs } from "@ever-hust/db/schema";
import { BYOK_PROVIDER_IDS, type ByokProviderId } from "@ever-hust/plugin";
import { eq } from "drizzle-orm";

/** BYOK API keys keyed by provider (openrouter, anthropic, openai, google). */
type ByokApiKeys = Partial<Record<ByokProviderId, string>>;

/**
 * Organization AI configuration as stored in the database.
 */
export interface OrgAiConfigRow {
  id: number;
  organizationId: number;
  preferredModel: string | null;
  customSystemPrompt: string | null;
  maxTokens: number | null;
  temperature: number | null;
  apiKeys: ByokApiKeys | null;
  enabledTools: string[] | null;
  isActive: boolean;
}

/**
 * Fetch the AI configuration for an organization.
 * Returns null if no config exists or the config is inactive.
 */
export async function getOrgAiConfig(
  organizationId: number,
): Promise<OrgAiConfigRow | null> {
  const [config] = await db
    .select()
    .from(organizationAiConfigs)
    .where(eq(organizationAiConfigs.organizationId, organizationId))
    .limit(1);

  if (!config || !config.isActive) {
    return null;
  }

  return config as OrgAiConfigRow;
}

/**
 * User-level AI preferences (subset of the user preferences object).
 */
interface UserAiConfig {
  aiModel?: string;
  apiKeys?: ByokApiKeys;
}

/**
 * Merged configuration result.
 *
 * Priority rules:
 * - `preferredModel`: org config wins over user preference
 * - `customSystemPrompt`: org config only (user has no equivalent)
 * - `enabledTools`: org config only (user has no equivalent)
 * - `apiKeys`: user BYOK keys override org keys (user keys take priority)
 * - `maxTokens` / `temperature`: org config only
 */
export interface MergedAiConfig {
  preferredModel?: string;
  customSystemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  enabledTools?: string[];
  apiKeys?: ByokApiKeys;
}

/**
 * Merge organization-level AI config with user-level preferences.
 *
 * Org config takes priority for: preferredModel, customSystemPrompt, enabledTools.
 * User BYOK keys override org-level keys.
 */
export function mergeOrgConfig(
  userConfig: UserAiConfig | null | undefined,
  orgConfig: OrgAiConfigRow | null | undefined,
): MergedAiConfig {
  if (!orgConfig && !userConfig) {
    return {};
  }

  // Start with org-level values
  const merged: MergedAiConfig = {};

  // preferredModel: org wins
  if (orgConfig?.preferredModel) {
    merged.preferredModel = orgConfig.preferredModel;
  } else if (userConfig?.aiModel) {
    merged.preferredModel = userConfig.aiModel;
  }

  // customSystemPrompt: org only
  if (orgConfig?.customSystemPrompt) {
    merged.customSystemPrompt = orgConfig.customSystemPrompt;
  }

  // maxTokens: org only
  if (orgConfig?.maxTokens != null) {
    merged.maxTokens = orgConfig.maxTokens;
  }

  // temperature: org only
  if (orgConfig?.temperature != null) {
    merged.temperature = orgConfig.temperature;
  }

  // enabledTools: org only
  if (orgConfig?.enabledTools) {
    merged.enabledTools = orgConfig.enabledTools;
  }

  // apiKeys: user BYOK keys override org keys
  const orgKeys = orgConfig?.apiKeys;
  const userKeys = userConfig?.apiKeys;

  if (orgKeys || userKeys) {
    // Merge every BYOK provider, not a fixed list: a member's OpenRouter key
    // must survive an org config, or their chat runs on the Hust default.
    // Empty values are left out.
    const keys: ByokApiKeys = {};
    for (const provider of BYOK_PROVIDER_IDS) {
      const key = userKeys?.[provider] || orgKeys?.[provider];
      if (key) keys[provider] = key;
    }

    // Leave apiKeys unset when no provider has a key
    if (Object.keys(keys).length > 0) {
      merged.apiKeys = keys;
    }
  }

  return merged;
}
