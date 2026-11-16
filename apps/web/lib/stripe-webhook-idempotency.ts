import { db, stripeWebhookEvents } from "@ever-hust/db";
import { eq } from "drizzle-orm";

// ── Idempotency Guard ─────────────────────────────────────────────────────
// Database-backed deduplication that works across multiple server instances.
// Old events are cleaned up by the daily cleanup task (7-day retention).

/** PostgreSQL error code 23505 = unique_violation. */
const UNIQUE_VIOLATION = "23505";

function hasCode(value: unknown, code: string): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    (value as { code: unknown }).code === code
  );
}

/**
 * True when the error is a Postgres unique violation. Drizzle (0.45+) wraps
 * driver errors in a DrizzleQueryError that carries no `code` of its own: the
 * driver error with the SQLSTATE sits on `.cause`. Older/raw driver errors
 * carry `code` directly, so both shapes are accepted.
 */
function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return hasCode(error, UNIQUE_VIOLATION) || hasCode(error.cause, UNIQUE_VIOLATION);
}

/**
 * Check if a webhook event has already been processed.
 * Returns `true` if this is the first time (caller should process it),
 * or `false` if it was already handled (caller should skip).
 */
export async function claimEvent(eventId: string): Promise<boolean> {
  try {
    await db.insert(stripeWebhookEvents).values({ id: eventId });
    return true; // Insert succeeded — first time seeing this event
  } catch (error) {
    // Unique constraint violation means another delivery already claimed it.
    if (isUniqueViolation(error)) {
      return false;
    }
    // For any other DB error, log and allow processing to proceed.
    // It's safer to risk double-processing than to silently drop a webhook.
    console.warn(
      "[stripe/webhook] Idempotency check failed, proceeding with processing:",
      error instanceof Error ? error.message : error,
    );
    return true;
  }
}

/**
 * Release a claim so Stripe's retry of a failed delivery is processed instead
 * of being skipped as a duplicate. Call it before returning a 5xx. Never
 * throws: if the delete fails the retry is skipped (logged), which is no worse
 * than before.
 */
export async function releaseEvent(eventId: string): Promise<void> {
  try {
    await db.delete(stripeWebhookEvents).where(eq(stripeWebhookEvents.id, eventId));
  } catch (error) {
    console.error(
      "[stripe/webhook] Failed to release event claim:",
      eventId,
      error instanceof Error ? error.message : error,
    );
  }
}
