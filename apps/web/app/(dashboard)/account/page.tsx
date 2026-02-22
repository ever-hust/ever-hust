"use client";

import { useRef } from "react";
import { User, AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@ever-hust/ui/button";
import { Card } from "@ever-hust/ui/card";
import { Skeleton } from "@ever-hust/ui/skeleton";
import { ScrollToTop } from "@/components/shared/scroll-to-top";
import { PageHeader } from "@/components/shared/page-header";
import { ProfileSettingsCard } from "@/components/settings/profile-settings-card";
import type { UserSettings } from "@/components/settings/types";

export default function AccountPage() {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: user, isLoading, error, refetch } = useQuery<UserSettings>({
    queryKey: ["user-profile"],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/user/profile", { signal });
      if (!res.ok) {
        if (res.status === 401) throw new Error("Please sign in to access account settings.");
        throw new Error("Failed to load account settings");
      }
      const data = await res.json();
      return data.user as UserSettings;
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <PageHeader icon={User} title="Account" />
        <div className="flex-1 overflow-y-auto p-4 sm:p-6" aria-busy="true" role="status">
          <span className="sr-only">Loading account settings...</span>
          <Skeleton className="h-12 w-48 mb-6" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <PageHeader icon={User} title="Account" />
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Card className="p-6">
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                {error instanceof Error ? error.message : "Failed to load"}
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
      <PageHeader icon={User} title="Account" />
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6">
        <ProfileSettingsCard user={user} />
        <ScrollToTop containerRef={scrollRef} />
      </div>
    </div>
  );
}
