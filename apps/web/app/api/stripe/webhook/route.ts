// Stripe webhook may need to fetch subscription details — allow up to 30s
export const maxDuration = 30;

import { db, users, subscriptions } from "@repo/db";
import { getStripe, parseWebhookEvent } from "@repo/stripe";
import { sendSubscriptionConfirmedEmail } from "@repo/email";
import { eq, and, ne } from "drizzle-orm";
import { NextResponse } from "next/server";

// ── Idempotency Guard ─────────────────────────────────────────────────────
// Prevents duplicate processing of the same Stripe event.
// In production with multiple instances, use Redis SET NX instead.
const processedEvents = new Map<string, number>();
const IDEMPOTENCY_TTL = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL = 60 * 1000; // Run cleanup at most once per minute
let lastIdempotencyCleanup = 0;

function cleanupProcessedEvents(now: number): void {
  if (now - lastIdempotencyCleanup < CLEANUP_INTERVAL && processedEvents.size <= 1000) return;
  lastIdempotencyCleanup = now;
  for (const [id, ts] of processedEvents) {
    if (now - ts > IDEMPOTENCY_TTL) processedEvents.delete(id);
  }
}

function markProcessed(eventId: string): boolean {
  const now = Date.now();
  cleanupProcessedEvents(now);

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

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET is not configured");
    // Return 400 (not 500) so Stripe treats this as a permanent error and
    // does not retry indefinitely for a server misconfiguration.
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 400 },
    );
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      webhookSecret
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
        // Only set "active" if the subscription is not already canceled.
        // Stripe can send invoice.paid after a subscription.deleted event
        // (e.g. final invoice on immediate cancellation) and event ordering
        // is not guaranteed — we must not re-activate a canceled subscription.
        const { stripeCustomerId } = parsed.data;
        await db
          .update(users)
          .set({ subscriptionStatus: "active", updatedAt: new Date() })
          .where(
            and(
              eq(users.stripeCustomerId, stripeCustomerId),
              ne(users.subscriptionStatus, "canceled"),
            )
          );
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

    // Use onConflictDoUpdate so Stripe retries don't fail with a unique
    // constraint violation on stripe_subscription_id.
    await tx
      .insert(subscriptions)
      .values({
        userId,
        stripeSubscriptionId,
        planType: planId as "monthly" | "quarterly" | "annual",
        status: "active",
        currentPeriodStart: new Date(sub.current_period_start * 1000),
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      })
      .onConflictDoUpdate({
        target: subscriptions.stripeSubscriptionId,
        set: {
          status: "active",
          planType: planId as "monthly" | "quarterly" | "annual",
          currentPeriodStart: new Date(sub.current_period_start * 1000),
          currentPeriodEnd: new Date(sub.current_period_end * 1000),
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          updatedAt: new Date(),
        },
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

/** Subscription statuses our DB schema supports (matches subscriptions.status enum). */
const VALID_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "past_due",
  "canceled",
  "incomplete",
  "trialing",
]);

/** Map any Stripe subscription status to one our DB schema supports. */
function normalizeSubscriptionStatus(
  stripeStatus: string
): "active" | "past_due" | "canceled" | "incomplete" | "trialing" {
  if (VALID_SUBSCRIPTION_STATUSES.has(stripeStatus)) {
    return stripeStatus as "active" | "past_due" | "canceled" | "incomplete" | "trialing";
  }
  // Map unknown statuses to safe defaults:
  // "incomplete_expired", "unpaid", "paused" → "canceled"
  return "canceled";
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
    status: rawStatus,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    planId,
    stripeCustomerId,
  } = data;

  const status = normalizeSubscriptionStatus(rawStatus);

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

    await tx
      .update(subscriptions)
      .set({
        status,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        updatedAt: new Date(),
        ...(planId ? { planType: planId as "monthly" | "quarterly" | "annual" } : {}),
      })
      .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId));
  });
}
