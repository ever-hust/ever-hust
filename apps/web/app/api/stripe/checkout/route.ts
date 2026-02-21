import { db, users } from "@repo/db";
import { createCheckoutSession } from "@repo/stripe";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { checkoutSchema, parseBody } from "../../../../lib/api-schemas";
import { applyRateLimit } from "../../../../lib/rate-limit";
import {
  apiSuccess,
  apiBadRequest,
  apiNotFound,
  apiError,
  safeJsonParse,
} from "../../../../lib/api-response";

export async function POST(req: Request) {
  let sessionUser;
  try {
    sessionUser = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const userId = sessionUser.id;

  const rateLimited = applyRateLimit(userId, "authenticated");
  if (rateLimited) return rateLimited;

  const jsonResult = await safeJsonParse(req);
  if (!jsonResult.ok) return jsonResult.response;
  const validation = parseBody(checkoutSchema, jsonResult.data);
  if (!validation.success) {
    return apiBadRequest(validation.error);
  }
  const body = validation.data;

  try {
    // Get user for email, existing Stripe customer ID, and current subscription status
    const userResult = await db
      .select({
        email: users.email,
        stripeCustomerId: users.stripeCustomerId,
        subscriptionStatus: users.subscriptionStatus,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userResult.length === 0) {
      return apiNotFound("User not found");
    }

    // Safe: guarded by userResult.length === 0 check above
    const dbUser = userResult[0]!;

    // Prevent creating a duplicate subscription for users who already have one
    // (active or past_due — they should use the billing portal instead).
    // Note: trialing maps to "active" on the user row via the webhook handler.
    if (
      dbUser.subscriptionStatus === "active" ||
      dbUser.subscriptionStatus === "past_due"
    ) {
      return apiBadRequest(
        "You already have a subscription. Use the billing portal to manage it.",
      );
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const { url } = await createCheckoutSession({
      userId,
      email: dbUser.email,
      planId: body.planId,
      stripeCustomerId: dbUser.stripeCustomerId,
      successUrl: `${appUrl}/settings?success=true`,
      cancelUrl: `${appUrl}/settings?canceled=true`,
    });

    if (!url) {
      console.error("[stripe/checkout] Stripe returned null checkout URL");
      return apiError("Failed to create checkout URL. Please try again.");
    }

    return apiSuccess({ url });
  } catch (error) {
    console.error(
      "[stripe/checkout] Failed to create checkout session:",
      error instanceof Error ? error.message : error,
    );
    return apiError("Failed to create checkout session");
  }
}
