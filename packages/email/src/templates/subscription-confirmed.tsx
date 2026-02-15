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

interface SubscriptionConfirmedEmailProps {
  userName: string;
  planName: string;
  dashboardUrl: string;
}

export function SubscriptionConfirmedEmail({
  userName = "there",
  planName = "Pro Quarterly",
  dashboardUrl = "https://everjobs.ai/chat",
}: SubscriptionConfirmedEmailProps) {
  // Derive settings URL from dashboard URL base
  const settingsUrl = dashboardUrl.replace(/\/chat$/, "/settings");

  return (
    <Html>
      <Head />
      <Preview>Your {planName} subscription is active — unlock the full power of Ever Jobs</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Subscription Confirmed</Heading>

          <Text style={paragraph}>Hi {userName},</Text>

          <Text style={paragraph}>
            Your <strong>{planName}</strong> subscription is now active.
            Thank you for upgrading!
          </Text>

          <Hr style={hr} />

          <Section style={section}>
            <Text style={subheading}>What&apos;s now unlocked:</Text>
            <Text style={listItem}>
              <strong>Unlimited AI messages</strong> — No daily limits on chat.
            </Text>
            <Text style={listItem}>
              <strong>Unlimited job searches</strong> — Search as much as you
              need.
            </Text>
            <Text style={listItem}>
              <strong>Unlimited cover letters</strong> — Generate tailored
              letters for every application.
            </Text>
            <Text style={listItem}>
              <strong>Job alerts</strong> — Get notified when matching jobs are
              posted.
            </Text>
            <Text style={listItem}>
              <strong>AI agents</strong> — Application assistance and interview
              prep.
            </Text>
          </Section>

          <Hr style={hr} />

          <Section style={{ textAlign: "center" as const, padding: "0 40px" }}>
            <Link href={dashboardUrl} style={button}>
              Go to Dashboard
            </Link>
          </Section>

          <Text style={footer}>
            Manage your subscription anytime from{" "}
            <Link href={settingsUrl} style={link}>
              Settings
            </Link>
            .
          </Text>

          <Text style={footer}>
            Ever Jobs — Your AI-Powered Job Search Assistant
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

const section = {
  padding: "0 40px",
};

const subheading = {
  fontSize: "15px",
  fontWeight: "600" as const,
  color: "#484848",
  margin: "0 0 12px",
};

const listItem = {
  fontSize: "14px",
  lineHeight: "1.5",
  color: "#3c4149",
  margin: "0 0 10px",
};

const button = {
  backgroundColor: "#2563eb",
  borderRadius: "6px",
  color: "#fff",
  display: "inline-block",
  fontSize: "15px",
  fontWeight: "600" as const,
  lineHeight: "1",
  padding: "12px 24px",
  textDecoration: "none",
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
