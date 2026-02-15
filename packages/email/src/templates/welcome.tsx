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

interface WelcomeEmailProps {
  userName: string;
  loginUrl: string;
}

export function WelcomeEmail({
  userName = "there",
  loginUrl = "https://everjobs.ai/login",
}: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Welcome to Ever Jobs — your AI-powered job search starts now</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Welcome to Ever Jobs</Heading>

          <Text style={paragraph}>Hi {userName},</Text>

          <Text style={paragraph}>
            Thanks for signing up! Ever Jobs is your AI-powered job search
            assistant that helps you find the perfect role faster.
          </Text>

          <Hr style={hr} />

          <Section style={section}>
            <Text style={subheading}>Here&apos;s what you can do:</Text>
            <Text style={listItem}>
              <strong>Chat with AI</strong> — Describe your ideal job and get
              personalized recommendations instantly.
            </Text>
            <Text style={listItem}>
              <strong>Browse 25+ sources</strong> — We aggregate jobs from
              LinkedIn, Indeed, Glassdoor, and more.
            </Text>
            <Text style={listItem}>
              <strong>Generate cover letters</strong> — Tailored to each job
              with a single click.
            </Text>
            <Text style={listItem}>
              <strong>Upload your CV</strong> — Let us match your skills to the
              best opportunities.
            </Text>
          </Section>

          <Hr style={hr} />

          <Section style={{ textAlign: "center" as const, padding: "0 40px" }}>
            <Link href={loginUrl} style={button}>
              Start Your Job Search
            </Link>
          </Section>

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

const footer = {
  fontSize: "12px",
  color: "#9ca3af",
  textAlign: "center" as const,
  padding: "0 40px",
  marginTop: "32px",
};
