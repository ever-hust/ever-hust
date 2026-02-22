"use client";

import { useEffect, useState, useRef } from "react";
import { CreditCard, AlertTriangle } from "lucide-react";
import { Button } from "@ever-hust/ui/button";
import { Card } from "@ever-hust/ui/card";
import { Skeleton } from "@ever-hust/ui/skeleton";
import { ScrollToTop } from "@/components/shared/scroll-to-top";
import { PageHeader } from "@/components/shared/page-header";
import { SubscriptionCard } from "@/components/settings/subscription-card";

export default function SubscriptionsPage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState("free");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    async function loadUser() {
      try {
        const res = await fetch("/api/user/profile", { signal: controller.signal });
        if (!res.ok) {
          if (res.status === 401) throw new Error("Please sign in to view subscriptions.");
          throw new Error("Failed to load subscription info");
        }
        const data = await res.json();
        if (!controller.signal.aborted) {
          setSubscriptionStatus(data.user?.subscriptionStatus ?? "free");
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadUser();
    return () => controller.abort();
  }, [retryKey]);

  if (loading) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <PageHeader icon={CreditCard} title="Subscriptions" />
        <div className="flex-1 overflow-y-auto p-4 sm:p-6" aria-busy="true" role="status">
          <span className="sr-only">Loading subscriptions...</span>
          <Skeleton className="h-12 w-48 mb-6" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <PageHeader icon={CreditCard} title="Subscriptions" />
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Card className="p-6">
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" onClick={() => setRetryKey((k) => k + 1)}>
                Try Again
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader icon={CreditCard} title="Subscriptions" />
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6">
        <SubscriptionCard subscriptionStatus={subscriptionStatus} />
        <ScrollToTop containerRef={scrollRef} />
      </div>
    </div>
  );
}
