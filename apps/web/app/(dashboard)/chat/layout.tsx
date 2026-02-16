import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Chat",
  description:
    "Chat with your AI job search assistant. Search jobs, get interview tips, and generate cover letters through natural conversation.",
};

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
