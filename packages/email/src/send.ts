import { resend, EMAIL_FROM } from "./index";
import { render } from "@react-email/components";
import { JobAlertEmail } from "./templates/job-alert";
import { WelcomeEmail } from "./templates/welcome";
import { SubscriptionConfirmedEmail } from "./templates/subscription-confirmed";
import type React from "react";

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

  const { data, error } = await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject: `${jobs.length} new job${jobs.length !== 1 ? "s" : ""} matching "${alertCriteria}"`,
    html,
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }

  return data;
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
  loginUrl = "https://everjobs.ai/login",
}: SendWelcomeParams) {
  const element = WelcomeEmail({
    userName,
    loginUrl,
  }) as React.ReactElement;

  const html = await render(element);

  const { data, error } = await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject: "Welcome to Ever Jobs — Your AI Job Search Starts Now",
    html,
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }

  return data;
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
  dashboardUrl = "https://everjobs.ai/chat",
}: SendSubscriptionConfirmedParams) {
  const element = SubscriptionConfirmedEmail({
    userName,
    planName,
    dashboardUrl,
  }) as React.ReactElement;

  const html = await render(element);

  const { data, error } = await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject: `Your ${planName} subscription is active — Ever Jobs`,
    html,
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }

  return data;
}
