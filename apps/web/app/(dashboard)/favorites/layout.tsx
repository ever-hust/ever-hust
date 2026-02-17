import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Favorites",
  description: "Your saved jobs and bookmarks",
};

export default function FavoritesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
