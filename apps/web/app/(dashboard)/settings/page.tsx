"use client";

import { useRef } from "react";
import { Settings, AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@ever-hust/ui/button";
import { Card } from "@ever-hust/ui/card";
import { Skeleton } from "@ever-hust/ui/skeleton";
import { toast } from "sonner";
import { ScrollToTop } from "@/components/shared/scroll-to-top";
import { PageHeader } from "@/components/shared/page-header";
import { AIModelCard } from "@/components/settings/ai-model-card";
import { ApiKeysCard } from "@/components/settings/api-keys-card";
import { PrivacyDataCard } from "@/components/settings/privacy-data-card";
import { DangerZoneCard } from "@/components/settings/danger-zone-card";
import type { UserSettings } from "@/components/settings/types";
import type { UserPreferences } from "@/lib/api-schemas";

export default function SettingsPage() {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: user, isLoading, error, refetch } = useQuery<UserSettings>({
    queryKey: ["user-profile"],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/user/profile", { signal });
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Please sign in to access settings.");
        }
        throw new Error("Failed to load settings");
      }
      const data = await res.json();
      return data.user as UserSettings;
    },
    meta: {
      onError: (err: Error) => toast.error(err.message),
    },
  });

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

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <PageHeader icon={Settings} title="Settings" />
        <div className="flex-1 overflow-y-auto p-4 sm:p-6" aria-busy="true" role="status" aria-label="Loading settings">
          <span className="sr-only">Loading settings...</span>
          <Skeleton className="h-12 w-48 mb-6" />
          <Skeleton className="h-40 w-full rounded-lg mb-4" />
          <Skeleton className="h-40 w-full rounded-lg mb-4" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <PageHeader icon={Settings} title="Settings" />
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Card className="p-6">
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                {error instanceof Error ? error.message : "Failed to load settings"}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
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
      <PageHeader icon={Settings} title="Settings" />
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="space-y-6">
          <AIModelCard
            subscriptionStatus={subscriptionStatus}
            initialModel={initialModel}
          />
          <ApiKeysCard initialKeys={initialApiKeys} />
          <PrivacyDataCard />
          <DangerZoneCard />
        </div>
        <ScrollToTop containerRef={scrollRef} />
      </div>
    </div>
  );
}
