import { getStripe } from "./index";
import { PLANS } from "./plans";

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

  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer: stripeCustomerId ?? undefined,
    customer_email: stripeCustomerId ? undefined : email,
    client_reference_id: userId,
    metadata: { userId, planId },
    subscription_data: {
      metadata: { userId, planId },
    },
  });

  return { url: session.url, sessionId: session.id };
}
