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
export {
  PLANS,
  FREE_LIMITS,
  GATED_PLANS,
  CLOUD_TRIAL_DAYS,
  PRO_MONTHLY_USD,
  yearlyMonthlyUsd,
  type Plan,
} from "./plans";
export { createCheckoutSession, HUST_APP_MARKER } from "./checkout";
export { createCreditCheckoutSession, CREDIT_PACKS } from "./credits-checkout";
export { createPortalSession } from "./portal";
export { parseWebhookEvent, type StripeWebhookEvent } from "./webhook";
