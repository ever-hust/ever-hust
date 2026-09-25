import { createHash, timingSafeEqual } from "node:crypto";
import { apiError } from "./api-response";

/**
 * Shared guard for machine-to-machine cron endpoints (`/api/cron/*`, `/api/inbox/cron-sync`),
 * called by the Trigger.dev tasks (or any external scheduler) with `Authorization: Bearer
 * <CRON_SECRET>` (or the legacy `x-cron-secret` header).
 *
 * - CRON_SECRET set → the request must present it (constant-time comparison), else 401.
 * - CRON_SECRET unset in production → 503: FAIL CLOSED. These endpoints send email, delete rows
 *   and spend LLM credit; a missing secret must never leave them open on the internet.
 * - CRON_SECRET unset outside production (local dev, tests) → open, as before.
 */

/** The credential a request presents, or "" when none. */
export function extractCronSecret(req: Request): string {
  const auth = req.headers.get("authorization");
  if (auth !== null) return auth.replace(/^Bearer\s+/i, "").trim();
  return req.headers.get("x-cron-secret")?.trim() ?? "";
}

/**
 * Constant-time secret comparison. Both sides are hashed to fixed-length SHA-256 digests first,
 * so `timingSafeEqual` always compares 32 bytes: the time taken does not depend on where the
 * strings differ or on their lengths, and a length mismatch never throws.
 */
export function cronSecretMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  const equal = timingSafeEqual(a, b);
  return equal && expected.length > 0;
}

/**
 * Returns `null` when the request may proceed, otherwise the error `Response` to return as-is.
 */
export function verifyCronRequest(req: Request): Response | null {
  const expected = process.env.CRON_SECRET?.trim() ?? "";
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      console.error("[cron-auth] CRON_SECRET is not set — refusing cron request (fail closed).");
      return apiError("Cron endpoints are disabled: CRON_SECRET is not configured", 503);
    }
    return null;
  }
  const provided = extractCronSecret(req);
  if (!provided || !cronSecretMatches(provided, expected)) {
    return apiError("Unauthorized", 401);
  }
  return null;
}
