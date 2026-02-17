import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chat",
  description:
    "Chat with your AI job search assistant to find, apply, and prepare for jobs.",
};

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
