import type { Metadata } from "next";
import { APP_NAME } from "@ever-hust/utils";

export const metadata: Metadata = {
  title: "Sign In",
  description: `Sign in to ${APP_NAME} to access your AI-powered job search assistant.`,
  robots: {
    index: false,
    follow: false,
  },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
