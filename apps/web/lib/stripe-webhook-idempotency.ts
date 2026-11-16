import { db, stripeWebhookEvents } from "@ever-hust/db";
import { and, eq } from "drizzle-orm";

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
 * Outcome of trying to claim an event:
 * - `claimed`: this delivery inserted the row.
 * - `duplicate`: another delivery already holds the row; skip processing.
 * - `unverified`: the claim insert failed for another reason. Process anyway
 *   (never drop a webhook). The row may still have been written (an error
 *   after commit, e.g. a dropped connection) or another delivery may hold it.
 *
 * `claimedAt` is written as the row's `processed_at` and marks the row as this
 * delivery's own: pass the same value to {@link releaseEvent}.
 */
export type ClaimStatus = "claimed" | "duplicate" | "unverified";

export async function claimEventStatus(eventId: string, claimedAt: Date): Promise<ClaimStatus> {
  try {
    await db.insert(stripeWebhookEvents).values({ id: eventId, processedAt: claimedAt });
    return "claimed"; // Insert succeeded — first time seeing this event
  } catch (error) {
    // Unique constraint violation means another delivery already claimed it.
    if (isUniqueViolation(error)) {
      return "duplicate";
    }
    // For any other DB error, log and allow processing to proceed.
    // It's safer to risk double-processing than to silently drop a webhook.
    console.warn(
      "[stripe/webhook] Idempotency check failed, proceeding with processing:",
      error instanceof Error ? error.message : error,
    );
    return "unverified";
  }
}

/**
 * Check if a webhook event has already been processed.
 * Returns `true` if the caller should process it, or `false` if it was already
 * handled (caller should skip).
 */
export async function claimEvent(eventId: string): Promise<boolean> {
  return (await claimEventStatus(eventId, new Date())) !== "duplicate";
}

/**
 * Release a claim so Stripe's retry of a failed delivery is processed instead
 * of being skipped as a duplicate. Call it before returning a 5xx whenever the
 * claim was not a duplicate, `unverified` included. Never throws: if the delete
 * fails the retry is skipped (logged), which is no worse than before.
 *
 * Only the row written with this delivery's `claimedAt` is deleted, so another
 * delivery's claim is never erased. After an `unverified` claim this still
 * deletes our own row if the insert committed despite the error; keeping it
 * would make Stripe's retry a "duplicate" and the event would never run.
 */
export async function releaseEvent(eventId: string, claimedAt: Date): Promise<void> {
  try {
    await db
      .delete(stripeWebhookEvents)
      .where(
        and(
          eq(stripeWebhookEvents.id, eventId),
          eq(stripeWebhookEvents.processedAt, claimedAt),
        ),
      );
  } catch (error) {
    console.error(
      "[stripe/webhook] Failed to release event claim:",
      eventId,
      error instanceof Error ? error.message : error,
    );
  }
}
