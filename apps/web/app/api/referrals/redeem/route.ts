import { db } from "@repo/db";
import { referrals, referralCredits } from "@repo/db";
import { eq, and, sql } from "drizzle-orm";
import type { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { referralRedeemSchema, parseBody } from "../../../../lib/api-schemas";
import {
  apiSuccess,
  apiBadRequest,
  apiError,
  safeJsonParse,
} from "../../../../lib/api-response";

/** Credits awarded to the referrer when someone signs up via their link. */
const REFERRAL_CREDIT_AMOUNT = 50;

// POST /api/referrals/redeem - Redeem a referral code (called during signup)
export async function POST(req: Request) {
  let user;
  try {
    user = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const userId = user.id;

  const rateLimited = applyRateLimit(userId, "authenticated");
  if (rateLimited) return rateLimited;

  const jsonResult = await safeJsonParse(req);
  if (!jsonResult.ok) return jsonResult.response;
  const validation = parseBody(referralRedeemSchema, jsonResult.data);
  if (!validation.success) {
    return apiBadRequest(validation.error);
  }
  const { code } = validation.data;

  try {
    const now = new Date();

    // Everything inside a single transaction to prevent double-credit
    // race conditions (two concurrent redeems of the same code).
    const result = await db.transaction(async (tx) => {
      // Find a pending referral with this code (SELECT inside tx for atomicity)
      const pendingReferrals = await tx
        .select()
        .from(referrals)
        .where(
          and(
            eq(referrals.referralCode, code),
            eq(referrals.status, "pending"),
          ),
        )
        .limit(1);

      if (pendingReferrals.length === 0) {
        return { error: "Invalid or already used referral code" } as const;
      }

      const referral = pendingReferrals[0]!;

      // Prevent self-referral
      if (referral.referrerId === userId) {
        return { error: "You cannot redeem your own referral code" } as const;
      }

      // Atomically claim: only update if still pending (prevents double-credit)
      const [updated] = await tx
        .update(referrals)
        .set({
          referredUserId: userId,
          status: "credited",
          creditAmount: REFERRAL_CREDIT_AMOUNT,
          completedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(referrals.id, referral.id),
            eq(referrals.status, "pending"),
          ),
        )
        .returning({ id: referrals.id });

      if (!updated) {
        return { error: "Referral code has already been redeemed" } as const;
      }

      // Award credits to the referrer — upsert their credit balance
      const existingCredits = await tx
        .select()
        .from(referralCredits)
        .where(eq(referralCredits.userId, referral.referrerId))
        .limit(1);

      if (existingCredits.length === 0) {
        await tx.insert(referralCredits).values({
          userId: referral.referrerId,
          balance: REFERRAL_CREDIT_AMOUNT,
          totalEarned: REFERRAL_CREDIT_AMOUNT,
          totalSpent: 0,
          updatedAt: now,
        });
      } else {
        await tx
          .update(referralCredits)
          .set({
            balance: sql`${referralCredits.balance} + ${REFERRAL_CREDIT_AMOUNT}`,
            totalEarned: sql`${referralCredits.totalEarned} + ${REFERRAL_CREDIT_AMOUNT}`,
            updatedAt: now,
          })
          .where(eq(referralCredits.userId, referral.referrerId));
      }

      return { referrerId: referral.referrerId } as const;
    });

    if ("error" in result) {
      return apiBadRequest(result.error);
    }

    return apiSuccess({
      message: "Referral code redeemed successfully",
      referrerId: result.referrerId,
      creditsAwarded: REFERRAL_CREDIT_AMOUNT,
    });
  } catch (err) {
    console.error(
      "[api/referrals/redeem] POST failed:",
      err instanceof Error ? err.message : err,
    );
    return apiError("Failed to redeem referral code");
  }
}
