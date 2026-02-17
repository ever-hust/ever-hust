"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@repo/ui/button";
import { AlertCircle, ArrowLeft } from "lucide-react";

export default function JobDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Job detail error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <AlertCircle className="h-12 w-12 text-destructive" />
      <h2 className="mt-4 text-xl font-semibold">
        Could not load job details
      </h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        We were unable to load this job listing. The job may have been removed or
        there may be a temporary issue.
      </p>
      {error.digest && (
        <p className="mt-1 text-xs text-muted-foreground/60">
          Error ID: {error.digest}
        </p>
      )}
      <div className="mt-6 flex items-center gap-3">
        <Link href="/jobs">
          <Button variant="outline">
            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Back to Jobs
          </Button>
        </Link>
        <Button onClick={reset}>Try Again</Button>
      </div>
    </div>
  );
}
