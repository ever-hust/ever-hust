import { getStripe } from "./index";

/**
 * Credit packs. Prices are **auto-provisioned** in the connected Stripe account
 * on first use (looked up by `lookupKey`, created if absent), so neither Hust nor
 * self-hosters need to pre-create products or set price-ID env vars — just
 * STRIPE_SECRET_KEY. An explicit `STRIPE_CREDITS_<PACK>_PRICE_ID` env still wins
 * if you'd rather manage the price yourself.
 *
 * `amountCents` = price in USD cents; `credits` are granted on payment
 * (1000 credits = $1, so amount and credits stay in sync if you tune them).
 */
export const CREDIT_PACKS: Record<string, { credits: number; amountCents: number; lookupKey: string }> = {
  small: { credits: 5000, amountCents: 500, lookupKey: "hust_credits_small" },
  medium: { credits: 12000, amountCents: 1200, lookupKey: "hust_credits_medium" },
  large: { credits: 30000, amountCents: 3000, lookupKey: "hust_credits_large" },
};

/** Find-or-create the shared "Hust AI Credits" product. */
async function ensureCreditProduct(): Promise<string> {
  const stripe = getStripe();
  try {
    const found = await stripe.products.search({
      query: "metadata['hust_credits']:'1' AND active:'true'",
      limit: 1,
    });
    if (found.data[0]) return found.data[0].id;
  } catch {
    // Search API unavailable on some accounts — fall through to create.
  }
  const product = await stripe.products.create({
    name: "Hust AI Credits",
    metadata: { hust_credits: "1" },
  });
  return product.id;
}

/** Resolve a pack's Stripe price id: env override → lookup_key → create. */
async function ensureCreditPriceId(packId: string): Promise<string> {
  const pack = CREDIT_PACKS[packId];
  if (!pack) throw new Error(`Invalid credit pack: ${packId}`);

  const envOverride = process.env[`STRIPE_CREDITS_${packId.toUpperCase()}_PRICE_ID`];
  if (envOverride) return envOverride;

  const stripe = getStripe();
  const existing = await stripe.prices.list({ lookup_keys: [pack.lookupKey], active: true, limit: 1 });
  if (existing.data[0]) return existing.data[0].id;

  const productId = await ensureCreditProduct();
  const price = await stripe.prices.create({
    product: productId,
    currency: "usd",
    unit_amount: pack.amountCents,
    lookup_key: pack.lookupKey,
    nickname: `${pack.credits.toLocaleString()} Hust credits`,
    metadata: { credits: String(pack.credits) },
  });
  return price.id;
}

/**
 * One-time Stripe Checkout for a credit top-up. The granted credit amount is
 * carried in `metadata.credits` so the webhook can credit the ledger after
 * payment. Auto-provisions the price if needed.
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
  const pack = CREDIT_PACKS[packId];
  if (!pack) throw new Error(`Invalid credit pack: ${packId}`);

  const priceId = await ensureCreditPriceId(packId);

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
