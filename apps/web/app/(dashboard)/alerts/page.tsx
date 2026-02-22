"use client";

import { useEffect, useState, useRef } from "react";
import { Bell, AlertTriangle } from "lucide-react";
import { Button } from "@ever-hust/ui/button";
import { Card } from "@ever-hust/ui/card";
import { Skeleton } from "@ever-hust/ui/skeleton";
import { ScrollToTop } from "@/components/shared/scroll-to-top";
import { PageHeader } from "@/components/shared/page-header";
import { AlertsCard } from "@/components/settings/alerts-card";
import { NotificationSettingsCard } from "@/components/settings/notification-settings-card";
import type { Alert } from "@/components/settings/types";

export default function AlertsPage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [subscriptionStatus, setSubscriptionStatus] = useState("free");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setAlertsLoading(true);
    setError(null);

    async function loadData() {
      try {
        const profileRes = await fetch("/api/user/profile", {
          signal: controller.signal,
        });
        if (profileRes.ok && !controller.signal.aborted) {
          const data = await profileRes.json();
          setSubscriptionStatus(data.user?.subscriptionStatus ?? "free");
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Failed to load alerts settings");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }

      try {
        const alertsRes = await fetch("/api/user/alerts", {
          signal: controller.signal,
        });
        if (alertsRes.ok && !controller.signal.aborted) {
          const data = await alertsRes.json();
          setAlerts(data.alerts ?? []);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      } finally {
        if (!controller.signal.aborted) setAlertsLoading(false);
      }
    }

    loadData();
    return () => controller.abort();
  }, [retryKey]);

  if (loading) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <PageHeader icon={Bell} title="Alerts" />
        <div className="flex-1 overflow-y-auto p-4 sm:p-6" aria-busy="true" role="status">
          <span className="sr-only">Loading alerts...</span>
          <Skeleton className="h-12 w-48 mb-6" />
          <Skeleton className="h-40 w-full rounded-lg mb-4" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <PageHeader icon={Bell} title="Alerts" />
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
      <PageHeader icon={Bell} title="Alerts" />
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="space-y-6">
          <AlertsCard
            subscriptionStatus={subscriptionStatus}
            initialAlerts={alerts}
            isLoading={alertsLoading}
          />
          <NotificationSettingsCard />
        </div>
        <ScrollToTop containerRef={scrollRef} />
      </div>
    </div>
  );
}
