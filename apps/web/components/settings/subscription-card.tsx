"use client";

import { useState, useCallback } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card } from "@repo/ui/card";
import { Separator } from "@repo/ui/separator";
import { toast } from "sonner";

interface SubscriptionCardProps {
  subscriptionStatus: string;
}

export function SubscriptionCard({ subscriptionStatus }: SubscriptionCardProps) {
  const [stripeLoading, setStripeLoading] = useState(false);
  const isPro = subscriptionStatus === "active";

  const handleUpgrade = useCallback(async () => {
    setStripeLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: "quarterly" }),
      });
      if (res.ok) {
        const data = (await res.json()) as { url: string };
        if (data.url) {
          window.location.href = data.url;
          return;
        }
      }
      toast.error("Failed to start checkout. Please try again.");
    } catch {
      toast.error("Failed to start checkout. Please try again.");
    }
    setStripeLoading(false);
  }, []);

  const handleManageSubscription = useCallback(async () => {
    setStripeLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      if (res.ok) {
        const data = (await res.json()) as { url: string };
        if (data.url) {
          window.location.href = data.url;
          return;
        }
      }
      toast.error("Failed to open subscription portal. Please try again.");
    } catch {
      toast.error("Failed to open subscription portal. Please try again.");
    }
    setStripeLoading(false);
  }, []);

  return (
    <Card id="subscription" className="p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <CreditCard className="h-5 w-5" aria-hidden="true" />
        Subscription
      </h2>
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Current Plan</p>
            <p className="text-xs text-muted-foreground">
              {isPro
                ? "Pro plan with unlimited features"
                : "Free plan with limited features"}
            </p>
          </div>
          <Badge
            variant={isPro ? "default" : "secondary"}
            className="capitalize"
          >
            {isPro ? "Pro" : "Free"}
          </Badge>
        </div>
        <Separator className="my-4" />
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Messages per day</span>
            <span className="font-medium">{isPro ? "Unlimited" : "10"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Job searches per day</span>
            <span className="font-medium">{isPro ? "Unlimited" : "5"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Cover letters per week</span>
            <span className="font-medium">{isPro ? "Unlimited" : "1"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Job alerts</span>
            <span className="font-medium">{isPro ? "Yes" : "No"}</span>
          </div>
        </div>
        <div className="mt-4">
          {!isPro ? (
            <Button
              className="w-full"
              onClick={handleUpgrade}
              disabled={stripeLoading}
            >
              {stripeLoading ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Upgrade to Pro
            </Button>
          ) : (
            <Button
              variant="outline"
              className="w-full"
              onClick={handleManageSubscription}
              disabled={stripeLoading}
            >
              {stripeLoading ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Manage Subscription
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
