"use client";

import type { LucideIcon } from "lucide-react";
import { Badge } from "@repo/ui/badge";
import { cn } from "@repo/ui/lib/utils";

interface PageHeaderProps {
  /** Icon displayed before the title */
  icon: LucideIcon;
  /** Page title */
  title: string;
  /** Optional description below the title */
  description?: string;
  /** Optional count shown as a badge next to the title */
  count?: number;
  /** Custom icon className (e.g., for coloring) */
  iconClassName?: string;
  /** Additional content rendered to the right of the title */
  actions?: React.ReactNode;
  /** Container className override */
  className?: string;
}

/**
 * Reusable page header for dashboard pages.
 * Provides consistent layout: icon + title + optional badge + description.
 *
 * @example
 * ```tsx
 * <PageHeader
 *   icon={Heart}
 *   title="Favorites"
 *   description="Jobs you've saved for later."
 *   count={favorites.length}
 *   iconClassName="text-red-500"
 * />
 * ```
 */
export function PageHeader({
  icon: Icon,
  title,
  description,
  count,
  iconClassName,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("border-b px-4 py-4 sm:px-6", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon
            className={cn("h-6 w-6 shrink-0", iconClassName)}
            aria-hidden="true"
          />
          <h1 className="text-2xl font-bold">{title}</h1>
          {count !== undefined && count > 0 && (
            <Badge variant="secondary" className="ml-1">
              {count}
            </Badge>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
