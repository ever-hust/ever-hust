import { db, users, subscriptions } from "@repo/db";
import { getStripe, parseWebhookEvent } from "@repo/stripe";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { sendSubscriptionConfirmedEmail } from "@repo/email";

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const parsed = parseWebhookEvent(event);
  if (!parsed) {
    // Event type we don't handle — acknowledge it
    return NextResponse.json({ received: true });
  }

  switch (parsed.type) {
    case "checkout.session.completed": {
      const { userId, planId, stripeCustomerId, stripeSubscriptionId } =
        parsed.data;

      // Fetch the subscription to get period dates
      const sub = await getStripe().subscriptions.retrieve(stripeSubscriptionId);

      // Update user with Stripe customer ID and active status
      await db
        .update(users)
        .set({
          stripeCustomerId,
          subscriptionStatus: "active",
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      // Create subscription record
      await db.insert(subscriptions).values({
        userId,
        stripeSubscriptionId,
        planType: planId as "monthly" | "quarterly" | "annual",
        status: "active",
        currentPeriodStart: new Date(sub.current_period_start * 1000),
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      });

      // Send subscription confirmation email
      const userRecord = await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (userRecord.length > 0 && userRecord[0]!.email) {
        const planNames: Record<string, string> = {
          monthly: "Monthly Pro",
          quarterly: "Quarterly Pro",
          annual: "Annual Pro",
        };
        try {
          await sendSubscriptionConfirmedEmail({
            to: userRecord[0]!.email,
            userName: userRecord[0]!.name ?? "there",
            planName: planNames[planId] ?? "Pro",
            dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://everjobs.ai"}/chat`,
          });
        } catch {
          // Don't fail the webhook if email fails
          console.error("Failed to send subscription confirmation email");
        }
      }

      break;
    }

    case "invoice.paid": {
      const { stripeCustomerId } = parsed.data;

      // Ensure user status is active on successful payment
      await db
        .update(users)
        .set({ subscriptionStatus: "active", updatedAt: new Date() })
        .where(eq(users.stripeCustomerId, stripeCustomerId));

      break;
    }

    case "invoice.payment_failed": {
      const { stripeCustomerId } = parsed.data;

      await db
        .update(users)
        .set({ subscriptionStatus: "past_due", updatedAt: new Date() })
        .where(eq(users.stripeCustomerId, stripeCustomerId));

      break;
    }

    case "customer.subscription.updated": {
      const {
        stripeSubscriptionId,
        status,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        planId,
        stripeCustomerId,
      } = parsed.data;

      // Map Stripe status to our user status
      const userStatus =
        status === "active"
          ? "active"
          : status === "past_due"
            ? "past_due"
            : "canceled";

      await db
        .update(users)
        .set({ subscriptionStatus: userStatus, updatedAt: new Date() })
        .where(eq(users.stripeCustomerId, stripeCustomerId));

      // Update subscription record
      const updateValues: Record<string, unknown> = {
        status,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        updatedAt: new Date(),
      };
      if (planId) {
        updateValues.planType = planId;
      }

      await db
        .update(subscriptions)
        .set(updateValues)
        .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId));

      break;
    }

    case "customer.subscription.deleted": {
      const { stripeCustomerId, stripeSubscriptionId } = parsed.data;

      await db
        .update(users)
        .set({ subscriptionStatus: "canceled", updatedAt: new Date() })
        .where(eq(users.stripeCustomerId, stripeCustomerId));

      await db
        .update(subscriptions)
        .set({ status: "canceled", updatedAt: new Date() })
        .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId));

      break;
    }
  }

  return NextResponse.json({ received: true });
}
