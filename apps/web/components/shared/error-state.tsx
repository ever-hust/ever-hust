"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@repo/ui/button";
import { cn } from "@repo/ui/lib/utils";

interface ErrorStateProps {
  /** Error message to display */
  message?: string;
  /** Retry callback — shows a retry button when provided */
  onRetry?: () => void;
  /** Additional content (e.g., links to alternative actions) */
  children?: React.ReactNode;
  /** Compact mode for inline usage */
  compact?: boolean;
  className?: string;
}

/**
 * Reusable error state for pages and sections that fail to load.
 *
 * @example
 * ```tsx
 * <ErrorState
 *   message="Failed to load favorites"
 *   onRetry={() => window.location.reload()}
 * />
 * ```
 */
export function ErrorState({
  message = "Something went wrong",
  onRetry,
  children,
  compact = false,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 py-6" : "gap-3 py-16",
        className
      )}
    >
      <div
        className={cn(
          "rounded-full bg-destructive/10",
          compact ? "p-2" : "p-3"
        )}
      >
        <AlertCircle
          className={cn(
            "text-destructive",
            compact ? "h-5 w-5" : "h-7 w-7"
          )}
          aria-hidden="true"
        />
      </div>
      <div>
        <p
          className={cn(
            "font-medium text-destructive",
            compact ? "text-sm" : "text-base"
          )}
        >
          {message}
        </p>
      </div>
      {(onRetry || children) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {onRetry && (
            <Button
              variant="outline"
              size={compact ? "sm" : "default"}
              onClick={onRetry}
              className="gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Try again
            </Button>
          )}
          {children}
        </div>
      )}
    </div>
  );
}
