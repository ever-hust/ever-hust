"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useSession } from "@ever-hust/auth/client";
import { cn } from "@ever-hust/ui/lib/utils";

/**
 * Persistent reminder for anonymous (guest) trial users to create a real
 * account before their temporary session — and its chats, saved jobs, and
 * applications — is lost. Rendered just above the user menu in the sidebar.
 *
 * Self-gating: renders nothing for signed-in (non-anonymous) users.
 */
export function AnonymousReminder({ collapsed = false }: { collapsed?: boolean }) {
  const { data: session } = useSession();
  const isAnon = (session?.user as { isAnonymous?: boolean } | undefined)?.isAnonymous;

  if (!isAnon) return null;

  // Collapsed sidebar: compact icon-only CTA.
  if (collapsed) {
    return (
      <Link
        href="/login?mode=signup"
        title="You're a guest — create a free account to save your progress"
        aria-label="Create a free account to save your progress"
        className="mx-auto mb-1 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors hover:bg-primary/20"
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" />
      </Link>
    );
  }

  return (
    <div
      className={cn(
        "mb-2 rounded-lg border border-primary/30 bg-primary/5 p-3",
      )}
    >
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">You&apos;re a guest</p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            This is a temporary account. Create a free account to keep your chats, saved jobs,
            and applications.
          </p>
        </div>
      </div>
      <Link
        href="/login?mode=signup"
        className="mt-2.5 block w-full rounded-md bg-primary px-3 py-1.5 text-center text-xs font-medium text-primary-foreground transition hover:opacity-90"
      >
        Create free account
      </Link>
    </div>
  );
}
