import { db, users } from "@ever-hust/db";
import { createPortalSession } from "@ever-hust/stripe";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../lib/rate-limit";
import {
  apiSuccess,
  apiBadRequest,
  apiNotFound,
  apiError,
} from "../../../../lib/api-response";

export async function POST() {
  let sessionUser;
  try {
    sessionUser = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const userId = sessionUser.id;

  const rateLimited = applyRateLimit(userId, "authenticated");
  if (rateLimited) return rateLimited;

  try {
    const userResult = await db
      .select({ stripeCustomerId: users.stripeCustomerId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userResult.length === 0) {
      return apiNotFound("User not found");
    }

    const dbUser = userResult[0]!;
    if (!dbUser.stripeCustomerId) {
      return apiBadRequest("No active subscription");
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:8443";

    const { url } = await createPortalSession({
      stripeCustomerId: dbUser.stripeCustomerId,
      returnUrl: `${appUrl}/settings`,
    });

    if (!url) {
      console.error("[stripe/portal] Stripe returned null portal URL");
      return apiError("Failed to create billing portal session");
    }

    return apiSuccess({ url });
  } catch (error) {
    console.error(
      "[stripe/portal] Failed to create portal session:",
      error instanceof Error ? error.message : error,
    );
    return apiError("Failed to create billing portal session");
  }
}
