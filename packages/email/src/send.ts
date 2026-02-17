import { resend, EMAIL_FROM } from "./index";
import { render } from "@react-email/components";
import { JobAlertEmail } from "./templates/job-alert";
import { WelcomeEmail } from "./templates/welcome";
import { SubscriptionConfirmedEmail } from "./templates/subscription-confirmed";
import type React from "react";

// ── Retry Utility ─────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

/**
 * Retry wrapper with exponential backoff + jitter for transient email failures.
 * Only retries on rate-limit (429) or server errors (5xx).
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

      // Don't retry on validation / 4xx errors (except 429 rate limit)
      const message = lastError.message.toLowerCase();
      const isRetryable =
        message.includes("429") ||
        message.includes("rate") ||
        message.includes("500") ||
        message.includes("502") ||
        message.includes("503") ||
        message.includes("504") ||
        message.includes("timeout") ||
        message.includes("econnreset") ||
        message.includes("network");

      if (!isRetryable || attempt === retries) {
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
  manageUrl = "https://everjobs.ai/settings",
  unsubscribeUrl = "https://everjobs.ai/settings",
}: SendJobAlertParams) {
  const element = JobAlertEmail({
    userName,
    alertCriteria,
    jobs,
    manageUrl,
    unsubscribeUrl,
  }) as React.ReactElement;

  const html = await render(element);

  return withRetry(async () => {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject: `${jobs.length} new job${jobs.length !== 1 ? "s" : ""} matching "${alertCriteria}"`,
      html,
    });

    if (error) {
      throw new Error(`Failed to send job alert email: ${error.message}`);
    }

    return data;
  }, "sendJobAlertEmail");
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
  chatUrl = "https://everjobs.ai/chat",
}: SendWelcomeParams) {
  const element = WelcomeEmail({
    userName,
    chatUrl,
  }) as React.ReactElement;

  const html = await render(element);

  return withRetry(async () => {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject: "Welcome to Ever Jobs — your AI job search assistant",
      html,
    });

    if (error) {
      throw new Error(`Failed to send welcome email: ${error.message}`);
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
  chatUrl = "https://everjobs.ai/chat",
  manageUrl = "https://everjobs.ai/settings",
}: SendSubscriptionConfirmedParams) {
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
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject: `Your Ever Jobs Pro subscription is active — ${planName} plan`,
      html,
    });

    if (error) {
      throw new Error(`Failed to send subscription email: ${error.message}`);
    }

    return data;
  }, "sendSubscriptionConfirmedEmail");
}
