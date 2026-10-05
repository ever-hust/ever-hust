import { getStripe } from "./index";
import { CLOUD_TRIAL_DAYS, PLANS } from "./plans";

/**
 * Marks a Checkout Session / subscription as Hust's own. The Stripe account is
 * shared by every Ever product, so Hust's webhook receives every product's
 * events; it only acts on a completed checkout that carries this marker.
 */
export const HUST_APP_MARKER = { app: "hust" } as const;

/**
 * Whether Stripe calculates and collects tax (VAT). OFF unless
 * STRIPE_AUTOMATIC_TAX=true, the same switch as the ever.co checkout, so it
 * stays a reversible config change. With it on, Checkout collects the billing
 * address it needs and saves it on an existing customer.
 */
function automaticTaxEnabled(): boolean {
  return process.env.STRIPE_AUTOMATIC_TAX?.trim().toLowerCase() === "true";
}

/**
 * Create a Checkout Session for Cloud Pro (monthly or annual). Cloud Pro starts
 * with a 90-day free trial: the card is taken now and charged when the trial
 * ends. Self-hosted Pro is sold on the ever.co checkout, never here.
 */
export async function createCheckoutSession({
  userId,
  email,
  planId,
  successUrl,
  cancelUrl,
  stripeCustomerId,
}: {
  userId: string;
  email: string;
  planId: string;
  successUrl: string;
  cancelUrl: string;
  stripeCustomerId?: string | null;
}) {
  const plan = PLANS.find((p) => p.id === planId);
  if (!plan) {
    throw new Error(`Invalid plan: ${planId}`);
  }
  if (!plan.stripePriceId) {
    throw new Error(`No Stripe price ID configured for plan: ${planId}`);
  }

  const tax = automaticTaxEnabled();
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    // A trial takes a card up front: one that takes none could be restarted
    // endlessly. Nothing is charged until the trial ends.
    payment_method_collection: "always",
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer: stripeCustomerId ?? undefined,
    customer_email: stripeCustomerId ? undefined : email,
    client_reference_id: userId,
    metadata: { userId, planId, ...HUST_APP_MARKER },
    subscription_data: {
      trial_period_days: CLOUD_TRIAL_DAYS,
      metadata: { userId, planId, ...HUST_APP_MARKER },
    },
    ...(tax ? { automatic_tax: { enabled: true } } : {}),
    ...(tax && stripeCustomerId
      ? { customer_update: { address: "auto" as const, name: "auto" as const } }
      : {}),
  });

  return { url: session.url, sessionId: session.id };
}
