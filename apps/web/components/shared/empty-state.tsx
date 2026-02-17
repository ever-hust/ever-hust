"use client";

import { cn } from "@repo/ui/lib/utils";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  /** The icon to display in the empty state */
  icon: LucideIcon;
  /** Main heading text */
  title: string;
  /** Description text below the heading */
  description?: string;
  /** Optional action area (buttons, links, etc.) */
  children?: React.ReactNode;
  /** Additional class names */
  className?: string;
  /** Icon color override (defaults to text-muted-foreground) */
  iconClassName?: string;
}

/**
 * Reusable empty state component for pages with no data.
 * Provides consistent layout with icon, title, description, and optional action area.
 *
 * @example
 * ```tsx
 * <EmptyState
 *   icon={Heart}
 *   title="No favorites yet"
 *   description="Browse jobs and click the heart icon to save them here."
 * >
 *   <Link href="/chat">
 *     <Button size="sm">Search Jobs</Button>
 *   </Link>
 * </EmptyState>
 * ```
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className,
  iconClassName,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 text-center",
        className
      )}
    >
      <div className="rounded-full bg-muted p-4">
        <Icon
          className={cn("h-8 w-8 text-muted-foreground", iconClassName)}
        />
      </div>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {children && <div className="mt-4 flex flex-wrap items-center justify-center gap-3">{children}</div>}
    </div>
  );
}
