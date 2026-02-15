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
  Key,
  Trash2,
  Eye,
  EyeOff,
  ToggleLeft,
  ToggleRight,
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

interface UserAlert {
  id: number;
  email: string;
  frequency: string;
  isActive: boolean;
  criteria: Record<string, unknown> | null;
  createdAt: string;
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

  // BYOK state
  const [apiKey, setApiKey] = useState("");
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [savingApiKey, setSavingApiKey] = useState(false);

  // Alerts state
  const [alerts, setAlerts] = useState<UserAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [togglingAlert, setTogglingAlert] = useState<number | null>(null);
  const [deletingAlert, setDeletingAlert] = useState<number | null>(null);

  const loadAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/user/alerts");
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts ?? []);
      }
    } catch {
      // Silently fail
    } finally {
      setAlertsLoading(false);
    }
  }, []);

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

          // Load existing BYOK key from preferences
          const prefs = u.preferences as Record<string, unknown> | null;
          if (prefs?.apiKey) {
            setApiKey(prefs.apiKey as string);
          }
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    }
    loadUser();
    loadAlerts();
  }, [loadAlerts]);

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

  const handleSaveApiKey = useCallback(async () => {
    setSavingApiKey(true);
    try {
      const res = await fetch("/api/user/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferences: { apiKey: apiKey || null },
        }),
      });
      if (res.ok) {
        toast.success(apiKey ? "API key saved" : "API key removed");
      } else {
        toast.error("Failed to save API key");
      }
    } catch {
      toast.error("Failed to save API key");
    } finally {
      setSavingApiKey(false);
    }
  }, [apiKey]);

  const handleToggleAlert = useCallback(async (alertId: number, currentActive: boolean) => {
    setTogglingAlert(alertId);
    try {
      const res = await fetch("/api/user/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId, isActive: !currentActive }),
      });
      if (res.ok) {
        setAlerts((prev) =>
          prev.map((a) =>
            a.id === alertId ? { ...a, isActive: !currentActive } : a
          )
        );
        toast.success(`Alert ${!currentActive ? "enabled" : "paused"}`);
      } else {
        toast.error("Failed to update alert");
      }
    } catch {
      toast.error("Failed to update alert");
    } finally {
      setTogglingAlert(null);
    }
  }, []);

  const handleDeleteAlert = useCallback(async (alertId: number) => {
    setDeletingAlert(alertId);
    try {
      const res = await fetch("/api/user/alerts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId }),
      });
      if (res.ok) {
        setAlerts((prev) => prev.filter((a) => a.id !== alertId));
        toast.success("Alert deleted");
      } else {
        toast.error("Failed to delete alert");
      }
    } catch {
      toast.error("Failed to delete alert");
    } finally {
      setDeletingAlert(null);
    }
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

      {/* BYOK - Bring Your Own Key */}
      <Card className="p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Key className="h-5 w-5" />
          API Key (BYOK)
        </h2>
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Optionally provide your own Anthropic API key for unlimited usage.
            Your key is stored securely and only used for your conversations.
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="apiKey"
                type={apiKeyVisible ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-..."
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setApiKeyVisible(!apiKeyVisible)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {apiKeyVisible ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            <Button
              onClick={handleSaveApiKey}
              disabled={savingApiKey}
              variant="outline"
            >
              {savingApiKey ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Save"
              )}
            </Button>
          </div>
          {apiKey && (
            <p className="text-xs text-muted-foreground">
              Key set. Clear the field and save to remove it.
            </p>
          )}
        </div>
      </Card>

      {/* Job Alerts Management */}
      <Card className="p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Bell className="h-5 w-5" />
          Job Alerts
        </h2>
        <div className="mt-4">
          <p className="text-sm text-muted-foreground">
            Manage your job alert notifications. Create new alerts in the AI
            chat by saying &quot;Set up job alerts&quot;.
          </p>

          {user?.subscriptionStatus !== "active" ? (
            <div className="mt-3 rounded-md border bg-muted/30 p-4 text-center">
              <Bell className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">
                Upgrade to Pro to enable job alerts.
              </p>
            </div>
          ) : alertsLoading ? (
            <div className="mt-3 space-y-2">
              <Skeleton className="h-16 w-full rounded-md" />
              <Skeleton className="h-16 w-full rounded-md" />
            </div>
          ) : alerts.length === 0 ? (
            <div className="mt-3 rounded-md border bg-muted/30 p-4 text-center">
              <Bell className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">
                No alerts configured yet. Use the AI chat to set them up.
              </p>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {alerts.map((alert) => {
                const criteria = alert.criteria as Record<string, unknown> | null;
                const keywords = (criteria?.keywords as string[]) ?? [];
                const locations = (criteria?.locations as string[]) ?? [];
                return (
                  <div
                    key={alert.id}
                    className="flex items-center gap-3 rounded-md border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">
                          {keywords.length > 0
                            ? keywords.join(", ")
                            : "All jobs"}
                        </p>
                        <Badge
                          variant={alert.isActive ? "default" : "secondary"}
                          className="shrink-0 text-[10px]"
                        >
                          {alert.isActive ? "Active" : "Paused"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {alert.frequency.replace("_", " ")}
                        {locations.length > 0
                          ? ` · ${locations.join(", ")}`
                          : ""}
                        {" · "}
                        {alert.email}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleAlert(alert.id, alert.isActive)}
                      disabled={togglingAlert === alert.id}
                      className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-50"
                      title={alert.isActive ? "Pause alert" : "Enable alert"}
                    >
                      {togglingAlert === alert.id ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : alert.isActive ? (
                        <ToggleRight className="h-5 w-5 text-primary" />
                      ) : (
                        <ToggleLeft className="h-5 w-5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteAlert(alert.id)}
                      disabled={deletingAlert === alert.id}
                      className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-50"
                      title="Delete alert"
                    >
                      {deletingAlert === alert.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
