import { db, users } from "@repo/db";
import { createPortalSession } from "@repo/stripe";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST() {
  // TODO: Get actual user from session
  const userId = "dev-user";

  const userResult = await db
    .select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (userResult.length === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const user = userResult[0]!;
  if (!user.stripeCustomerId) {
    return NextResponse.json(
      { error: "No active subscription" },
      { status: 400 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    const { url } = await createPortalSession({
      stripeCustomerId: user.stripeCustomerId,
      returnUrl: `${appUrl}/settings`,
    });

    return NextResponse.json({ url });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create portal";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
