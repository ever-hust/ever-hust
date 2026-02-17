"use client";

import { WifiOff } from "lucide-react";
import { Button } from "@repo/ui/button";

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <WifiOff className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
      <h1 className="mt-6 text-2xl font-bold">You&apos;re Offline</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        It looks like you&apos;ve lost your internet connection. Ever Jobs
        requires an internet connection to search jobs and chat with AI.
      </p>
      <Button className="mt-6" onClick={() => window.location.reload()}>
        Try Again
      </Button>
    </div>
  );
}
