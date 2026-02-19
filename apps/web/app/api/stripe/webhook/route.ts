// Stripe webhook may need to fetch subscription details — allow up to 30s
export const maxDuration = 30;

import { db, users, subscriptions, stripeWebhookEvents } from "@repo/db";
import { getStripe, parseWebhookEvent } from "@repo/stripe";
import { sendSubscriptionConfirmedEmail } from "@repo/email";
import { eq, and, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { apiBadRequest, apiError } from "../../../../lib/api-response";

// ── Idempotency Guard ─────────────────────────────────────────────────────
// Database-backed deduplication that works across multiple server instances.
// Old events are cleaned up by the daily cleanup task (7-day retention).

/**
 * Check if a webhook event has already been processed.
 * Returns `true` if this is the first time (caller should process it),
 * or `false` if it was already handled (caller should skip).
 */
async function claimEvent(eventId: string): Promise<boolean> {
  try {
    await db.insert(stripeWebhookEvents).values({ id: eventId });
    return true; // Insert succeeded — first time seeing this event
  } catch (error) {
    // Unique constraint violation means another instance already processed it.
    // PostgreSQL error code 23505 = unique_violation.
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "23505"
    ) {
      return false;
    }
    // For any other DB error, log and allow processing to proceed.
    // It's safer to risk double-processing (handlers are idempotent)
    // than to silently drop a webhook.
    console.warn(
      "[stripe/webhook] Idempotency check failed, proceeding with processing:",
      error instanceof Error ? error.message : error,
    );
    return true;
  }
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
    return apiBadRequest("No signature");
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET is not configured");
    // Return 400 (not 500) so Stripe treats this as a permanent error and
    // does not retry indefinitely for a server misconfiguration.
    return apiBadRequest("Webhook secret not configured");
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
    return apiBadRequest("Invalid signature");
  }

  // Idempotency: skip if we've already processed this event
  const isNew = await claimEvent(event.id);
  if (!isNew) {
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
    return apiError("Webhook handler failed");
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
