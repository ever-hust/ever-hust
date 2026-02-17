"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { Lock, Sparkles } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Card } from "@repo/ui/card";

interface SubscriptionGateProps {
  /** Whether the user has an active subscription. */
  isSubscribed: boolean;
  /** Name of the feature being gated (shown in the upgrade prompt). */
  featureName: string;
  /** Optional description of what the Pro feature does. */
  description?: string;
  /** Content to render when the user IS subscribed. */
  children: ReactNode;
  /** Optional callback when the user clicks the upgrade button. */
  onUpgrade?: () => void;
  /** Fallback content to show for free users instead of the default card. */
  fallback?: ReactNode;
}

/**
 * Wraps Pro-only features with a subscription check.
 * If the user is a free-tier user, shows an upgrade prompt instead of the children.
 */
export function SubscriptionGate({
  isSubscribed,
  featureName,
  description,
  children,
  onUpgrade,
  fallback,
}: SubscriptionGateProps) {
  if (isSubscribed) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <Card className="flex flex-col items-center gap-4 border-dashed border-primary/20 bg-primary/5 p-6 text-center">
      <div className="rounded-full bg-primary/10 p-3">
        <Lock className="h-5 w-5 text-primary" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{featureName}</h3>
        <p className="max-w-xs text-xs text-muted-foreground">
          {description ??
            `${featureName} is a Pro feature. Upgrade to unlock unlimited access.`}
        </p>
      </div>
      {onUpgrade ? (
        <Button size="sm" onClick={onUpgrade} className="gap-1.5">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Upgrade to Pro
        </Button>
      ) : (
        <Link href="/settings">
          <Button size="sm" className="gap-1.5" tabIndex={-1}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Upgrade to Pro
          </Button>
        </Link>
      )}
    </Card>
  );
}
