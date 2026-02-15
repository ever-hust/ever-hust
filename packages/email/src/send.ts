import { resend, EMAIL_FROM, getAppUrl } from "./index";
import { render } from "@react-email/components";
import { JobAlertEmail } from "./templates/job-alert";
import { WelcomeEmail } from "./templates/welcome";
import { SubscriptionConfirmedEmail } from "./templates/subscription-confirmed";
import type React from "react";

// ---------------------------------------------------------------------------
// Retry helper — exponential backoff (1s, 2s, 4s) with up to 3 attempts.
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

async function sendWithRetry(
  sendFn: () => Promise<{ data: unknown; error: { message: string } | null }>,
  context: string,
): Promise<unknown> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { data, error } = await sendFn();

      if (!error) return data;

      lastError = new Error(`Failed to send ${context}: ${error.message}`);
      console.warn(
        `[email] Attempt ${attempt}/${MAX_RETRIES} failed for ${context}: ${error.message}`,
      );
    } catch (err) {
      lastError =
        err instanceof Error
          ? err
          : new Error(`Failed to send ${context}: ${String(err)}`);
      console.warn(
        `[email] Attempt ${attempt}/${MAX_RETRIES} threw for ${context}: ${lastError.message}`,
      );
    }

    if (attempt < MAX_RETRIES) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// Job Alert Email
// ---------------------------------------------------------------------------

interface SendJobAlertParams {
  to: string;
  userName: string;
  alertCriteria: string;
  jobs: {
    title: string;
    companyName: string;
    location?: string;
    isRemote?: boolean;
    salary?: string;
    jobUrl: string;
  }[];
  manageUrl?: string;
  unsubscribeUrl?: string;
}

export async function sendJobAlertEmail({
  to,
  userName,
  alertCriteria,
  jobs,
  manageUrl,
  unsubscribeUrl,
}: SendJobAlertParams) {
  const appUrl = getAppUrl();
  if (!manageUrl) manageUrl = `${appUrl}/settings`;
  if (!unsubscribeUrl) unsubscribeUrl = `${appUrl}/settings`;
  const element = JobAlertEmail({
    userName,
    alertCriteria,
    jobs,
    manageUrl,
    unsubscribeUrl,
  }) as React.ReactElement;

  const html = await render(element);
  const subject = `${jobs.length} new job${jobs.length !== 1 ? "s" : ""} matching "${alertCriteria}"`;

  return sendWithRetry(
    () => resend.emails.send({ from: EMAIL_FROM, to, subject, html }),
    `job-alert to ${to}`,
  );
}

// ---------------------------------------------------------------------------
// Welcome Email
// ---------------------------------------------------------------------------

interface SendWelcomeParams {
  to: string;
  userName: string;
  loginUrl?: string;
}

export async function sendWelcomeEmail({
  to,
  userName,
  loginUrl,
}: SendWelcomeParams) {
  if (!loginUrl) loginUrl = `${getAppUrl()}/login`;
  const element = WelcomeEmail({
    userName,
    loginUrl,
  }) as React.ReactElement;

  const html = await render(element);

  return sendWithRetry(
    () =>
      resend.emails.send({
        from: EMAIL_FROM,
        to,
        subject: "Welcome to Ever Jobs \u2014 Your AI Job Search Starts Now",
        html,
      }),
    `welcome to ${to}`,
  );
}

// ---------------------------------------------------------------------------
// Subscription Confirmed Email
// ---------------------------------------------------------------------------

interface SendSubscriptionConfirmedParams {
  to: string;
  userName: string;
  planName: string;
  dashboardUrl?: string;
}

export async function sendSubscriptionConfirmedEmail({
  to,
  userName,
  planName,
  dashboardUrl,
}: SendSubscriptionConfirmedParams) {
  if (!dashboardUrl) dashboardUrl = `${getAppUrl()}/chat`;
  const element = SubscriptionConfirmedEmail({
    userName,
    planName,
    dashboardUrl,
  }) as React.ReactElement;

  const html = await render(element);

  return sendWithRetry(
    () =>
      resend.emails.send({
        from: EMAIL_FROM,
        to,
        subject: `Your ${planName} subscription is active \u2014 Ever Jobs`,
        html,
      }),
    `subscription-confirmed to ${to}`,
  );
}
