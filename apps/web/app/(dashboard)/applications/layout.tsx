import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Applications",
  description:
    "Track your job applications and their status.",
};

export default function ApplicationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
