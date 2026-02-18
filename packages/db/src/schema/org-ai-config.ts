import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  real,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const organizationAiConfigs = pgTable(
  "organization_ai_configs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),

    /** Organization this config belongs to (plain text — no FK reference since orgs table is managed separately) */
    organizationId: text("organization_id").notNull(),

    /** Preferred AI model ID (e.g. "claude-sonnet-4-6", "claude-opus-4-6") */
    preferredModel: text("preferred_model"),

    /** Custom addition to the base system prompt */
    customSystemPrompt: text("custom_system_prompt"),

    /** Max tokens for AI responses (null = use platform default) */
    maxTokens: integer("max_tokens"),

    /** Temperature for AI responses (0.0 - 1.0) */
    temperature: real("temperature"),

    /** Org-level BYOK API keys: { anthropic?: string, openai?: string, google?: string } */
    apiKeys: jsonb("api_keys").$type<{
      anthropic?: string;
      openai?: string;
      google?: string;
    }>(),

    /** Array of tool names the org can use (null = all tools enabled) */
    enabledTools: jsonb("enabled_tools").$type<string[]>(),

    /** Whether this config is active */
    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("org_ai_configs_org_id_idx").on(table.organizationId),
  ]
);
