import { getStripe } from "./index";

/** Credit pack id → env var holding its Stripe (one-time) price id + credits. */
export const CREDIT_PACK_PRICE_ENV: Record<string, { env: string; credits: number }> = {
  small: { env: "STRIPE_CREDITS_SMALL_PRICE_ID", credits: 5000 },
  medium: { env: "STRIPE_CREDITS_MEDIUM_PRICE_ID", credits: 12000 },
  large: { env: "STRIPE_CREDITS_LARGE_PRICE_ID", credits: 30000 },
};

/**
 * One-time Stripe Checkout for a credit top-up. The granted credit amount is
 * carried in `metadata.credits` so the webhook can credit the ledger after
 * payment. Throws if the pack or its price id isn't configured.
 */
export async function createCreditCheckoutSession({
  userId,
  email,
  packId,
  successUrl,
  cancelUrl,
  stripeCustomerId,
}: {
  userId: string;
  email: string;
  packId: string;
  successUrl: string;
  cancelUrl: string;
  stripeCustomerId?: string | null;
}) {
  const pack = CREDIT_PACK_PRICE_ENV[packId];
  if (!pack) throw new Error(`Invalid credit pack: ${packId}`);
  const priceId = process.env[pack.env];
  if (!priceId) throw new Error(`Credit top-up not configured (${pack.env} unset)`);

  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer: stripeCustomerId ?? undefined,
    customer_email: stripeCustomerId ? undefined : email,
    client_reference_id: userId,
    metadata: { userId, type: "credits", packId, credits: String(pack.credits) },
  });

  return { url: session.url, sessionId: session.id };
}
