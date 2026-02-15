import { resend, EMAIL_FROM } from "./index";
import { render } from "@react-email/components";
import { JobAlertEmail } from "./templates/job-alert";
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
