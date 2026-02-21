"use client";

import { BellRing, Loader2, AlertTriangle, BellOff } from "lucide-react";
import { Badge } from "@ever-hust/ui/badge";
import { Button } from "@ever-hust/ui/button";
import { Card } from "@ever-hust/ui/card";
import { toast } from "sonner";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useCallback } from "react";

export function NotificationSettingsCard() {
  const { state, isSupported, subscribe, unsubscribe, error } =
    usePushNotifications();

  const handleToggle = useCallback(async () => {
    if (state === "subscribed") {
      await unsubscribe();
      toast.success("Push notifications disabled");
    } else {
      await subscribe();
      // Only show success if we actually subscribed (not denied/error)
    }
  }, [state, subscribe, unsubscribe]);

  return (
    <Card id="notifications" className="p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <BellRing className="h-5 w-5" aria-hidden="true" />
        Push Notifications
      </h2>
      <div className="mt-4">
        {!isSupported ? (
          <>
            <p className="text-sm text-muted-foreground">
              Push notifications are not supported in your current browser.
              Please try a modern browser like Chrome, Firefox, or Edge.
            </p>
            <div className="mt-3 rounded-md border bg-muted/30 p-4 text-center">
              <AlertTriangle
                className="mx-auto h-8 w-8 text-muted-foreground/50"
                aria-hidden="true"
              />
              <p className="mt-2 text-sm text-muted-foreground">
                Browser does not support push notifications.
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Job Alert Notifications</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Receive browser notifications when new jobs match your alert
                  criteria.
                </p>
              </div>
              <Badge
                variant={state === "subscribed" ? "default" : "secondary"}
                className="ml-3 shrink-0 text-[10px]"
              >
                {state === "subscribed" ? "Enabled" : "Disabled"}
              </Badge>
            </div>

            <div className="mt-4">
              {state === "loading" ? (
                <Button disabled className="w-full">
                  <Loader2
                    className="mr-1.5 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                  Checking...
                </Button>
              ) : state === "subscribed" ? (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleToggle}
                >
                  <BellOff
                    className="mr-1.5 h-4 w-4"
                    aria-hidden="true"
                  />
                  Disable Notifications
                </Button>
              ) : state === "denied" ? (
                <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3">
                  <p className="text-sm text-destructive">
                    Notification permission was denied. Please enable
                    notifications in your browser settings and refresh this page.
                  </p>
                </div>
              ) : state === "error" ? (
                <div className="space-y-2">
                  <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3">
                    <p className="text-sm text-destructive">
                      {error ?? "Something went wrong. Please try again."}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={subscribe}
                  >
                    Try Again
                  </Button>
                </div>
              ) : (
                /* state === "prompt" */
                <Button className="w-full" onClick={subscribe}>
                  <BellRing
                    className="mr-1.5 h-4 w-4"
                    aria-hidden="true"
                  />
                  Enable Notifications
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
