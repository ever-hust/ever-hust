"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@ever-hust/ui/button";

interface ErrorFallbackProps {
  /** Short title describing the error context */
  title?: string;
  /** Longer description or guidance */
  message?: string;
  /** Called when the user clicks the retry button */
  onRetry?: () => void;
  /** Whether to show a compact inline version */
  compact?: boolean;
}

/**
 * Reusable error fallback component for inline error states.
 *
 * Use this inside components when a data fetch or operation fails
 * but the rest of the page should still function.
 *
 * @example
 * ```tsx
 * if (error) {
 *   return <ErrorFallback title="Failed to load jobs" onRetry={refetch} />;
 * }
 * ```
 */
export function ErrorFallback({
  title = "Something went wrong",
  message = "An unexpected error occurred. Please try again.",
  onRetry,
  compact = false,
}: ErrorFallbackProps) {
  if (compact) {
    return (
      <div
        role="alert"
        className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive"
      >
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1">{title}</span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 rounded-md p-1 hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Retry"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center"
    >
      <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
      <h3 className="mt-3 text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{message}</p>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="mt-4 gap-1.5"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Try Again
        </Button>
      )}
    </div>
  );
}
