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

/** Error subclass that preserves the HTTP status code (and Resend error name) from the Resend API. */
class EmailSendError extends Error {
  readonly statusCode?: number;
  /** Resend's error name, e.g. `rate_limit_exceeded`. */
  readonly code?: string;
  constructor(message: string, statusCode?: number, code?: string) {
    super(message);
    this.name = "EmailSendError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

// ── Idempotent sends ──────────────────────────────────────────────────────────

/**
 * Resend errors meaning "a request with this idempotency key was already accepted": the same key
 * with a different payload (409 `invalid_idempotent_request`, e.g. the matching jobs changed
 * between two attempts) or while the first request is still being processed (409
 * `concurrent_idempotent_requests`). Resend remembers a key for 24 h. The same key with the same
 * payload is not an error: Resend answers with the original response and sends nothing new.
 */
const IDEMPOTENT_REPLAY_ERRORS = new Set(["invalid_idempotent_request", "concurrent_idempotent_requests"]);

/** Returned instead of throwing when Resend says this idempotency key was already used. */
export interface DeduplicatedEmail {
  id: null;
  deduplicated: true;
}

const DEDUPLICATED: DeduplicatedEmail = { id: null, deduplicated: true };

/** True when a send result is {@link DeduplicatedEmail} (nothing new was sent). */
export function isDeduplicatedEmail(result: unknown): result is DeduplicatedEmail {
  return (result as { deduplicated?: unknown } | null)?.deduplicated === true;
}

type SendEmailResult = Awaited<ReturnType<ReturnType<typeof getResend>["emails"]["send"]>>;

/**
 * One Resend `emails.send` call. With an `idempotencyKey` (sent as the `Idempotency-Key` header),
 * a retry of a request Resend already accepted — a lost response, a timeout, a Trigger.dev retry —
 * cannot send the email twice, and a 409 replay error comes back as {@link DeduplicatedEmail}.
 */
async function sendOnce(
  payload: Parameters<ReturnType<typeof getResend>["emails"]["send"]>[0],
  errorPrefix: string,
  idempotencyKey?: string,
): Promise<SendEmailResult["data"] | DeduplicatedEmail> {
  const resend = getResend();
  const { data, error } = idempotencyKey
    ? await resend.emails.send(payload, { idempotencyKey })
    : await resend.emails.send(payload);
  if (error) {
    const code = (error as { name?: string }).name;
    if (idempotencyKey && code && IDEMPOTENT_REPLAY_ERRORS.has(code)) return DEDUPLICATED;
    throw new EmailSendError(
      `${errorPrefix}: ${error.message ?? "Unknown error"}`,
      (error as { statusCode?: number }).statusCode,
      code,
    );
  }
  return data;
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
  /** Resend idempotency key; keep it identical for every retry of the same alert period. */
  idempotencyKey?: string;
}

export async function sendJobAlertEmail({
  to,
  userName,
  alertCriteria,
  jobs,
  manageUrl,
  unsubscribeUrl,
  idempotencyKey,
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

  return withRetry(
    () => sendOnce({ from: EMAIL_FROM, to, subject, html }, "Failed to send job alert email", idempotencyKey),
    "sendJobAlertEmail",
  );
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
  /** Resend idempotency key; keep it identical for every retry of the same cooldown window. */
  idempotencyKey?: string;
}

export async function sendFollowUpNudgeEmail({
  to,
  userName,
  items,
  pipelineUrl,
  settingsUrl,
  idempotencyKey,
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

  return withRetry(
    () => sendOnce({ from: EMAIL_FROM, to, subject, html }, "Failed to send follow-up nudge email", idempotencyKey),
    "sendFollowUpNudgeEmail",
  );
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
