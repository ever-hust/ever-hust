"use client";

import { useSession } from "@ever-hust/auth/client";
import { Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

/**
 * Shown across the app while the current user is an anonymous trial guest
 * (created via the frictionless /try flow). Nudges them to create a permanent
 * account so their chats, applications, and progress persist. On sign-up the
 * BetterAuth anonymous plugin links the account and carries their work over.
 */
export function AnonymousBanner() {
  const { data: session } = useSession();
  const [dismissed, setDismissed] = useState(false);

  const isAnon = (session?.user as { isAnonymous?: boolean } | undefined)
    ?.isAnonymous;
  if (!isAnon || dismissed) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b bg-primary/10 px-4 py-2 text-sm">
      <div className="flex min-w-0 items-center gap-2 text-foreground">
        <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="truncate">
          You&rsquo;re exploring as a guest. Sign up to save your chats,
          applications, and progress.
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href="/login?mode=signup"
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90"
        >
          Save my progress
        </Link>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded-md p-1 text-muted-foreground hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
