import type { Metadata } from "next";
import { InboxPageClient } from "@/components/inbox/inbox-page-client";

export const metadata: Metadata = {
  title: "Inbox · Hust",
  description: "Connect your email to send and receive job-search replies inside Hust.",
};

export default function InboxPage() {
  return <InboxPageClient />;
}
