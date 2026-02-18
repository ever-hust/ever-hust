import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const brandingConfigs = pgTable(
  "branding_configs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    organizationId: integer("organization_id"),
    name: text("name").notNull(),
    logoUrl: text("logo_url"),
    faviconUrl: text("favicon_url"),
    primaryColor: text("primary_color"),
    accentColor: text("accent_color"),
    tagline: text("tagline"),
    customFooterHtml: text("custom_footer_html"),
    hideEverJobsBranding: boolean("hide_ever_jobs_branding")
      .notNull()
      .default(false),
    customDomain: text("custom_domain"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("branding_configs_org_id_idx").on(table.organizationId),
    uniqueIndex("branding_configs_custom_domain_idx").on(table.customDomain),
  ]
);
