"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@repo/ui/lib/utils";

/** Mapping from path segments to display labels */
const LABEL_MAP: Record<string, string> = {
  chat: "Chat",
  jobs: "Jobs",
  applications: "Applications",
  favorites: "Favorites",
  profile: "Profile",
  settings: "Settings",
};

interface BreadcrumbItem {
  label: string;
  href: string;
}

/**
 * Automatic breadcrumb navigation based on the current route.
 * Shows: Dashboard > Section > [Dynamic segment]
 *
 * Props:
 * - `overrideLabel` - Replace the last breadcrumb segment with a custom label
 *   (useful for dynamic pages like job detail where you want to show the job title)
 */
export function Breadcrumbs({
  overrideLabel,
  className,
}: {
  overrideLabel?: string;
  className?: string;
}) {
  const pathname = usePathname();

  // Split path into segments, filtering out empty strings
  const segments = pathname.split("/").filter(Boolean);

  // Build breadcrumb items
  const items: BreadcrumbItem[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    const href = "/" + segments.slice(0, i + 1).join("/");
    const label = LABEL_MAP[segment] ?? decodeURIComponent(segment);

    items.push({ label, href });
  }

  // Override last segment label if provided
  if (overrideLabel && items.length > 0) {
    items[items.length - 1]!.label = overrideLabel;
  }

  // Don't show breadcrumbs for top-level pages
  if (items.length <= 1) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("flex items-center text-xs text-muted-foreground", className)}
    >
      <Link
        href="/chat"
        className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
      >
        <Home className="h-3 w-3" aria-hidden="true" />
        <span className="sr-only">Dashboard</span>
      </Link>

      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <span key={item.href} className="inline-flex items-center">
            <ChevronRight className="mx-1.5 h-3 w-3" />
            {isLast ? (
              <span className="font-medium text-foreground" aria-current="page">
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className="transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
