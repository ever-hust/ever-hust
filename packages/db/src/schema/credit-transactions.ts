import {
  pgTable,
  text,
  integer,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Append-only credit ledger. Balance = SUM(delta) for a user.
 * `delta` is in **credits** (1000 credits = $1): positive = grant/top-up,
 * negative = usage debit. Monthly grants and Stripe top-ups are made
 * idempotent per (user, reason, periodKey) so a re-run or a webhook retry
 * can't double-grant.
 */
export const creditTransactions = pgTable(
  "credit_transactions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Credits delta (+grant / -usage). 1000 credits = $1. */
    delta: integer("delta").notNull(),
    reason: text("reason", {
      enum: ["grant_monthly", "grant_signup", "topup", "usage", "adjustment"],
    }).notNull(),
    /** Catalog model key for usage rows (e.g. "hust:anthropic/claude-sonnet-4.6"). */
    modelKey: text("model_key"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    /** Cost in micro-USD (1e-6 USD) for auditing. */
    costMicroUsd: integer("cost_micro_usd"),
    /**
     * Idempotency key: "YYYY-MM" for monthly grants, "stripe-checkout:<Checkout
     * Session id>" for Stripe top-ups; null for usage and other grants.
     */
    periodKey: text("period_key"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("credit_tx_user_idx").on(t.userId),
    index("credit_tx_user_created_idx").on(t.userId, t.createdAt),
    // NULL periodKeys are distinct in Postgres, so usage rows are
    // unconstrained; only rows with a key (monthly grants, Stripe top-ups)
    // are deduped.
    unique("credit_tx_grant_unique").on(t.userId, t.reason, t.periodKey),
  ],
);
