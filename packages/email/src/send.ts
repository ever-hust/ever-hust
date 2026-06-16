import { getResend, EMAIL_FROM, getAppUrl } from "./index";
import { render } from "@react-email/components";
import { JobAlertEmail } from "./templates/job-alert";
import { FollowUpNudgeEmail } from "./templates/follow-up-nudge";
import { WelcomeEmail } from "./templates/welcome";
import { SubscriptionConfirmedEmail } from "./templates/subscription-confirmed";
import { VerificationEmail } from "./templates/verification-email";
import type React from "react";
import { APP_NAME } from "@ever-hust/utils";

// ── Retry Utility ─────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

/** HTTP status codes that are safe to retry. */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/** Error subclass that preserves the HTTP status code from the Resend API. */
class EmailSendError extends Error {
  readonly statusCode?: number;
  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "EmailSendError";
    this.statusCode = statusCode;
  }
}

/** Check whether an error is retryable (network issue or server error). */
function isRetryableError(err: Error): boolean {
  // Structured status code from EmailSendError
  if (err instanceof EmailSendError && err.statusCode != null) {
    return RETRYABLE_STATUS_CODES.has(err.statusCode);
  }
  // Network-level errors that don't have a status code
  const msg = err.message.toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("network") ||
    msg.includes("fetch failed")
  );
}

/**
 * Retry wrapper with exponential backoff + jitter for transient email failures.
 * Only retries on rate-limit (429), server errors (5xx), or network failures.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  retries = MAX_RETRIES
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (!isRetryableError(lastError) || attempt === retries) {
        throw lastError;
      }

      // Exponential backoff with jitter: 500ms, 1s, 2s (+ random 0–200ms)
      const delay =
        BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 200;
      console.warn(
        `[Email] ${label} attempt ${attempt + 1} failed, retrying in ${Math.round(delay)}ms: ${lastError.message}`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError ?? new Error(`${label} failed after ${retries} retries`);
}

// ── Job Alert Email ─────────────────────────────────────────────────────────

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

  return withRetry(async () => {
    const { data, error } = await getResend().emails.send({
      from: EMAIL_FROM,
      to,
      subject,
      html,
    });

    if (error) {
      throw new EmailSendError(
        `Failed to send job alert email: ${error.message ?? "Unknown error"}`,
        (error as { statusCode?: number }).statusCode,
      );
    }

    return data;
  }, "sendJobAlertEmail");
}

// ── Follow-up Nudge Email (spec #9) ───────────────────────────────────────────

interface SendFollowUpNudgeParams {
  to: string;
  userName: string;
  items: {
    jobTitle: string;
    companyName: string;
    stage: string;
    daysSinceActivity: number;
    overdue: boolean;
  }[];
  pipelineUrl?: string;
  settingsUrl?: string;
}

export async function sendFollowUpNudgeEmail({
  to,
  userName,
  items,
  pipelineUrl,
  settingsUrl,
}: SendFollowUpNudgeParams) {
  const appUrl = getAppUrl();
  const element = FollowUpNudgeEmail({
    userName,
    items,
    pipelineUrl: pipelineUrl ?? `${appUrl}/applications`,
    settingsUrl: settingsUrl ?? `${appUrl}/settings`,
  }) as React.ReactElement;

  const html = await render(element);
  const n = items.length;
  const subject = `${n} application${n !== 1 ? "s" : ""} ready for a follow-up`;

  return withRetry(async () => {
    const { data, error } = await getResend().emails.send({
      from: EMAIL_FROM,
      to,
      subject,
      html,
    });
    if (error) {
      throw new EmailSendError(
        `Failed to send follow-up nudge email: ${error.message ?? "Unknown error"}`,
        (error as { statusCode?: number }).statusCode,
      );
    }
    return data;
  }, "sendFollowUpNudgeEmail");
}

// ── Welcome Email ───────────────────────────────────────────────────────────

interface SendWelcomeParams {
  to: string;
  userName: string;
  chatUrl?: string;
}

export async function sendWelcomeEmail({
  to,
  userName,
  chatUrl,
}: SendWelcomeParams) {
  if (!chatUrl) chatUrl = `${getAppUrl()}/chat`;
  const element = WelcomeEmail({
    userName,
    chatUrl,
  }) as React.ReactElement;

  const html = await render(element);

  return withRetry(async () => {
    const { data, error } = await getResend().emails.send({
      from: EMAIL_FROM,
      to,
      subject: `Welcome to ${APP_NAME} — your AI job search assistant`,
      html,
    });

    if (error) {
      throw new EmailSendError(
        `Failed to send welcome email: ${error.message ?? "Unknown error"}`,
        (error as { statusCode?: number }).statusCode,
      );
    }

    return data;
  }, "sendWelcomeEmail");
}

// ── Subscription Confirmed Email ────────────────────────────────────────────

interface SendSubscriptionConfirmedParams {
  to: string;
  userName: string;
  planName: string;
  amount: string;
  billingCycle: string;
  chatUrl?: string;
  manageUrl?: string;
}

export async function sendSubscriptionConfirmedEmail({
  to,
  userName,
  planName,
  amount,
  billingCycle,
  chatUrl,
  manageUrl,
}: SendSubscriptionConfirmedParams) {
  const appUrl = getAppUrl();
  if (!chatUrl) chatUrl = `${appUrl}/chat`;
  if (!manageUrl) manageUrl = `${appUrl}/settings`;
  const element = SubscriptionConfirmedEmail({
    userName,
    planName,
    amount,
    billingCycle,
    chatUrl,
    manageUrl,
  }) as React.ReactElement;

  const html = await render(element);

  return withRetry(async () => {
    const { data, error } = await getResend().emails.send({
      from: EMAIL_FROM,
      to,
      subject: `Your ${APP_NAME} Pro subscription is active — ${planName} plan`,
      html,
    });

    if (error) {
      throw new EmailSendError(
        `Failed to send subscription email: ${error.message ?? "Unknown error"}`,
        (error as { statusCode?: number }).statusCode,
      );
    }

    return data;
  }, "sendSubscriptionConfirmedEmail");
}

// ── Email Verification ──────────────────────────────────────────────────────

interface SendVerificationEmailParams {
  to: string;
  userName: string;
  verificationUrl: string;
}

export async function sendVerificationEmail({
  to,
  userName,
  verificationUrl,
}: SendVerificationEmailParams) {
  const element = VerificationEmail({
    userName,
    verificationUrl,
  }) as React.ReactElement;

  const html = await render(element);

  return withRetry(async () => {
    const { data, error } = await getResend().emails.send({
      from: EMAIL_FROM,
      to,
      subject: `Verify your email — ${APP_NAME}`,
      html,
    });

    if (error) {
      throw new EmailSendError(
        `Failed to send verification email: ${error.message ?? "Unknown error"}`,
        (error as { statusCode?: number }).statusCode,
      );
    }

    return data;
  }, "sendVerificationEmail");
}
