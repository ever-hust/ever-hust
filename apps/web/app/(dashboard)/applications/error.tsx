"use client";

import { useEffect } from "react";
import { Button } from "@repo/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

export default function ApplicationsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Applications error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <AlertCircle className="h-12 w-12 text-destructive" />
      <h2 className="mt-4 text-xl font-semibold">
        Could not load applications
      </h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        There was an error loading your job applications. Please try again.
      </p>
      {error.digest && (
        <p className="mt-1 text-xs text-muted-foreground/60">
          Error ID: {error.digest}
        </p>
      )}
      <Button onClick={reset} className="mt-6 gap-1.5">
        <RefreshCw className="h-4 w-4" />
        Try Again
      </Button>
    </div>
  );
}
