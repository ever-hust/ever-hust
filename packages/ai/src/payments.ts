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

/**
 * A Pro-only tool's refusal for a free user (applyJob, interviewPrep, submitAnswers). The tools
 * also return requiresUpgrade: true, which the model reads as "tell them to upgrade" - so while
 * payments are off the error itself says not to.
 *
 * @param onSale the original refusal, returned unchanged while payments are on
 */
export function proOnlyToolError(onSale: string): string {
  return paymentsEnabled()
    ? onSale
    : `${onSale.replace(/\.\s*$/, "")}, and Pro plans are not on sale yet. ` +
        "Do not suggest upgrading or paying.";
}

/**
 * Appended to the orchestrator system prompt while payments are off. The default prompt (and the
 * Langfuse copy derived from it) says "Only Pro subscribers can..." and, for job alerts,
 * "suggest upgrading"; this overrides that advice without editing the prompt text itself, so
 * turning payments on restores the authored prompt exactly.
 */
export const PAYMENTS_OFF_PROMPT_NOTE =
  "## Payments\n" +
  "Pro plans are not on sale yet: nobody can upgrade, subscribe or buy credits today. " +
  "Never suggest upgrading, subscribing, paying or topping up, even where an instruction above says to. " +
  "When a feature is Pro-only, say it is part of Pro, which is coming soon, and offer what the free plan can do instead.";

/** The orchestrator prompt as the assistant should receive it for the current flag state. */
export function withPaymentsNote(prompt: string): string {
  return paymentsEnabled() ? prompt : `${prompt}\n\n${PAYMENTS_OFF_PROMPT_NOTE}`;
}

/** The create-alert tool's refusal for a free user. */
export function alertsRequireProError(): string {
  return paymentsEnabled()
    ? "Job alerts require a Pro subscription. Upgrade to get alerts."
    : "Job alerts require a Pro subscription, and Pro plans are not on sale yet. " +
        "Do not suggest upgrading or paying.";
}
