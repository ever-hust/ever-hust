import type Stripe from "stripe";
import { PLANS } from "./plans";

export type StripeWebhookEvent =
  | { type: "checkout.session.completed"; data: CheckoutCompleted }
  | { type: "invoice.paid"; data: InvoicePaid }
  | { type: "invoice.payment_failed"; data: InvoicePaymentFailed }
  | { type: "customer.subscription.updated"; data: SubscriptionUpdated }
  | { type: "customer.subscription.deleted"; data: SubscriptionDeleted };

export interface CheckoutCompleted {
  userId: string;
  planId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
}

export interface InvoicePaid {
  stripeCustomerId: string;
  stripeSubscriptionId: string;
}

export interface InvoicePaymentFailed {
  stripeCustomerId: string;
  stripeSubscriptionId: string;
}

export interface SubscriptionUpdated {
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  planId: string | null;
}

export interface SubscriptionDeleted {
  stripeCustomerId: string;
  stripeSubscriptionId: string;
}

/**
 * Parse a Stripe webhook event into our normalized format.
 * Returns null for events we don't handle.
 */
export function parseWebhookEvent(
  event: Stripe.Event
): StripeWebhookEvent | null {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId ?? session.client_reference_id;
      const planId = session.metadata?.planId;
      if (!userId || !planId) return null;
      return {
        type: "checkout.session.completed",
        data: {
          userId,
          planId,
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: session.subscription as string,
        },
      };
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      return {
        type: "invoice.paid",
        data: {
          stripeCustomerId: invoice.customer as string,
          stripeSubscriptionId: invoice.subscription as string,
        },
      };
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      return {
        type: "invoice.payment_failed",
        data: {
          stripeCustomerId: invoice.customer as string,
          stripeSubscriptionId: invoice.subscription as string,
        },
      };
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const priceId = sub.items.data[0]?.price.id;
      const matchedPlan = PLANS.find((p) => p.stripePriceId === priceId);
      return {
        type: "customer.subscription.updated",
        data: {
          stripeCustomerId: sub.customer as string,
          stripeSubscriptionId: sub.id,
          status: sub.status,
          currentPeriodStart: new Date(sub.current_period_start * 1000),
          currentPeriodEnd: new Date(sub.current_period_end * 1000),
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          planId: matchedPlan?.id ?? null,
        },
      };
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      return {
        type: "customer.subscription.deleted",
        data: {
          stripeCustomerId: sub.customer as string,
          stripeSubscriptionId: sub.id,
        },
      };
    }

    default:
      return null;
  }
}
