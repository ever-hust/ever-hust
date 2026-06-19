"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { InboxConnect } from "./inbox-connect";
import { InboxView } from "./inbox-view";

interface AccountResp {
  connected: boolean;
  email?: string;
  status?: string;
  lastSyncedAt?: string | null;
}

export function InboxPageClient() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery<AccountResp>({
    queryKey: ["inbox-account"],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/inbox/account", { signal });
      if (!res.ok) throw new Error("Failed to load your inbox");
      const json = await res.json();
      return (json.data ?? json) as AccountResp;
    },
  });

  const refetchAccount = () => qc.invalidateQueries({ queryKey: ["inbox-account"] });

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader icon={Inbox} title="Inbox" />
      {isLoading ? (
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading your inbox…
        </div>
      ) : error ? (
        <div className="p-6 text-sm text-destructive">Couldn&apos;t load your inbox. Please retry.</div>
      ) : data?.connected ? (
        <div className="flex-1 overflow-hidden">
          <InboxView
            account={{
              email: data.email ?? "",
              status: data.status ?? "connected",
              lastSyncedAt: data.lastSyncedAt ?? null,
            }}
            onDisconnected={refetchAccount}
          />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <InboxConnect onConnected={refetchAccount} />
        </div>
      )}
    </div>
  );
}
