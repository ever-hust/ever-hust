import { Resend } from "resend";

let _resend: Resend | null = null;

/** Lazy-initialized Resend client (avoids throwing at module import time during build) */
export function getResend(): Resend {
  if (!_resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error(
        "RESEND_API_KEY environment variable is not configured. " +
          "Email sending is unavailable."
      );
    }
    _resend = new Resend(apiKey);
  }
  return _resend;
}

export const EMAIL_FROM = process.env.EMAIL_FROM ?? "alerts@hust.so";

/** Get the base app URL for links in emails */
export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://hust.so";
}

export { sendJobAlertEmail, sendWelcomeEmail, sendSubscriptionConfirmedEmail, sendVerificationEmail } from "./send";
export { JobAlertEmail } from "./templates/job-alert";
export { WelcomeEmail } from "./templates/welcome";
export { SubscriptionConfirmedEmail } from "./templates/subscription-confirmed";
export { VerificationEmail } from "./templates/verification-email";
