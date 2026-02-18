import {
  pgTable,
  text,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const referrals = pgTable(
  "referrals",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    referrerId: text("referrer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    referredUserId: text("referred_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    referralCode: text("referral_code").notNull(),
    referredEmail: text("referred_email"),
    status: text("status", {
      enum: ["pending", "signed_up", "credited"],
    })
      .notNull()
      .default("pending"),
    creditAmount: integer("credit_amount").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("referrals_referrer_id_idx").on(table.referrerId),
    index("referrals_referral_code_idx").on(table.referralCode),
    index("referrals_referred_user_id_idx").on(table.referredUserId),
  ]
);

export const referralCredits = pgTable(
  "referral_credits",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
      .unique(),
    balance: integer("balance").notNull().default(0),
    totalEarned: integer("total_earned").notNull().default(0),
    totalSpent: integer("total_spent").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("referral_credits_user_id_idx").on(table.userId)]
);
