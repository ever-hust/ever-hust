/**
 * Whether the Ever Hust app offers anything for sale: the Pro subscription and credit top-ups.
 *
 * 🛑 OFF by default, and it must stay OFF until Ever Hust can actually take a payment.
 *
 * The billing audit of 2026-09-28 (findings PS-06 / others-09) found that Ever Hust has no
 * Stripe products or prices in either mode, no webhook endpoint and no STRIPE_* keys in any
 * environment. Every "Upgrade to Pro" and "Buy more credits" button in the app leads to
 * /api/stripe/*, which cannot create a session, and the limit messages tell free users to
 * upgrade to a plan nobody can buy.
 *
 * So while this flag is off:
 *   - no "Upgrade to Pro" button or link is rendered (chat limit banner, usage quota,
 *     subscription card, SubscriptionGate), and "Buy more credits" is hidden;
 *   - the copy that tells people to upgrade says "Pro plans are coming soon" instead, in the
 *     UI and in the API messages (daily message cap, out of credits, job alerts).
 * The Free plan's limits are unchanged; only the offer to pay is withdrawn.
 *
 * The chat banner is still classified as the daily cap, because classifyChatError() keys on
 * the structured `limitType: "messages"` the API returns, not on the wording of the message.
 *
 * Build-time (NEXT_PUBLIC_*), so client components and route handlers read the same value.
 * The docker-build-publish-* workflows pass the repository variable of the same name; an unset
 * variable bakes as empty. Anything other than the exact string "true" means off.
 */
export const PAYMENTS_ENABLED = process.env.NEXT_PUBLIC_HUST_PAYMENTS_ENABLED === "true";

export const PRO_COMING_SOON = "Pro plans are coming soon.";

/** Shown on the subscription card in place of the "Upgrade to Pro" button while payments are off. */
export const PRO_COMING_SOON_BUTTON = "Pro - coming soon";

/** 429 body when a free user hits the daily message cap (app/api/ai/chat). */
export function messageLimitMessage(enabled: boolean = PAYMENTS_ENABLED): string {
  return enabled
    ? "Daily message limit reached. Upgrade to Pro for unlimited messages."
    : "Daily message limit reached. Your free messages refill within 24 hours.";
}

/**
 * The chat banner's own fallback for the daily cap, used only when the 429 carries no message
 * (lib/chat-error.ts). The CTA button is gated separately; this keeps the text from advising it.
 */
export function messageLimitFallback(enabled: boolean = PAYMENTS_ENABLED): string {
  return enabled
    ? "You've reached today's free message limit. Upgrade to Pro for unlimited messages."
    : "You've reached today's free message limit. Your free messages refill within 24 hours.";
}

/** 402 body when credit enforcement is on and the balance is spent (app/api/ai/chat). */
export function outOfCreditsMessage(enabled: boolean = PAYMENTS_ENABLED): string {
  return enabled
    ? "You're out of credits. Upgrade to Pro or top up to keep using Hust AI."
    : "You're out of credits. Your free credits refill each month.";
}

/** 403 body when a free user tries to create a job alert (app/api/user/alerts). */
export function alertsRequireProMessage(enabled: boolean = PAYMENTS_ENABLED): string {
  return enabled
    ? "Upgrade to Pro to create job alerts."
    : `Job alerts are a Pro feature. ${PRO_COMING_SOON}`;
}

/** Toast when a free user picks a Pro-only AI model (settings). */
export function modelRequiresProMessage(enabled: boolean = PAYMENTS_ENABLED): string {
  return enabled
    ? "Upgrade to Pro to use this model"
    : `This model is part of Pro. ${PRO_COMING_SOON}`;
}

/** Default body of the SubscriptionGate card. */
export function proFeatureDescription(
  featureName: string,
  enabled: boolean = PAYMENTS_ENABLED,
): string {
  return enabled
    ? `${featureName} is a Pro feature. Upgrade to unlock unlimited access.`
    : `${featureName} is a Pro feature. ${PRO_COMING_SOON}`;
}
