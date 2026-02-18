import {
  pgTable,
  text,
  timestamp,
  integer,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const organizations = pgTable(
  "organizations",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logo: text("logo"),
    website: text("website"),
    planType: text("plan_type", {
      enum: ["free", "starter", "pro", "enterprise"],
    })
      .notNull()
      .default("free"),
    maxMembers: integer("max_members").notNull().default(5),
    createdById: text("created_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("organizations_slug_idx").on(table.slug),
    index("organizations_created_by_idx").on(table.createdById),
  ]
);

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", {
      enum: ["owner", "admin", "member"],
    })
      .notNull()
      .default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("org_members_unique").on(table.organizationId, table.userId),
    index("org_members_org_id_idx").on(table.organizationId),
    index("org_members_user_id_idx").on(table.userId),
  ]
);

export const organizationInvitations = pgTable(
  "organization_invitations",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role", {
      enum: ["admin", "member"],
    })
      .notNull()
      .default("member"),
    token: text("token").notNull().unique(),
    invitedById: text("invited_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    status: text("status", {
      enum: ["pending", "accepted", "expired", "revoked"],
    })
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("org_invitations_org_id_idx").on(table.organizationId),
    index("org_invitations_token_idx").on(table.token),
    index("org_invitations_email_idx").on(table.email),
  ]
);
