"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Settings,
  CreditCard,
  Bell,
  Bot,
  User,
  Check,
  Loader2,
} from "lucide-react";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Separator } from "@repo/ui/separator";
import { Skeleton } from "@repo/ui/skeleton";
import { toast } from "sonner";

interface UserSettings {
  name: string;
  email: string;
  headline: string | null;
  location: string | null;
  subscriptionStatus: string;
  preferences: Record<string, unknown> | null;
}

export default function SettingsPage() {
  const [user, setUser] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formName, setFormName] = useState("");
  const [formHeadline, setFormHeadline] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [stripeLoading, setStripeLoading] = useState(false);

  useEffect(() => {
    async function loadUser() {
      try {
        const res = await fetch("/api/user/profile");
        if (res.ok) {
          const data = await res.json();
          const u = data.user;
          setUser(u);
          setFormName(u.name ?? "");
          setFormHeadline(u.headline ?? "");
          setFormLocation(u.location ?? "");
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/user/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          headline: formHeadline,
          location: formLocation,
        }),
      });
      if (res.ok) {
        setSaved(true);
        toast.success("Settings saved successfully");
        setTimeout(() => setSaved(false), 2000);
      } else {
        toast.error("Failed to save settings");
      }
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }, [formName, formHeadline, formLocation]);

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
    } catch {
      // Silently fail
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
    } catch {
      // Silently fail
    }
    setStripeLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 p-6">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 overflow-y-auto p-6">
      <div className="flex items-center gap-2">
        <Settings className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      {/* Profile Settings */}
      <Card className="p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <User className="h-5 w-5" />
          Profile
        </h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className="text-sm font-medium" htmlFor="name">
              Name
            </label>
            <Input
              id="name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="headline">
              Headline
            </label>
            <Input
              id="headline"
              value={formHeadline}
              onChange={(e) => setFormHeadline(e.target.value)}
              placeholder="e.g. Senior Software Engineer"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="location">
              Location
            </label>
            <Input
              id="location"
              value={formLocation}
              onChange={(e) => setFormLocation(e.target.value)}
              placeholder="e.g. San Francisco, CA"
              className="mt-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : saved ? (
                <Check className="mr-1.5 h-4 w-4" />
              ) : null}
              {saved ? "Saved" : "Save Changes"}
            </Button>
          </div>
        </div>
      </Card>

      {/* Subscription */}
      <Card className="p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CreditCard className="h-5 w-5" />
          Subscription
        </h2>
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Current Plan</p>
              <p className="text-xs text-muted-foreground">
                {user?.subscriptionStatus === "active"
                  ? "Pro plan with unlimited features"
                  : "Free plan with limited features"}
              </p>
            </div>
            <Badge
              variant={
                user?.subscriptionStatus === "active" ? "default" : "secondary"
              }
              className="capitalize"
            >
              {user?.subscriptionStatus === "active" ? "Pro" : "Free"}
            </Badge>
          </div>
          <Separator className="my-4" />
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Messages per day</span>
              <span className="font-medium">
                {user?.subscriptionStatus === "active" ? "Unlimited" : "10"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Job searches per day
              </span>
              <span className="font-medium">
                {user?.subscriptionStatus === "active" ? "Unlimited" : "5"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Cover letters per week
              </span>
              <span className="font-medium">
                {user?.subscriptionStatus === "active" ? "Unlimited" : "1"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Job alerts</span>
              <span className="font-medium">
                {user?.subscriptionStatus === "active" ? "Yes" : "No"}
              </span>
            </div>
          </div>
          <div className="mt-4">
            {user?.subscriptionStatus !== "active" ? (
              <Button
                className="w-full"
                onClick={handleUpgrade}
                disabled={stripeLoading}
              >
                {stripeLoading ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
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
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : null}
                Manage Subscription
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* AI Model */}
      <Card className="p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Bot className="h-5 w-5" />
          AI Model
        </h2>
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Choose the AI model for your conversations. Higher-tier models
            provide better responses but are only available on paid plans.
          </p>
          <div className="space-y-2">
            {[
              {
                id: "claude-haiku-4-5",
                name: "Claude Haiku 4.5",
                desc: "Fast, efficient. Great for basic queries.",
                free: true,
              },
              {
                id: "claude-opus-4-6",
                name: "Claude Opus 4.6",
                desc: "Most capable. Best for complex tasks.",
                free: false,
              },
            ].map((model) => (
              <div
                key={model.id}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div>
                  <p className="text-sm font-medium">{model.name}</p>
                  <p className="text-xs text-muted-foreground">{model.desc}</p>
                </div>
                {!model.free && user?.subscriptionStatus !== "active" ? (
                  <Badge variant="secondary">Pro only</Badge>
                ) : (
                  <Badge variant="outline">Available</Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Notifications */}
      <Card className="p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Bell className="h-5 w-5" />
          Notifications
        </h2>
        <div className="mt-4">
          <p className="text-sm text-muted-foreground">
            Configure job alert notifications. Use the chat to create and manage
            alerts by saying &quot;Set up job alerts&quot;.
          </p>
          <div className="mt-3 rounded-md border bg-muted/30 p-4 text-center">
            <Bell className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">
              {user?.subscriptionStatus === "active"
                ? "No alerts configured yet. Use the AI chat to set them up."
                : "Upgrade to Pro to enable job alerts."}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
