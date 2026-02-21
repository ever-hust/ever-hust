"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@ever-hust/ui/button";
import { AlertCircle, RefreshCw, Settings } from "lucide-react";

export default function ApiDocsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("API docs error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center" role="alert">
      <AlertCircle className="h-12 w-12 text-destructive" aria-hidden="true" />
      <h2 className="mt-4 text-xl font-semibold">
        Could not load API documentation
      </h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        There was an error loading the API documentation. Please try again.
      </p>
      {error.digest && (
        <p className="mt-1 font-mono text-xs text-muted-foreground/60">
          Error ID: {error.digest}
        </p>
      )}
      <div className="mt-6 flex gap-3">
        <Button onClick={reset} variant="outline" size="sm" className="gap-1.5">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try Again
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" asChild>
          <Link href="/settings">
            <Settings className="h-4 w-4" aria-hidden="true" />
            Settings
          </Link>
        </Button>
      </div>
    </div>
  );
}
