import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Saved Jobs",
  description: "Your saved jobs and bookmarks",
};

export default function FavoritesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
