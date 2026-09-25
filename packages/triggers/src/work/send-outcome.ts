import type { DeduplicatedEmail } from "@ever-hust/email";

/**
 * How Resend answered a send that carried an idempotency key:
 *  - `accepted`: a normal response. Resend also returns this (the original response, nothing new
 *    sent) for a repeat of the same key with the same payload.
 *  - `replayed`: 409 `invalid_idempotent_request`: the key was already used by a request with a
 *    different payload, so an earlier attempt at this period was processed.
 *  - `in_flight`: 409 `concurrent_idempotent_requests`: a request with this key is still being
 *    processed elsewhere. Its outcome is not known yet, so the caller must not record the period
 *    on its behalf.
 */
export type SendOutcome = "accepted" | "replayed" | "in_flight";

export function classifySendOutcome(outcome: unknown): SendOutcome {
  const dedupe = outcome as Partial<DeduplicatedEmail> | null | undefined;
  if (dedupe?.deduplicated !== true) return "accepted";
  return dedupe.reason === "in_flight" ? "in_flight" : "replayed";
}
