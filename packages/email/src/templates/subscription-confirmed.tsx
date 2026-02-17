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
  Button,
} from "@react-email/components";
import * as React from "react";

interface SubscriptionConfirmedEmailProps {
  userName: string;
  planName: string;
  amount: string;
  billingCycle: string;
  chatUrl: string;
  manageUrl: string;
}

export function SubscriptionConfirmedEmail({
  userName = "there",
  planName = "Quarterly",
  amount = "$12/month",
  billingCycle = "$36 billed every 3 months",
  chatUrl = "https://everjobs.ai/chat",
  manageUrl = "https://everjobs.ai/settings",
}: SubscriptionConfirmedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your Ever Jobs Pro subscription is active</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>You&apos;re Now Pro! 🎉</Heading>

          <Text style={paragraph}>Hi {userName},</Text>

          <Text style={paragraph}>
            Your Ever Jobs Pro subscription is now active. Here&apos;s a summary
            of your plan:
          </Text>

          <Section style={planCard}>
            <Text style={planName_}>
              <strong>{planName} Plan</strong>
            </Text>
            <Text style={planDetail}>{amount}</Text>
            <Text style={planDetail}>{billingCycle}</Text>
          </Section>

          <Text style={paragraph}>
            With Pro, you now have access to everything:
          </Text>

          <Section style={featureList}>
            <Text style={featureItem}>
              ✅ <strong>Unlimited AI messages</strong> — No daily limits
            </Text>
            <Text style={featureItem}>
              ✅ <strong>Unlimited job searches</strong> — Search across 25+
              sources
            </Text>
            <Text style={featureItem}>
              ✅ <strong>Unlimited cover letters</strong> — Generate as many as
              you need
            </Text>
            <Text style={featureItem}>
              ✅ <strong>Job alerts</strong> — Get notified when matching jobs
              appear
            </Text>
            <Text style={featureItem}>
              ✅ <strong>Interview prep</strong> — AI-powered interview coaching
            </Text>
            <Text style={featureItem}>
              ✅ <strong>Application agent</strong> — Let AI help you apply
            </Text>
            <Text style={featureItem}>
              ✅ <strong>Claude Opus 4.6</strong> — Our most capable AI model
            </Text>
          </Section>

          <Section style={ctaSection}>
            <Button href={chatUrl} style={button}>
              Start Using Pro Features
            </Button>
          </Section>

          <Hr style={hr} />

          <Text style={paragraph}>
            You can manage your subscription, change plans, or update payment
            details at any time from your{" "}
            <Link href={manageUrl} style={link}>
              settings page
            </Link>
            .
          </Text>

          <Hr style={hr} />

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
  fontSize: "28px",
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

const planCard = {
  backgroundColor: "#f9fafb",
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  margin: "0 40px 20px",
  padding: "16px 20px",
  textAlign: "center" as const,
};

const planName_ = {
  fontSize: "16px",
  color: "#111827",
  margin: "0 0 4px",
};

const planDetail = {
  fontSize: "14px",
  color: "#6b7280",
  margin: "0",
};

const featureList = {
  padding: "0 40px",
};

const featureItem = {
  fontSize: "14px",
  lineHeight: "1.5",
  color: "#3c4149",
  margin: "0 0 8px",
};

const ctaSection = {
  textAlign: "center" as const,
  margin: "24px 0",
};

const button = {
  backgroundColor: "#000000",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: "600" as const,
  textDecoration: "none",
  textAlign: "center" as const,
  display: "inline-block",
  padding: "12px 24px",
};

const hr = {
  borderColor: "#dfe1e4",
  margin: "20px 40px",
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
