"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@repo/ui/button";
import { AlertTriangle, RefreshCcw, LogIn } from "lucide-react";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Auth error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <div className="rounded-full bg-destructive/10 p-4">
        <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-xl font-semibold">Authentication Error</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Something went wrong during sign in. Please try again.
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
        <Link href="/login">
          <Button size="sm" className="gap-2">
            <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
            Back to Sign In
          </Button>
        </Link>
      </div>
    </div>
  );
}
