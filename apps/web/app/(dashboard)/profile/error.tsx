"use client";

import { useEffect } from "react";
import { Button } from "@repo/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

export default function ProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Profile error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center" role="alert">
      <AlertCircle className="h-12 w-12 text-destructive" aria-hidden="true" />
      <h2 className="mt-4 text-xl font-semibold">
        Could not load your profile
      </h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        There was an error loading your profile. Please try again.
      </p>
      {error.digest && (
        <p className="mt-1 font-mono text-xs text-muted-foreground/60">
          Error ID: {error.digest}
        </p>
      )}
      <Button onClick={reset} className="mt-6 gap-1.5">
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Try Again
      </Button>
    </div>
  );
}
