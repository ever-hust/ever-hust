"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@ever-hust/ui/button";
import { AlertTriangle, RefreshCcw, Building2 } from "lucide-react";

export default function OrganizationDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Organization detail error:", error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 text-center" role="alert">
      <div className="rounded-full bg-destructive/10 p-4">
        <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-xl font-semibold">Something went wrong</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Failed to load organization details. Try refreshing the page.
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
        <Button size="sm" className="gap-2" asChild>
          <Link href="/organizations">
            <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
            Organizations
          </Link>
        </Button>
      </div>
    </div>
  );
}
