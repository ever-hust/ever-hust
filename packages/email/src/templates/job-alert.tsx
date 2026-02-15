import {
  Html,
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

interface JobAlertJob {
  title: string;
  companyName: string;
  location?: string;
  isRemote?: boolean;
  salary?: string;
  jobUrl: string;
}

interface JobAlertEmailProps {
  userName: string;
  alertCriteria: string;
  jobs: JobAlertJob[];
  manageUrl: string;
  unsubscribeUrl: string;
}

export function JobAlertEmail({
  userName = "Job Seeker",
  alertCriteria = "Software Engineer in San Francisco",
  jobs = [],
  manageUrl = "https://everjobs.ai/settings",
  unsubscribeUrl = "https://everjobs.ai/settings",
}: JobAlertEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {jobs.length} new job{jobs.length !== 1 ? "s" : ""} matching your alert
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>New Jobs for You</Heading>

          <Text style={paragraph}>Hi {userName},</Text>

          <Text style={paragraph}>
            We found <strong>{jobs.length}</strong> new job
            {jobs.length !== 1 ? "s" : ""} matching your alert for &quot;
            {alertCriteria}&quot;.
          </Text>

          <Hr style={hr} />

          {jobs.map((job, i) => (
            <Section key={i} style={jobCard}>
              <Text style={jobTitle}>
                <Link href={job.jobUrl} style={link}>
                  {job.title}
                </Link>
              </Text>
              <Text style={jobMeta}>
                {job.companyName}
                {job.location ? ` · ${job.location}` : ""}
                {job.isRemote ? " · Remote" : ""}
                {job.salary ? ` · ${job.salary}` : ""}
              </Text>
            </Section>
          ))}

          <Hr style={hr} />

          <Text style={paragraph}>
            <Link href={manageUrl} style={link}>
              Manage alerts
            </Link>
            {" · "}
            <Link href={unsubscribeUrl} style={link}>
              Unsubscribe
            </Link>
          </Text>

          <Text style={footer}>
            Ever Jobs · Your AI-Powered Job Search Assistant
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "20px 0 48px",
  marginBottom: "64px",
  maxWidth: "600px",
};

const heading = {
  fontSize: "24px",
  letterSpacing: "-0.5px",
  lineHeight: "1.3",
  fontWeight: "700" as const,
  color: "#484848",
  padding: "17px 0 0",
  textAlign: "center" as const,
};

const paragraph = {
  margin: "0 0 15px",
  fontSize: "15px",
  lineHeight: "1.4",
  color: "#3c4149",
  padding: "0 40px",
};

const hr = {
  borderColor: "#dfe1e4",
  margin: "20px 40px",
};

const jobCard = {
  padding: "0 40px",
  marginBottom: "12px",
};

const jobTitle = {
  fontSize: "15px",
  fontWeight: "600" as const,
  margin: "0 0 4px",
};

const jobMeta = {
  fontSize: "13px",
  color: "#6b7280",
  margin: "0",
};

const link = {
  color: "#2563eb",
  textDecoration: "none",
};

const footer = {
  fontSize: "12px",
  color: "#9ca3af",
  textAlign: "center" as const,
  padding: "0 40px",
  marginTop: "20px",
};
