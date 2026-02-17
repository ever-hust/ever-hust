"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@repo/ui/button";
import { AlertTriangle, RefreshCcw, Home } from "lucide-react";

export default function MarketingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Marketing page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="rounded-full bg-destructive/10 p-4">
        <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-xl font-semibold">Something went wrong</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        This page encountered an error. Please try refreshing.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-muted-foreground/50">
          Error ID: {error.digest}
        </p>
      )}
      <div className="mt-6 flex gap-3">
        <Button onClick={reset} variant="outline" size="sm" className="gap-2">
          <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Try Again
        </Button>
        <Link href="/">
          <Button size="sm" className="gap-2">
            <Home className="h-3.5 w-3.5" aria-hidden="true" />
            Home
          </Button>
        </Link>
      </div>
    </div>
  );
}
