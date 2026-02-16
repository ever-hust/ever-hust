import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Profile",
  description:
    "View and manage your Ever Jobs profile, skills, resume, and saved jobs.",
};

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
