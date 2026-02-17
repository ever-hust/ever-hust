import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),

    planType: text("plan_type", {
      enum: ["monthly", "quarterly", "annual"],
    }).notNull(),

    status: text("status", {
      enum: ["active", "past_due", "canceled", "incomplete", "trialing"],
    }).notNull(),

    currentPeriodStart: timestamp("current_period_start").notNull(),
    currentPeriodEnd: timestamp("current_period_end").notNull(),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("subscriptions_user_id_idx").on(table.userId),
  ]
);
