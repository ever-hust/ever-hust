import { db } from "@repo/db";
import { organizationAiConfigs } from "@repo/db/schema";
import { eq } from "drizzle-orm";

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
  apiKeys: { anthropic?: string; openai?: string; google?: string } | null;
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
  apiKeys?: {
    anthropic?: string;
    openai?: string;
    google?: string;
  };
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
  apiKeys?: {
    anthropic?: string;
    openai?: string;
    google?: string;
  };
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
    merged.apiKeys = {
      anthropic: userKeys?.anthropic || orgKeys?.anthropic,
      openai: userKeys?.openai || orgKeys?.openai,
      google: userKeys?.google || orgKeys?.google,
    };

    // Clean up undefined values
    if (!merged.apiKeys.anthropic) delete merged.apiKeys.anthropic;
    if (!merged.apiKeys.openai) delete merged.apiKeys.openai;
    if (!merged.apiKeys.google) delete merged.apiKeys.google;

    // Remove the whole object if empty
    if (Object.keys(merged.apiKeys).length === 0) {
      delete merged.apiKeys;
    }
  }

  return merged;
}
