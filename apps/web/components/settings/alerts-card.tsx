"use client";

import { useState, useCallback, useEffect } from "react";
import { Bell, Power, Trash2, Loader2 } from "lucide-react";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card } from "@repo/ui/card";
import { Skeleton } from "@repo/ui/skeleton";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { Alert } from "./types";

interface AlertsCardProps {
  subscriptionStatus: string;
  /** Initial alerts loaded by the parent. */
  initialAlerts: Alert[];
  /** Whether the parent is still loading alerts. */
  isLoading: boolean;
}

export function AlertsCard({
  subscriptionStatus,
  initialAlerts,
  isLoading,
}: AlertsCardProps) {
  const [alerts, setAlerts] = useState<Alert[]>(initialAlerts);
  const [deleteAlertId, setDeleteAlertId] = useState<number | null>(null);
  const [togglingAlertId, setTogglingAlertId] = useState<number | null>(null);
  const isPro = subscriptionStatus === "active";

  // Sync with parent when initial alerts resolve
  useEffect(() => {
    setAlerts(initialAlerts);
  }, [initialAlerts]);

  const handleToggleAlert = useCallback(
    async (alertId: number, isActive: boolean) => {
      setTogglingAlertId(alertId);
      try {
        const res = await fetch("/api/user/alerts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: alertId, isActive: !isActive }),
        });
        if (res.ok) {
          setAlerts((prev) =>
            prev.map((a) =>
              a.id === alertId ? { ...a, isActive: !isActive } : a
            )
          );
          toast.success(isActive ? "Alert paused" : "Alert resumed");
        } else {
          toast.error("Failed to update alert");
        }
      } catch {
        toast.error("Failed to update alert");
      } finally {
        setTogglingAlertId(null);
      }
    },
    []
  );

  const handleDeleteAlertConfirm = useCallback(async () => {
    if (deleteAlertId === null) return;
    try {
      const res = await fetch("/api/user/alerts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteAlertId }),
      });
      if (res.ok || res.status === 204) {
        setAlerts((prev) => prev.filter((a) => a.id !== deleteAlertId));
        setDeleteAlertId(null);
        toast.success("Alert deleted");
      } else {
        toast.error("Failed to delete alert");
      }
    } catch {
      toast.error("Failed to delete alert");
    }
  }, [deleteAlertId]);

  return (
    <>
      <Card id="alerts" className="p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Bell className="h-5 w-5" aria-hidden="true" />
          Job Alerts
        </h2>
        <div className="mt-4">
          {!isPro ? (
            <>
              <p className="text-sm text-muted-foreground">
                Upgrade to Pro to enable job alerts and get notified when new
                jobs match your criteria.
              </p>
              <div className="mt-3 rounded-md border bg-muted/30 p-4 text-center">
                <Bell
                  className="mx-auto h-8 w-8 text-muted-foreground/50"
                  aria-hidden="true"
                />
                <p className="mt-2 text-sm text-muted-foreground">
                  Upgrade to Pro to enable job alerts.
                </p>
              </div>
            </>
          ) : isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded-md" />
              <Skeleton className="h-16 w-full rounded-md" />
            </div>
          ) : alerts.length === 0 ? (
            <>
              <p className="text-sm text-muted-foreground">
                No alerts configured yet. Use the AI chat to create alerts by
                saying &quot;Set up job alerts for React developer roles&quot;.
              </p>
              <div className="mt-3 rounded-md border bg-muted/30 p-4 text-center">
                <Bell
                  className="mx-auto h-8 w-8 text-muted-foreground/50"
                  aria-hidden="true"
                />
                <p className="mt-2 text-sm text-muted-foreground">
                  No alerts yet. Ask the AI chat to set them up.
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Manage your job alert notifications below.
              </p>
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`flex items-center justify-between rounded-md border p-3 ${
                    alert.isActive ? "" : "opacity-60"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium capitalize">
                        {alert.frequency.replace("_", " ")} alert
                      </p>
                      <Badge
                        variant={alert.isActive ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {alert.isActive ? "Active" : "Paused"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {alert.email}
                      {alert.criteria &&
                        Object.keys(alert.criteria).length > 0 && (
                          <>
                            {" "}
                            &middot;{" "}
                            {alert.criteria.keywords?.join(", ") ?? "All jobs"}
                          </>
                        )}
                    </p>
                  </div>
                  <div className="ml-2 flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label={
                        alert.isActive ? "Pause alert" : "Resume alert"
                      }
                      onClick={() =>
                        handleToggleAlert(alert.id, alert.isActive)
                      }
                      disabled={togglingAlertId === alert.id}
                    >
                      {togglingAlertId === alert.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Power className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      aria-label="Delete alert"
                      onClick={() => setDeleteAlertId(alert.id)}
                      disabled={togglingAlertId === alert.id}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <ConfirmDialog
        open={deleteAlertId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteAlertId(null);
        }}
        title="Delete Alert?"
        description="This will permanently delete this job alert. You can create a new one later through the AI chat."
        confirmLabel="Delete Alert"
        destructive
        onConfirm={handleDeleteAlertConfirm}
      />
    </>
  );
}
