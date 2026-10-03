/**
 * Whether Ever Hust sells Pro yet, for the AI layer.
 *
 * The same build-time flag as apps/web/lib/payments.ts: NEXT_PUBLIC_HUST_PAYMENTS_ENABLED, OFF
 * unless it is exactly "true". While it is off the assistant must not tell anyone to upgrade
 * to a plan nobody can buy (billing audit 2026-09-28, PS-06 / others-09). Free-tier limits
 * are unchanged; only the advice to pay is withdrawn.
 *
 * Read on every call rather than once at import, so tests can flip it.
 */
export function paymentsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_HUST_PAYMENTS_ENABLED === "true";
}

/**
 * What a free-tier limit message asks the assistant to tell the user.
 *
 * @param unlimited what Pro removes the cap on, e.g. "searches"
 * @param resetsWithin when the free allowance comes back, e.g. "a day"
 */
export function freeLimitGuidance(unlimited: string, resetsWithin: string): string {
  return paymentsEnabled()
    ? `Let them know they can upgrade to Pro for unlimited ${unlimited}.`
    : `Let them know the free allowance resets within ${resetsWithin}. ` +
        "Do not suggest upgrading or paying: Pro plans are not on sale yet.";
}

/** The create-alert tool's refusal for a free user. */
export function alertsRequireProError(): string {
  return paymentsEnabled()
    ? "Job alerts require a Pro subscription. Upgrade to get alerts."
    : "Job alerts require a Pro subscription, and Pro plans are not on sale yet. " +
        "Do not suggest upgrading or paying.";
}
