import type Stripe from "stripe";
import { parseWebhookEvent } from "./webhook";
import { PLANS } from "./plans";

// ---------------------------------------------------------------------------
// Helpers — minimal Stripe event factories
// ---------------------------------------------------------------------------

function makeEvent<T extends string>(
  type: T,
  object: Record<string, unknown>
): Stripe.Event {
  return {
    id: "evt_test_123",
    object: "event",
    type,
    data: { object },
  } as unknown as Stripe.Event;
}

function checkoutEvent(
  overrides: Record<string, unknown> = {}
): Stripe.Event {
  return makeEvent("checkout.session.completed", {
    metadata: { userId: "user_1", planId: "monthly" },
    client_reference_id: null,
    customer: "cus_abc",
    subscription: "sub_xyz",
    ...overrides,
  });
}

function invoiceEvent(
  type: "invoice.paid" | "invoice.payment_failed",
  overrides: Record<string, unknown> = {}
): Stripe.Event {
  return makeEvent(type, {
    customer: "cus_abc",
    subscription: "sub_xyz",
    ...overrides,
  });
}

function subscriptionEvent(
  type: "customer.subscription.updated" | "customer.subscription.deleted",
  overrides: Record<string, unknown> = {}
): Stripe.Event {
  const priceId = PLANS[0]?.stripePriceId ?? "price_test";
  return makeEvent(type, {
    id: "sub_xyz",
    customer: "cus_abc",
    status: "active",
    current_period_start: 1700000000,
    current_period_end: 1702592000,
    cancel_at_period_end: false,
    items: {
      data: [{ price: { id: priceId } }],
    },
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseWebhookEvent", () => {
  // -----------------------------------------------------------------------
  // checkout.session.completed
  // -----------------------------------------------------------------------
  describe("checkout.session.completed", () => {
    it("returns parsed data when userId is in metadata", () => {
      const result = parseWebhookEvent(checkoutEvent());

      expect(result).toEqual({
        type: "checkout.session.completed",
        data: {
          userId: "user_1",
          planId: "monthly",
          stripeCustomerId: "cus_abc",
          stripeSubscriptionId: "sub_xyz",
        },
      });
    });

    it("falls back to client_reference_id when metadata.userId is absent", () => {
      const result = parseWebhookEvent(
        checkoutEvent({
          metadata: { planId: "monthly" },
          client_reference_id: "user_fallback",
        })
      );

      expect(result).toEqual({
        type: "checkout.session.completed",
        data: {
          userId: "user_fallback",
          planId: "monthly",
          stripeCustomerId: "cus_abc",
          stripeSubscriptionId: "sub_xyz",
        },
      });
    });

    it("returns null when userId is missing from both metadata and client_reference_id", () => {
      const result = parseWebhookEvent(
        checkoutEvent({
          metadata: { planId: "monthly" },
          client_reference_id: null,
        })
      );

      expect(result).toBeNull();
    });

    it("returns null when planId is missing from metadata", () => {
      const result = parseWebhookEvent(
        checkoutEvent({
          metadata: { userId: "user_1" },
        })
      );

      expect(result).toBeNull();
    });

    it("returns null when customer is an expanded object (not a string)", () => {
      const result = parseWebhookEvent(
        checkoutEvent({
          customer: { id: "cus_abc", object: "customer" },
        })
      );

      expect(result).toBeNull();
    });

    it("returns null when customer is null", () => {
      const result = parseWebhookEvent(
        checkoutEvent({ customer: null })
      );

      expect(result).toBeNull();
    });

    it("returns null when subscription is null", () => {
      const result = parseWebhookEvent(
        checkoutEvent({ subscription: null })
      );

      expect(result).toBeNull();
    });

    it("returns null when subscription is an expanded object", () => {
      const result = parseWebhookEvent(
        checkoutEvent({
          subscription: { id: "sub_xyz", object: "subscription" },
        })
      );

      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // invoice.paid
  // -----------------------------------------------------------------------
  describe("invoice.paid", () => {
    it("returns parsed data for a valid invoice", () => {
      const result = parseWebhookEvent(invoiceEvent("invoice.paid"));

      expect(result).toEqual({
        type: "invoice.paid",
        data: {
          stripeCustomerId: "cus_abc",
          stripeSubscriptionId: "sub_xyz",
        },
      });
    });

    it("returns null when customer is not a string", () => {
      const result = parseWebhookEvent(
        invoiceEvent("invoice.paid", {
          customer: { id: "cus_abc", object: "customer" },
        })
      );

      expect(result).toBeNull();
    });

    it("returns null when customer is null", () => {
      const result = parseWebhookEvent(
        invoiceEvent("invoice.paid", { customer: null })
      );

      expect(result).toBeNull();
    });

    it("returns null when subscription is not a string", () => {
      const result = parseWebhookEvent(
        invoiceEvent("invoice.paid", {
          subscription: { id: "sub_xyz", object: "subscription" },
        })
      );

      expect(result).toBeNull();
    });

    it("returns null when subscription is null", () => {
      const result = parseWebhookEvent(
        invoiceEvent("invoice.paid", { subscription: null })
      );

      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // invoice.payment_failed
  // -----------------------------------------------------------------------
  describe("invoice.payment_failed", () => {
    it("returns parsed data for a valid invoice", () => {
      const result = parseWebhookEvent(
        invoiceEvent("invoice.payment_failed")
      );

      expect(result).toEqual({
        type: "invoice.payment_failed",
        data: {
          stripeCustomerId: "cus_abc",
          stripeSubscriptionId: "sub_xyz",
        },
      });
    });

    it("returns null when customer is not a string", () => {
      const result = parseWebhookEvent(
        invoiceEvent("invoice.payment_failed", {
          customer: { id: "cus_abc", object: "customer" },
        })
      );

      expect(result).toBeNull();
    });

    it("returns null when customer is null", () => {
      const result = parseWebhookEvent(
        invoiceEvent("invoice.payment_failed", { customer: null })
      );

      expect(result).toBeNull();
    });

    it("returns null when subscription is not a string", () => {
      const result = parseWebhookEvent(
        invoiceEvent("invoice.payment_failed", {
          subscription: { id: "sub_xyz" },
        })
      );

      expect(result).toBeNull();
    });

    it("returns null when subscription is null", () => {
      const result = parseWebhookEvent(
        invoiceEvent("invoice.payment_failed", { subscription: null })
      );

      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // customer.subscription.updated
  // -----------------------------------------------------------------------
  describe("customer.subscription.updated", () => {
    it("returns parsed data with a matching plan", () => {
      const result = parseWebhookEvent(
        subscriptionEvent("customer.subscription.updated")
      );

      expect(result).not.toBeNull();
      expect(result!.type).toBe("customer.subscription.updated");

      const data = result!.data as {
        stripeCustomerId: string;
        stripeSubscriptionId: string;
        status: string;
        currentPeriodStart: Date;
        currentPeriodEnd: Date;
        cancelAtPeriodEnd: boolean;
        planId: string | null;
      };

      expect(data.stripeCustomerId).toBe("cus_abc");
      expect(data.stripeSubscriptionId).toBe("sub_xyz");
      expect(data.status).toBe("active");
      expect(data.cancelAtPeriodEnd).toBe(false);
      // planId matches the first plan since we used its stripePriceId
      expect(data.planId).toBe(PLANS[0]?.id ?? null);
    });

    it("converts Unix timestamps to Date objects (multiplied by 1000)", () => {
      const startTs = 1700000000;
      const endTs = 1702592000;

      const result = parseWebhookEvent(
        subscriptionEvent("customer.subscription.updated", {
          current_period_start: startTs,
          current_period_end: endTs,
        })
      );

      expect(result).not.toBeNull();
      const data = result!.data as {
        currentPeriodStart: Date;
        currentPeriodEnd: Date;
      };

      expect(data.currentPeriodStart).toEqual(new Date(startTs * 1000));
      expect(data.currentPeriodEnd).toEqual(new Date(endTs * 1000));
      expect(data.currentPeriodStart.getTime()).toBe(startTs * 1000);
      expect(data.currentPeriodEnd.getTime()).toBe(endTs * 1000);
    });

    it("returns null when customer is an expanded object", () => {
      const result = parseWebhookEvent(
        subscriptionEvent("customer.subscription.updated", {
          customer: { id: "cus_abc", object: "customer" },
        })
      );

      expect(result).toBeNull();
    });

    it("returns null when customer is null", () => {
      const result = parseWebhookEvent(
        subscriptionEvent("customer.subscription.updated", {
          customer: null,
        })
      );

      expect(result).toBeNull();
    });

    it("returns planId as null when no plan matches the price ID", () => {
      const result = parseWebhookEvent(
        subscriptionEvent("customer.subscription.updated", {
          items: {
            data: [{ price: { id: "price_unknown_xyz" } }],
          },
        })
      );

      expect(result).not.toBeNull();
      const data = result!.data as { planId: string | null };
      expect(data.planId).toBeNull();
    });

    it("includes cancel_at_period_end when true", () => {
      const result = parseWebhookEvent(
        subscriptionEvent("customer.subscription.updated", {
          cancel_at_period_end: true,
        })
      );

      expect(result).not.toBeNull();
      const data = result!.data as { cancelAtPeriodEnd: boolean };
      expect(data.cancelAtPeriodEnd).toBe(true);
    });

    it("reflects the subscription status", () => {
      const result = parseWebhookEvent(
        subscriptionEvent("customer.subscription.updated", {
          status: "past_due",
        })
      );

      expect(result).not.toBeNull();
      const data = result!.data as { status: string };
      expect(data.status).toBe("past_due");
    });
  });

  // -----------------------------------------------------------------------
  // customer.subscription.deleted
  // -----------------------------------------------------------------------
  describe("customer.subscription.deleted", () => {
    it("returns parsed data for a valid subscription", () => {
      const result = parseWebhookEvent(
        subscriptionEvent("customer.subscription.deleted")
      );

      expect(result).toEqual({
        type: "customer.subscription.deleted",
        data: {
          stripeCustomerId: "cus_abc",
          stripeSubscriptionId: "sub_xyz",
        },
      });
    });

    it("returns null when customer is not a string", () => {
      const result = parseWebhookEvent(
        subscriptionEvent("customer.subscription.deleted", {
          customer: { id: "cus_abc", object: "customer" },
        })
      );

      expect(result).toBeNull();
    });

    it("returns null when customer is null", () => {
      const result = parseWebhookEvent(
        subscriptionEvent("customer.subscription.deleted", {
          customer: null,
        })
      );

      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // subscription.updated edge cases
  // -----------------------------------------------------------------------
  describe("customer.subscription.updated edge cases", () => {
    it("handles empty items.data array (returns planId null)", () => {
      const result = parseWebhookEvent(
        subscriptionEvent("customer.subscription.updated", {
          items: { data: [] },
        })
      );

      expect(result).not.toBeNull();
      const data = result!.data as { planId: string | null };
      // items.data[0] is undefined → priceId is undefined → no plan match
      expect(data.planId).toBeNull();
    });

    it("converts Unix timestamps to Date objects", () => {
      const start = 1700000000;
      const end = 1702592000;
      const result = parseWebhookEvent(
        subscriptionEvent("customer.subscription.updated", {
          current_period_start: start,
          current_period_end: end,
        })
      );

      expect(result).not.toBeNull();
      const data = result!.data as {
        currentPeriodStart: Date;
        currentPeriodEnd: Date;
      };
      expect(data.currentPeriodStart).toBeInstanceOf(Date);
      expect(data.currentPeriodEnd).toBeInstanceOf(Date);
      expect(data.currentPeriodStart.getTime()).toBe(start * 1000);
      expect(data.currentPeriodEnd.getTime()).toBe(end * 1000);
    });

    it("handles zero Unix timestamps", () => {
      const result = parseWebhookEvent(
        subscriptionEvent("customer.subscription.updated", {
          current_period_start: 0,
          current_period_end: 0,
        })
      );

      expect(result).not.toBeNull();
      const data = result!.data as {
        currentPeriodStart: Date;
        currentPeriodEnd: Date;
      };
      expect(data.currentPeriodStart.getTime()).toBe(0);
      expect(data.currentPeriodEnd.getTime()).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // checkout edge cases
  // -----------------------------------------------------------------------
  describe("checkout.session.completed edge cases", () => {
    it("returns null when metadata is null (no planId)", () => {
      const result = parseWebhookEvent(
        checkoutEvent({
          metadata: null,
          client_reference_id: "user_fallback",
        })
      );

      // planId is required — null metadata means planId is falsy → returns null
      expect(result).toBeNull();
    });

    it("returns null when metadata is empty (no userId or planId)", () => {
      const result = parseWebhookEvent(
        checkoutEvent({
          metadata: {},
          client_reference_id: null,
        })
      );

      // Both userId and planId are undefined → returns null
      expect(result).toBeNull();
    });

    it("returns null when customer is an expanded object", () => {
      const result = parseWebhookEvent(
        checkoutEvent({
          customer: { id: "cus_abc", object: "customer" },
        })
      );

      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Unknown event types
  // -----------------------------------------------------------------------
  describe("unknown event type", () => {
    it("returns null for an unhandled event type", () => {
      const result = parseWebhookEvent(
        makeEvent("payment_intent.succeeded", { id: "pi_123" })
      );

      expect(result).toBeNull();
    });

    it("returns null for another unhandled event type", () => {
      const result = parseWebhookEvent(
        makeEvent("charge.refunded", { id: "ch_123" })
      );

      expect(result).toBeNull();
    });
  });
});
