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
import { APP_NAME } from "@ever-hust/utils";

interface NudgeItem {
  jobTitle: string;
  companyName: string;
  stage: string;
  daysSinceActivity: number;
  overdue: boolean;
}

interface FollowUpNudgeEmailProps {
  userName: string;
  items: NudgeItem[];
  pipelineUrl: string;
  settingsUrl: string;
}

/** Spec #9 — a polite, capped digest reminding the seeker which applications are due a follow-up. */
export function FollowUpNudgeEmail({
  userName = "there",
  items = [],
  pipelineUrl = "https://app.hust.so/applications",
  settingsUrl = "https://app.hust.so/settings",
}: FollowUpNudgeEmailProps) {
  const n = items.length;
  return (
    <Html>
      <Head />
      <Preview>
        {`${n} application${n !== 1 ? "s" : ""} ready for a follow-up`}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Time for a follow-up</Heading>

          <Text style={paragraph}>Hi {userName},</Text>

          <Text style={paragraph}>
            {n === 1 ? "One application is" : `${n} applications are`} due a gentle nudge — a
            timely, polite follow-up meaningfully improves response rates.
          </Text>

          <Hr style={hr} />

          {items.map((item, i) => (
            <Section key={i} style={card}>
              <Text style={cardTitle}>
                {item.jobTitle} · {item.companyName}
              </Text>
              <Text style={cardMeta}>
                {item.stage}
                {" · "}
                {item.overdue ? "overdue — " : ""}
                {item.daysSinceActivity} day{item.daysSinceActivity !== 1 ? "s" : ""} since last
                activity
              </Text>
            </Section>
          ))}

          <Hr style={hr} />

          <Text style={paragraph}>
            <Link href={pipelineUrl} style={link}>
              Open your pipeline
            </Link>
            {" · "}
            <Link href={settingsUrl} style={link}>
              Turn off these reminders
            </Link>
          </Text>

          <Text style={footer}>{APP_NAME} · The Anti-Hustle Career OS</Text>
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

const hr = { borderColor: "#dfe1e4", margin: "20px 40px" };

const card = { padding: "0 40px", marginBottom: "12px" };

const cardTitle = { fontSize: "15px", fontWeight: "600" as const, margin: "0 0 4px" };

const cardMeta = { fontSize: "13px", color: "#6b7280", margin: "0", textTransform: "capitalize" as const };

const link = { color: "#2563eb", textDecoration: "none" };

const footer = {
  fontSize: "12px",
  color: "#9ca3af",
  textAlign: "center" as const,
  padding: "0 40px",
  marginTop: "20px",
};
