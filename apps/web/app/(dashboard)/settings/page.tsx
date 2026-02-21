"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { Settings, AlertTriangle } from "lucide-react";
import { Button } from "@ever-hust/ui/button";
import { Card } from "@ever-hust/ui/card";
import { Skeleton } from "@ever-hust/ui/skeleton";
import { toast } from "sonner";
import { ScrollToTop } from "@/components/shared/scroll-to-top";
import { PageHeader } from "@/components/shared/page-header";
import { ProfileSettingsCard } from "@/components/settings/profile-settings-card";
import { SubscriptionCard } from "@/components/settings/subscription-card";
import { AIModelCard } from "@/components/settings/ai-model-card";
import { ApiKeysCard } from "@/components/settings/api-keys-card";
import { AlertsCard } from "@/components/settings/alerts-card";
import { NotificationSettingsCard } from "@/components/settings/notification-settings-card";
import { PrivacyDataCard } from "@/components/settings/privacy-data-card";
import { DangerZoneCard } from "@/components/settings/danger-zone-card";
import type { UserSettings, Alert } from "@/components/settings/types";
import type { UserPreferences } from "@/lib/api-schemas";

const ReferralProgramCard = dynamic(
  () =>
    import("@/components/settings/referral-program-card").then(
      (mod) => mod.ReferralProgramCard,
    ),
  {
    loading: () => <Skeleton className="h-40 w-full rounded-lg" />,
    ssr: false,
  },
);

const DeveloperApiCard = dynamic(
  () =>
    import("@/components/settings/developer-api-card").then(
      (mod) => mod.DeveloperApiCard,
    ),
  {
    loading: () => <Skeleton className="h-40 w-full rounded-lg" />,
    ssr: false,
  },
);

const OrganizationCard = dynamic(
  () =>
    import("@/components/settings/organization-card").then(
      (mod) => mod.OrganizationCard,
    ),
  {
    loading: () => <Skeleton className="h-40 w-full rounded-lg" />,
    ssr: false,
  },
);

export default function SettingsPage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [user, setUser] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);

  const loadAlerts = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/user/alerts", { signal });
      if (res.ok && !signal?.aborted) {
        const data = await res.json();
        setAlerts(data.alerts ?? []);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      // Alerts are non-critical on initial load
    } finally {
      if (!signal?.aborted) setAlertsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setAlertsLoading(true);

    async function loadUser() {
      setLoadError(null);
      try {
        const res = await fetch("/api/user/profile", {
          signal: controller.signal,
        });
        if (!res.ok) {
          if (res.status === 401) {
            throw new Error("Please sign in to access settings.");
          }
          throw new Error("Failed to load settings");
        }
        const data = await res.json();
        if (controller.signal.aborted) return;
        setUser(data.user);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const message =
          err instanceof Error ? err.message : "Failed to load settings";
        setLoadError(message);
        toast.error(message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadUser();
    loadAlerts(controller.signal);
    return () => controller.abort();
  }, [loadAlerts, retryKey]);

  // Derive initial values for child components from user data
  const subscriptionStatus = user?.subscriptionStatus ?? "free";
  const prefs = user?.preferences as UserPreferences | null;

  const initialModel =
    prefs?.aiModel ??
    (subscriptionStatus === "active" || subscriptionStatus === "past_due"
      ? "claude-opus-4-6"
      : "claude-haiku-4-5-20251001");

  const initialApiKeys = {
    anthropic: !!prefs?.apiKeys?.anthropic,
    openai: !!prefs?.apiKeys?.openai,
    google: !!prefs?.apiKeys?.google,
  };

  if (loading) {
    return (
      <div
        className="mx-auto max-w-2xl space-y-6 p-6"
        aria-busy="true"
        role="status"
        aria-label="Loading settings"
      >
        <span className="sr-only">Loading settings...</span>
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    );
  }

  if (loadError || !user) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <PageHeader
          icon={Settings}
          title="Settings"
          className="border-b-0 px-0 py-0"
        />
        <Card className="mt-6 p-6">
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <AlertTriangle
              className="h-8 w-8 text-destructive"
              aria-hidden="true"
            />
            <p className="text-sm text-muted-foreground">
              {loadError ?? "Failed to load settings"}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRetryKey((k) => k + 1)}
            >
              Try Again
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="mx-auto max-w-2xl space-y-6 overflow-y-auto p-6"
    >
      <PageHeader
        icon={Settings}
        title="Settings"
        className="border-b-0 px-0 py-0"
      />

      <ProfileSettingsCard user={user} />
      <SubscriptionCard subscriptionStatus={subscriptionStatus} />
      <ReferralProgramCard />
      <OrganizationCard />
      <AIModelCard
        subscriptionStatus={subscriptionStatus}
        initialModel={initialModel}
      />
      <ApiKeysCard initialKeys={initialApiKeys} />
      <DeveloperApiCard />
      <AlertsCard
        subscriptionStatus={subscriptionStatus}
        initialAlerts={alerts}
        isLoading={alertsLoading}
      />
      <NotificationSettingsCard />
      <PrivacyDataCard />
      <DangerZoneCard />

      <ScrollToTop containerRef={scrollRef} />
    </div>
  );
}
