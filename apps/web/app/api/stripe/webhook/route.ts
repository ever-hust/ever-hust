// Stripe webhook may need to fetch subscription details — allow up to 30s
export const maxDuration = 30;

import { db, users, subscriptions } from "@repo/db";
import { getStripe, parseWebhookEvent } from "@repo/stripe";
import { sendSubscriptionConfirmedEmail } from "@repo/email";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

// ── Idempotency Guard ─────────────────────────────────────────────────────
// Prevents duplicate processing of the same Stripe event.
// In production with multiple instances, use Redis SET NX instead.
const processedEvents = new Map<string, number>();
const IDEMPOTENCY_TTL = 5 * 60 * 1000; // 5 minutes

function markProcessed(eventId: string): boolean {
  // Clean old entries (>5 min)
  const now = Date.now();
  if (processedEvents.size > 1000) {
    for (const [id, ts] of processedEvents) {
      if (now - ts > IDEMPOTENCY_TTL) processedEvents.delete(id);
    }
  }

  if (processedEvents.has(eventId)) return false; // Already processed
  processedEvents.set(eventId, now);
  return true; // First time
}

/** Map plan ID to display info for emails. */
const PLAN_INFO: Record<string, { name: string; amount: string; cycle: string }> = {
  monthly: { name: "Pro Monthly", amount: "$20", cycle: "month" },
  quarterly: { name: "Pro Quarterly", amount: "$12/mo", cycle: "quarter" },
  annual: { name: "Pro Annual", amount: "$7/mo", cycle: "year" },
};

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
  } catch (err) {
    console.error(
      "[stripe/webhook] Signature verification failed:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Idempotency: skip if we've already processed this event
  if (!markProcessed(event.id)) {
    return NextResponse.json({ received: true, deduplicated: true });
  }

  const parsed = parseWebhookEvent(event);
  if (!parsed) {
    // Event type we don't handle — acknowledge it
    return NextResponse.json({ received: true });
  }

  try {
    switch (parsed.type) {
      case "checkout.session.completed": {
        await handleCheckoutCompleted(parsed.data);
        break;
      }

      case "invoice.paid": {
        const { stripeCustomerId } = parsed.data;
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
        await handleSubscriptionUpdated(parsed.data);
        break;
      }

      case "customer.subscription.deleted": {
        const { stripeCustomerId, stripeSubscriptionId } = parsed.data;
        await db.transaction(async (tx) => {
          await tx
            .update(users)
            .set({ subscriptionStatus: "canceled", updatedAt: new Date() })
            .where(eq(users.stripeCustomerId, stripeCustomerId));

          await tx
            .update(subscriptions)
            .set({ status: "canceled", updatedAt: new Date() })
            .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId));
        });
        break;
      }
    }
  } catch (error) {
    console.error(
      `[stripe/webhook] Error processing ${parsed.type}:`,
      error instanceof Error ? error.stack ?? error.message : error,
    );
    // Return 500 so Stripe retries the webhook
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}

// ── Event Handlers ──────────────────────────────────────────────────────────

async function handleCheckoutCompleted(data: {
  userId: string;
  planId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
}) {
  const { userId, planId, stripeCustomerId, stripeSubscriptionId } = data;

  // Fetch the subscription to get period dates
  const sub = await getStripe().subscriptions.retrieve(stripeSubscriptionId);

  // Use a transaction to ensure user + subscription are updated atomically
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        stripeCustomerId,
        subscriptionStatus: "active",
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    await tx.insert(subscriptions).values({
      userId,
      stripeSubscriptionId,
      planType: planId as "monthly" | "quarterly" | "annual",
      status: "active",
      currentPeriodStart: new Date(sub.current_period_start * 1000),
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    });
  });

  // Send subscription confirmation email (non-blocking, outside transaction)
  try {
    const userRow = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userRow.length > 0 && userRow[0]!.email) {
      const plan = PLAN_INFO[planId] ?? PLAN_INFO.monthly!;
      await sendSubscriptionConfirmedEmail({
        to: userRow[0]!.email,
        userName: userRow[0]!.name ?? "there",
        planName: plan.name,
        amount: plan.amount,
        billingCycle: plan.cycle,
      });
    }
  } catch (emailError) {
    // Don't fail the webhook if email sending fails
    console.error(
      "[stripe/webhook] Failed to send subscription confirmation email:",
      emailError instanceof Error ? emailError.message : emailError,
    );
  }
}

async function handleSubscriptionUpdated(data: {
  stripeSubscriptionId: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  planId: string | null;
  stripeCustomerId: string;
}) {
  const {
    stripeSubscriptionId,
    status,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    planId,
    stripeCustomerId,
  } = data;

  // Map Stripe status to our user status
  const userStatus =
    status === "active"
      ? "active"
      : status === "past_due"
        ? "past_due"
        : "canceled";

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ subscriptionStatus: userStatus, updatedAt: new Date() })
      .where(eq(users.stripeCustomerId, stripeCustomerId));

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

    await tx
      .update(subscriptions)
      .set(updateValues)
      .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId));
  });
}
