import {
  Html,
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Preview,
  Section,
  Text,
  Button,
} from "@react-email/components";
import * as React from "react";
import { APP_NAME } from "@ever-hust/utils";

interface VerificationEmailProps {
  userName: string;
  verificationUrl: string;
}

export function VerificationEmail({
  userName = "there",
  verificationUrl = "https://everjobs.ai/verify-email?token=xxx",
}: VerificationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Verify your email to get started with {APP_NAME}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Verify your email</Heading>

          <Text style={paragraph}>Hi {userName},</Text>

          <Text style={paragraph}>
            Thanks for creating an account with {APP_NAME}! Please verify your
            email address to activate your account and start your AI-powered job
            search.
          </Text>

          <Section style={ctaSection}>
            <Button href={verificationUrl} style={button}>
              Verify Email Address
            </Button>
          </Section>

          <Text style={paragraph}>
            This link will expire in 24 hours. If you didn&apos;t create an
            account, you can safely ignore this email.
          </Text>

          <Hr style={hr} />

          <Text style={footer}>
            {APP_NAME} · Your AI-Powered Job Search Assistant
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

const footer = {
  fontSize: "12px",
  color: "#9ca3af",
  textAlign: "center" as const,
  padding: "0 40px",
  marginTop: "20px",
};
