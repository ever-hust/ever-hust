import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error("STRIPE_SECRET_KEY environment variable is not configured");
    }
    _stripe = new Stripe(secretKey, {
      apiVersion: "2025-02-24.acacia",
      typescript: true,
    });
  }
  return _stripe;
}

export { Stripe };
export { PLANS, FREE_LIMITS, type Plan } from "./plans";
export { createCheckoutSession } from "./checkout";
export { createCreditCheckoutSession, CREDIT_PACK_PRICE_ENV } from "./credits-checkout";
export { createPortalSession } from "./portal";
export { parseWebhookEvent, type StripeWebhookEvent } from "./webhook";
