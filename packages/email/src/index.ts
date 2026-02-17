import { Resend } from "resend";

let _resend: Resend | null = null;

/** Lazy-initialized Resend client (avoids throwing at module import time during build) */
export function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

/** @deprecated Use getResend() instead for build-safe lazy init */
export const resend = {
  get emails() {
    return getResend().emails;
  },
};

export const EMAIL_FROM = process.env.EMAIL_FROM ?? "alerts@everjobs.ai";

/** Get the base app URL for links in emails */
export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://everjobs.ai";
}

export { sendJobAlertEmail, sendWelcomeEmail, sendSubscriptionConfirmedEmail } from "./send";
export { JobAlertEmail } from "./templates/job-alert";
export { WelcomeEmail } from "./templates/welcome";
export { SubscriptionConfirmedEmail } from "./templates/subscription-confirmed";
