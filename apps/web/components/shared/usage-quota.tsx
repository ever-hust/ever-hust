"use client";

import Link from "next/link";
import { MessageSquare, Search, FileText, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@ever-hust/ui/button";
import { useUsageStats } from "@/hooks/use-usage-stats";

/**
 * Compact usage quota display for free-tier users.
 * Shows remaining messages, searches, and cover letters with progress bars.
 * Pro users see an "Unlimited" badge instead.
 * Designed to sit in the sidebar or dashboard header.
 */
export function UsageQuota() {
  const { data, isLoading } = useUsageStats();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-3">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  if (!data) return null;

  // Pro users — minimal badge
  if (data.unlimited) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground">
        <Sparkles className="h-3 w-3 text-primary" aria-hidden="true" />
        <span className="font-medium text-primary">Pro</span>
        <span>&middot; Unlimited usage</span>
      </div>
    );
  }

  const usage = data.usage;
  if (!usage) return null;

  return (
    <div className="space-y-2 border-t px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Free Plan Usage
      </p>
      <UsageBar
        icon={<MessageSquare className="h-3 w-3" aria-hidden="true" />}
        label="Messages"
        used={usage.messages.used}
        limit={usage.messages.limit}
        period={usage.messages.period}
      />
      <UsageBar
        icon={<Search className="h-3 w-3" aria-hidden="true" />}
        label="Searches"
        used={usage.searches.used}
        limit={usage.searches.limit}
        period={usage.searches.period}
      />
      <UsageBar
        icon={<FileText className="h-3 w-3" aria-hidden="true" />}
        label="Cover Letters"
        used={usage.coverLetters.used}
        limit={usage.coverLetters.limit}
        period={usage.coverLetters.period}
      />
      <Button
        variant="outline"
        size="sm"
        className="mt-1 h-7 w-full gap-1 text-[10px]"
        asChild
      >
        <Link href="/subscriptions">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          Upgrade to Pro
        </Link>
      </Button>
    </div>
  );
}

function UsageBar({
  icon,
  label,
  used,
  limit,
  period,
}: {
  icon: React.ReactNode;
  label: string;
  used: number;
  limit: number;
  period: string;
}) {
  const percentage = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const remaining = Math.max(0, limit - used);
  const isExhausted = remaining === 0;
  const isLow = remaining <= 1 && remaining > 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1 text-muted-foreground">
          {icon}
          {label}
        </span>
        <span
          className={`font-medium ${
            isExhausted
              ? "text-destructive"
              : isLow
                ? "text-amber-500"
                : "text-foreground"
          }`}
        >
          {remaining}/{limit}
          <span className="ml-0.5 text-[10px] text-muted-foreground">
            /{period}
          </span>
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-label={`${label}: ${remaining} of ${limit} remaining per ${period}`}
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isExhausted
              ? "bg-destructive"
              : isLow
                ? "bg-amber-500"
                : "bg-primary"
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
