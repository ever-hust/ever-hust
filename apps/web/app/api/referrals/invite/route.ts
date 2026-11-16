import { db } from "@ever-hust/db";
import { referrals } from "@ever-hust/db";
import { eq } from "drizzle-orm";
import type { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { referralInviteSchema, parseBody } from "../../../../lib/api-schemas";
import {
  apiSuccess,
  apiBadRequest,
  apiError,
  safeJsonParse,
} from "../../../../lib/api-response";
import { generateReferralCode } from "../../../../lib/referral-utils";

// POST /api/referrals/invite - Send a referral invite (returns link to share)
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
  const validation = parseBody(referralInviteSchema, jsonResult.data);
  if (!validation.success) {
    return apiBadRequest(validation.error);
  }
  const { email } = validation.data;

  try {
    // Every invite gets its own code. referral_code is unique, so reusing the
    // user's existing code (GET /api/referrals stores it in a row) made this
    // insert fail for every invite.
    let referralCode = generateReferralCode();
    let attempts = 0;
    const maxAttempts = 10;
    while (attempts < maxAttempts) {
      const existing = await db
        .select({ id: referrals.id })
        .from(referrals)
        .where(eq(referrals.referralCode, referralCode))
        .limit(1);
      if (existing.length === 0) break;
      referralCode = generateReferralCode();
      attempts++;
    }
    if (attempts >= maxAttempts) {
      return apiError("Failed to generate unique referral code. Please try again.");
    }

    // Create a new referral record for this invite
    await db.insert(referrals).values({
      referrerId: userId,
      referralCode,
      referredEmail: email,
      status: "pending",
    });

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://hust.so";
    const referralLink = `${appUrl}/signup?ref=${referralCode}`;

    return apiSuccess(
      { referralCode, referralLink, email },
      { status: 201 },
    );
  } catch (err) {
    console.error(
      "[api/referrals/invite] POST failed:",
      err instanceof Error ? err.message : err,
    );
    return apiError("Failed to create referral invite");
  }
}
