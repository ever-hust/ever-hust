import type { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/get-session-user";
import {
  checkSubscription,
  peekMessageUsage,
  peekSearchUsage,
  peekCoverLetterUsage,
} from "../../../../lib/subscription-gate";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { apiSuccess, apiError } from "../../../../lib/api-response";

/**
 * GET /api/user/usage
 *
 * Returns the user's current usage statistics and remaining quotas.
 * Pro users get unlimited (null usage).
 * Free users get their remaining counts for messages, searches, and cover letters.
 *
 * Uses peek functions (read-only) so calling this endpoint never consumes quota.
 */
export async function GET() {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }

  const rateLimited = applyRateLimit(user.id, "authenticated");
  if (rateLimited) return rateLimited;

  try {
    const gate = await checkSubscription(user.id);

    if (gate.isActive) {
      // Usage stats are relatively stable — brief cache for pro users
      return apiSuccess(
        { plan: "pro", unlimited: true, usage: null },
        { cacheSeconds: 30 },
      );
    }

    // Read-only peek at current usage stats for free users.
    // These do NOT increment counters.
    const messages = peekMessageUsage(user.id);
    const searches = peekSearchUsage(user.id);
    const coverLetters = peekCoverLetterUsage(user.id);

    return apiSuccess({
      plan: "free",
      unlimited: false,
      usage: {
        messages: {
          used: messages.used,
          remaining: messages.remaining,
          limit: messages.limit,
          period: "day",
        },
        searches: {
          used: searches.used,
          remaining: searches.remaining,
          limit: searches.limit,
          period: "day",
        },
        coverLetters: {
          used: coverLetters.used,
          remaining: coverLetters.remaining,
          limit: coverLetters.limit,
          period: "week",
        },
      },
    });
  } catch (err) {
    console.error("[api/user/usage] GET failed:", err instanceof Error ? err.message : err);
    return apiError("Failed to load usage stats");
  }
}
