import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Browse Jobs",
  description:
    "Browse and search job listings from 50+ sources. Filter by role, location, salary, and more.",
};

export default function JobsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
