import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Profile",
  description: "View and manage your Hust profile, CV, and job history.",
};

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
