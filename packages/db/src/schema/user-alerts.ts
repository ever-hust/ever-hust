import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const userAlerts = pgTable(
  "user_alerts",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    frequency: text("frequency", {
      enum: ["daily", "twice_daily", "weekly"],
    }).notNull(),

    email: text("email").notNull(),

    criteria: jsonb("criteria").$type<{
      keywords?: string[];
      locations?: string[];
      remoteType?: string;
      salary?: { min?: number; max?: number };
      skills?: string[];
      roleLevel?: string[];
      industries?: string[];
    }>(),

    isActive: boolean("is_active").notNull().default(true),
    lastSentAt: timestamp("last_sent_at"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("user_alerts_user_id_idx").on(table.userId),
    index("user_alerts_active_idx").on(table.userId, table.isActive),
    index("user_alerts_frequency_active_idx").on(table.frequency, table.isActive),
  ]
);
