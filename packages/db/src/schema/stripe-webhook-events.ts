import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Tracks processed Stripe webhook event IDs for idempotency.
 *
 * Stripe may deliver the same event multiple times, especially under
 * horizontal scaling where in-memory deduplication is unreliable.
 * This table provides persistent, cross-instance deduplication.
 *
 * Old rows are cleaned up by the daily cleanup task (7-day retention).
 */
export const stripeWebhookEvents = pgTable("stripe_webhook_events", {
  id: text("id").primaryKey(), // Stripe event ID (e.g. "evt_1...")
  processedAt: timestamp("processed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
