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
import { APP_NAME } from "@ever-hust/utils";

interface WelcomeEmailProps {
  userName: string;
  chatUrl: string;
}

export function WelcomeEmail({
  userName = "there",
  chatUrl = "https://hust.so/chat",
}: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Welcome to {APP_NAME} — your AI job search assistant</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Welcome to {APP_NAME}!</Heading>

          <Text style={paragraph}>Hi {userName},</Text>

          <Text style={paragraph}>
            Thanks for joining {APP_NAME}! We&apos;re excited to help you find
            your next opportunity using the power of AI.
          </Text>

          <Text style={paragraph}>Here&apos;s what you can do right away:</Text>

          <Section style={featureList}>
            <Text style={featureItem}>
              💬 <strong>Chat with AI</strong> — Tell our assistant what
              you&apos;re looking for and get personalized job recommendations
            </Text>
            <Text style={featureItem}>
              🔍 <strong>Search 25+ sources</strong> — We aggregate jobs from
              LinkedIn, Indeed, Glassdoor, and 22 more platforms
            </Text>
            <Text style={featureItem}>
              📝 <strong>Generate cover letters</strong> — Get a personalized
              cover letter for any job in seconds
            </Text>
            <Text style={featureItem}>
              📄 <strong>Upload your CV</strong> — We&apos;ll parse your skills
              and experience to find better matches
            </Text>
          </Section>

          <Section style={ctaSection}>
            <Button href={chatUrl} style={button}>
              Start Your Job Search
            </Button>
          </Section>

          <Hr style={hr} />

          <Text style={paragraph}>
            <strong>Pro tip:</strong> Start by telling the AI about your ideal
            role, preferred location, and salary range. The more context you
            provide, the better your results!
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

const featureList = {
  padding: "0 40px",
};

const featureItem = {
  fontSize: "14px",
  lineHeight: "1.5",
  color: "#3c4149",
  margin: "0 0 10px",
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
