"use client";

import { useEffect } from "react";
import { Button } from "@repo/ui/button";
import { MessageCircleWarning, RefreshCw } from "lucide-react";

export default function ChatError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Chat error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <MessageCircleWarning className="h-12 w-12 text-destructive" />
      <h2 className="mt-4 text-xl font-semibold">Chat Unavailable</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        The AI chat encountered an error. This could be a temporary issue with
        the AI service. Please try again.
      </p>
      {error.digest && (
        <p className="mt-1 text-xs text-muted-foreground/60">
          Error ID: {error.digest}
        </p>
      )}
      <Button onClick={reset} className="mt-6">
        <RefreshCw className="mr-1.5 h-4 w-4" />
        Reload Chat
      </Button>
    </div>
  );
}
