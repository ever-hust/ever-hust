import { db } from "@repo/db";
import { referrals, referralCredits } from "@repo/db";
import { eq } from "drizzle-orm";
import type { NextResponse } from "next/server";
import { requireSessionUser } from "../../../lib/get-session-user";
import { applyRateLimit } from "../../../lib/rate-limit";
import { apiSuccess, apiError } from "../../../lib/api-response";
import { generateReferralCode } from "../../../lib/referral-utils";

// GET /api/referrals - Get user's referrals + credit balance
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(req: Request) {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const userId = user.id;

  const rateLimited = applyRateLimit(userId, "authenticated");
  if (rateLimited) return rateLimited;

  try {
    // Get all referrals for this user
    const userReferrals = await db
      .select()
      .from(referrals)
      .where(eq(referrals.referrerId, userId))
      .limit(500);

    // Get or create referral credits row
    let credits = await db
      .select()
      .from(referralCredits)
      .where(eq(referralCredits.userId, userId))
      .limit(1);

    if (credits.length === 0) {
      await db
        .insert(referralCredits)
        .values({ userId })
        .onConflictDoNothing();
      credits = await db
        .select()
        .from(referralCredits)
        .where(eq(referralCredits.userId, userId))
        .limit(1);
    }

    const creditsRow = credits[0];

    // Find the user's referral code. If they have referrals, use the first
    // one's code. Otherwise, generate a new code by creating a "self" referral
    // entry that holds their code.
    let referralCode: string;
    if (userReferrals.length > 0) {
      referralCode = userReferrals[0]!.referralCode;
    } else {
      // Generate a unique code, retrying on collision
      let code = generateReferralCode();
      let attempts = 0;
      const maxAttempts = 10;
      while (attempts < maxAttempts) {
        const existing = await db
          .select({ id: referrals.id })
          .from(referrals)
          .where(eq(referrals.referralCode, code))
          .limit(1);
        if (existing.length === 0) break;
        code = generateReferralCode();
        attempts++;
      }
      if (attempts >= maxAttempts) {
        return apiError("Failed to generate unique referral code. Please try again.");
      }
      referralCode = code;

      // Create a placeholder referral record to store the user's code
      await db.insert(referrals).values({
        referrerId: userId,
        referralCode,
        status: "pending",
      });
    }

    return apiSuccess({
      referralCode,
      referrals: userReferrals.map((r) => ({
        id: r.id,
        referredEmail: r.referredEmail,
        status: r.status,
        creditAmount: r.creditAmount,
        createdAt: r.createdAt.toISOString(),
        completedAt: r.completedAt?.toISOString() ?? null,
      })),
      credits: {
        balance: creditsRow?.balance ?? 0,
        totalEarned: creditsRow?.totalEarned ?? 0,
        totalSpent: creditsRow?.totalSpent ?? 0,
      },
    });
  } catch (err) {
    console.error(
      "[api/referrals] GET failed:",
      err instanceof Error ? err.message : err,
    );
    return apiError("Failed to load referral data");
  }
}
