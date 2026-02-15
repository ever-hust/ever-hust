import { db, users } from "@repo/db";
import { createCheckoutSession } from "@repo/stripe";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "../../../../lib/get-session-user";

const checkoutSchema = z.object({
  planId: z.string().min(1, "planId is required"),
});

export async function POST(req: Request) {
  let sessionUser;
  try {
    sessionUser = await requireSessionUser();
  } catch (response) {
    return response as NextResponse;
  }
  const userId = sessionUser.id;

  const raw = await req.json();
  const parsed = checkoutSchema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const body = parsed.data;

  // Get user for email and existing Stripe customer ID
  const userResult = await db
    .select({
      email: users.email,
      stripeCustomerId: users.stripeCustomerId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (userResult.length === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const dbUser = userResult[0]!;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    const { url } = await createCheckoutSession({
      userId,
      email: dbUser.email,
      planId: body.planId,
      stripeCustomerId: dbUser.stripeCustomerId,
      successUrl: `${appUrl}/settings?session_id={CHECKOUT_SESSION_ID}&success=true`,
      cancelUrl: `${appUrl}/settings?canceled=true`,
    });

    return NextResponse.json({ url });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create checkout";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
