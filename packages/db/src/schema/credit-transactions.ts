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
 * negative = usage debit. Monthly grants are made idempotent per
 * (user, reason, periodKey) so a re-run can't double-grant.
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
    /** "YYYY-MM" for monthly-grant idempotency; null for usage/top-ups. */
    periodKey: text("period_key"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("credit_tx_user_idx").on(t.userId),
    index("credit_tx_user_created_idx").on(t.userId, t.createdAt),
    // NULL periodKeys are distinct in Postgres, so usage/top-up rows are
    // unconstrained; only monthly grants (non-null periodKey) are deduped.
    unique("credit_tx_grant_unique").on(t.userId, t.reason, t.periodKey),
  ],
);
