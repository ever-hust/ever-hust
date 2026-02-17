"use client";

import { useEffect } from "react";
import { Button } from "@repo/ui/button";
import { AlertCircle } from "lucide-react";

export default function JobsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Jobs error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center" role="alert">
      <AlertCircle className="h-12 w-12 text-destructive" aria-hidden="true" />
      <h2 className="mt-4 text-xl font-semibold">
        Could not load jobs
      </h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        There was an error loading the jobs page. Please try again.
      </p>
      <Button onClick={reset} className="mt-6">
        Try Again
      </Button>
    </div>
  );
}
