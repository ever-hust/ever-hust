import { db, users } from "@ever-hust/db";
import { createCreditCheckoutSession } from "@ever-hust/stripe";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/get-session-user";
import { applyRateLimit } from "../../../../lib/rate-limit";
import { apiSuccess, apiBadRequest, apiNotFound, apiError, safeJsonParse } from "../../../../lib/api-response";

const PACKS = new Set(["small", "medium", "large"]);

/** POST /api/stripe/credits — start a one-time checkout to top up credits. */
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
  const packId = (jsonResult.data as { packId?: string })?.packId;
  if (!packId || !PACKS.has(packId)) {
    return apiBadRequest("Invalid credit pack");
  }

  try {
    const rows = await db
      .select({ email: users.email, stripeCustomerId: users.stripeCustomerId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (rows.length === 0) return apiNotFound("User not found");
    const dbUser = rows[0]!;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:8443";
    const { url } = await createCreditCheckoutSession({
      userId,
      email: dbUser.email,
      packId,
      stripeCustomerId: dbUser.stripeCustomerId,
      successUrl: `${appUrl}/subscriptions?credits=topped_up`,
      cancelUrl: `${appUrl}/subscriptions?credits=canceled`,
    });

    if (!url) return apiError("Failed to create checkout URL. Please try again.");
    return apiSuccess({ url });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[stripe/credits] Failed to create top-up session:", msg);
    // Surface "not configured" clearly so the UI can explain it.
    if (msg.includes("not configured")) return apiBadRequest(msg);
    return apiError("Failed to start credit top-up");
  }
}
