import Link from "next/link";
import { WifiOff, RefreshCcw } from "lucide-react";
import { APP_NAME } from "@ever-hust/utils";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: `Offline — ${APP_NAME}`,
  description: "You're currently offline. Please check your internet connection.",
};

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      {/* Icon */}
      <div className="rounded-full bg-muted p-6">
        <WifiOff className="h-12 w-12 text-muted-foreground" strokeWidth={1.5} />
      </div>

      {/* Heading */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">You&apos;re offline</h1>
        <p className="max-w-sm text-muted-foreground">
          It looks like you&apos;ve lost your internet connection. Some features may not be
          available until you&apos;re back online.
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <RefreshCcw className="h-4 w-4" />
          Try Again
        </Link>
      </div>

      {/* Footer */}
      <p className="mt-8 text-xs text-muted-foreground/60">
        {APP_NAME} &middot; Your AI-Powered Job Search Assistant
      </p>
    </div>
  );
}
