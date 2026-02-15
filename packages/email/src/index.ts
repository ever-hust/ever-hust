import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY);

export const EMAIL_FROM = process.env.EMAIL_FROM ?? "alerts@everjobs.ai";

/** Base app URL from env, used for all email links */
export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://everjobs.ai";
}

export { sendJobAlertEmail, sendWelcomeEmail, sendSubscriptionConfirmedEmail } from "./send";
export { JobAlertEmail } from "./templates/job-alert";
export { WelcomeEmail } from "./templates/welcome";
export { SubscriptionConfirmedEmail } from "./templates/subscription-confirmed";
