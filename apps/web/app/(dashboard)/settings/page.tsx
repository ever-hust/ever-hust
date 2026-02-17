"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Settings,
  CreditCard,
  Bell,
  Bot,
  User,
  Check,
  Loader2,
  Trash2,
  Power,
  Key,
  Eye,
  EyeOff,
  AlertTriangle,
  Download,
  Shield,
} from "lucide-react";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Separator } from "@repo/ui/separator";
import { Skeleton } from "@repo/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@repo/ui/dialog";
import { toast } from "sonner";
import { ScrollToTop } from "@/components/shared/scroll-to-top";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PageHeader } from "@/components/shared/page-header";

interface UserSettings {
  name: string;
  email: string;
  headline: string | null;
  location: string | null;
  subscriptionStatus: string;
  preferences: Record<string, unknown> | null;
}

interface Alert {
  id: number;
  frequency: string;
  email: string;
  isActive: boolean;
  criteria: Record<string, unknown> | null;
  createdAt: string;
}

const AI_MODELS = [
  {
    id: "claude-haiku-4-5-20251001",
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
] as const;

export default function SettingsPage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [user, setUser] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formName, setFormName] = useState("");
  const [formHeadline, setFormHeadline] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [stripeLoading, setStripeLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>("claude-haiku-4-5-20251001");
  const [modelSaving, setModelSaving] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  // BYOK (Bring Your Own Key) state
  const [apiKeys, setApiKeys] = useState<{
    anthropic: string;
    openai: string;
    google: string;
  }>({ anthropic: "", openai: "", google: "" });
  const [keyVisibility, setKeyVisibility] = useState<{
    anthropic: boolean;
    openai: boolean;
    google: boolean;
  }>({ anthropic: false, openai: false, google: false });
  const [keySaving, setKeySaving] = useState(false);
  // Danger zone state
  const [exportLoading, setExportLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [clearChatDialogOpen, setClearChatDialogOpen] = useState(false);
  const [deleteAlertId, setDeleteAlertId] = useState<number | null>(null);

  useEffect(() => {
    async function loadUser() {
      setLoadError(null);
      try {
        const res = await fetch("/api/user/profile");
        if (!res.ok) {
          if (res.status === 401) {
            throw new Error("Please sign in to access settings.");
          }
          throw new Error("Failed to load settings");
        }
        const data = await res.json();
        const u = data.user;
        setUser(u);
        setFormName(u.name ?? "");
        setFormHeadline(u.headline ?? "");
        setFormLocation(u.location ?? "");
        // Set selected model from preferences
        const prefs = u.preferences as Record<string, unknown> | null;
        if (prefs?.aiModel) {
          setSelectedModel(prefs.aiModel as string);
        } else if (u.subscriptionStatus === "active") {
          setSelectedModel("claude-opus-4-6");
        }
        // Load existing BYOK keys (masked — we only show presence)
        const keys = prefs?.apiKeys as Record<string, string> | undefined;
        if (keys) {
          setApiKeys({
            anthropic: keys.anthropic ? "••••••••••••" : "",
            openai: keys.openai ? "••••••••••••" : "",
            google: keys.google ? "••••••••••••" : "",
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load settings";
        setLoadError(message);
        toast.error(message);
      } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, []);

  // Load alerts for subscribed users
  useEffect(() => {
    if (user?.subscriptionStatus !== "active") return;
    async function loadAlerts() {
      setAlertsLoading(true);
      try {
        const res = await fetch("/api/user/alerts");
        if (!res.ok) throw new Error("Failed to load alerts");
        const data = (await res.json()) as { alerts: Alert[] };
        setAlerts(data.alerts);
      } catch {
        toast.error("Failed to load job alerts");
      } finally {
        setAlertsLoading(false);
      }
    }
    loadAlerts();
  }, [user?.subscriptionStatus]);

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

  const handleModelSelect = useCallback(
    async (modelId: string) => {
      // Check if model requires Pro
      const model = AI_MODELS.find((m) => m.id === modelId);
      if (model && !model.free && user?.subscriptionStatus !== "active") {
        toast.error("Upgrade to Pro to use this model");
        return;
      }

      setSelectedModel(modelId);
      setModelSaving(true);
      try {
        const res = await fetch("/api/user/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            preferences: { aiModel: modelId },
          }),
        });
        if (res.ok) {
          toast.success("AI model updated");
        } else {
          toast.error("Failed to update AI model");
        }
      } catch {
        toast.error("Failed to update AI model");
      } finally {
        setModelSaving(false);
      }
    },
    [user?.subscriptionStatus]
  );

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

  const handleToggleAlert = useCallback(async (alertId: number, isActive: boolean) => {
    try {
      const res = await fetch("/api/user/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: alertId, isActive: !isActive }),
      });
      if (res.ok) {
        setAlerts((prev) =>
          prev.map((a) => (a.id === alertId ? { ...a, isActive: !isActive } : a))
        );
        toast.success(isActive ? "Alert paused" : "Alert resumed");
      } else {
        toast.error("Failed to update alert");
      }
    } catch {
      toast.error("Failed to update alert");
    }
  }, []);

  const handleDeleteAlertConfirm = useCallback(async () => {
    if (deleteAlertId === null) return;
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
      throw new Error("Failed to delete alert");
    }
  }, [deleteAlertId]);

  const handleSaveApiKeys = useCallback(async () => {
    setKeySaving(true);
    try {
      // Only send keys that are not the masked placeholder
      const keysToSave: Record<string, string> = {};
      if (apiKeys.anthropic && apiKeys.anthropic !== "••••••••••••") {
        keysToSave.anthropic = apiKeys.anthropic;
      }
      if (apiKeys.openai && apiKeys.openai !== "••••••••••••") {
        keysToSave.openai = apiKeys.openai;
      }
      if (apiKeys.google && apiKeys.google !== "••••••••••••") {
        keysToSave.google = apiKeys.google;
      }

      const res = await fetch("/api/user/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferences: { apiKeys: keysToSave },
        }),
      });
      if (res.ok) {
        toast.success("API keys saved securely");
        // Mask the keys after saving
        setApiKeys((prev) => ({
          anthropic: prev.anthropic ? "••••••••••••" : "",
          openai: prev.openai ? "••••••••••••" : "",
          google: prev.google ? "••••••••••••" : "",
        }));
        setKeyVisibility({ anthropic: false, openai: false, google: false });
      } else {
        toast.error("Failed to save API keys");
      }
    } catch {
      toast.error("Failed to save API keys");
    } finally {
      setKeySaving(false);
    }
  }, [apiKeys]);

  const handleClearApiKey = useCallback(
    async (provider: "anthropic" | "openai" | "google") => {
      setKeySaving(true);
      try {
        // Send empty string to clear the key
        const res = await fetch("/api/user/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            preferences: { apiKeys: { [provider]: "" } },
          }),
        });
        if (res.ok) {
          setApiKeys((prev) => ({ ...prev, [provider]: "" }));
          toast.success(`${provider.charAt(0).toUpperCase() + provider.slice(1)} API key removed`);
        } else {
          toast.error("Failed to remove API key");
        }
      } catch {
        toast.error("Failed to remove API key");
      } finally {
        setKeySaving(false);
      }
    },
    []
  );

  const handleExportData = useCallback(async () => {
    setExportLoading(true);
    try {
      const res = await fetch("/api/user/export");
      if (!res.ok) {
        toast.error("Failed to export data");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ever-jobs-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Data exported successfully");
    } catch {
      toast.error("Failed to export data");
    } finally {
      setExportLoading(false);
    }
  }, []);

  const handleClearChatHistory = useCallback(async () => {
    const res = await fetch("/api/chat/sessions", { method: "DELETE" });
    if (res.ok || res.status === 204) {
      toast.success("Chat history cleared");
    } else {
      toast.error("Failed to clear chat history");
      throw new Error("Failed to clear chat history");
    }
  }, []);

  const handleDeleteAccount = useCallback(async () => {
    if (deleteConfirmText !== "DELETE") return;
    setDeleting(true);
    try {
      const res = await fetch("/api/user/account", { method: "DELETE" });
      if (res.ok || res.status === 204) {
        toast.success("Account deleted. Redirecting...");
        setTimeout(() => {
          window.location.href = "/";
        }, 1500);
      } else {
        toast.error("Failed to delete account");
      }
    } catch {
      toast.error("Failed to delete account");
    } finally {
      setDeleting(false);
    }
  }, [deleteConfirmText]);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 p-6" aria-busy="true" role="status" aria-label="Loading settings">
        <span className="sr-only">Loading settings...</span>
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <PageHeader
          icon={Settings}
          title="Settings"
          className="border-b-0 px-0 py-0"
        />
        <Card className="mt-6 p-6">
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">{loadError}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
            >
              Try Again
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="mx-auto max-w-2xl space-y-6 overflow-y-auto p-6">
      <PageHeader
        icon={Settings}
        title="Settings"
        className="border-b-0 px-0 py-0"
      />

      {/* Profile Settings */}
      <Card id="profile" className="p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <User className="h-5 w-5" aria-hidden="true" />
          Profile
        </h2>
        <div className="mt-4 space-y-4">
          {/* Read-only email */}
          {user?.email && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Email
              </label>
              <p className="mt-1 text-sm">{user.email}</p>
            </div>
          )}
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
      <Card id="ai-model" className="p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Bot className="h-5 w-5" aria-hidden="true" />
          AI Model
        </h2>
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Choose the AI model for your conversations. Higher-tier models
            provide better responses but are only available on paid plans.
          </p>
          <div className="space-y-2">
            {AI_MODELS.map((model) => {
              const isSelected = selectedModel === model.id;
              const isLocked =
                !model.free && user?.subscriptionStatus !== "active";
              return (
                <button
                  key={model.id}
                  type="button"
                  disabled={isLocked || modelSaving}
                  onClick={() => handleModelSelect(model.id)}
                  className={`flex w-full items-center justify-between rounded-md border p-3 text-left transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "hover:bg-accent/50"
                  } ${isLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                >
                  <div>
                    <p className="text-sm font-medium">{model.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {model.desc}
                    </p>
                  </div>
                  {isLocked ? (
                    <Badge variant="secondary">Pro only</Badge>
                  ) : isSelected ? (
                    <Badge variant="default">
                      <Check className="mr-1 h-3 w-3" />
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline">Available</Badge>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* BYOK - Bring Your Own Key */}
      <Card id="api-keys" className="p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Key className="h-5 w-5" aria-hidden="true" />
          API Keys (BYOK)
        </h2>
        <div className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Bring your own API keys to use your preferred AI provider. When a
            key is provided, requests will use your key instead of the platform
            default. Keys are stored encrypted at rest.
          </p>
          {(
            [
              {
                key: "anthropic" as const,
                label: "Anthropic",
                placeholder: "sk-ant-api03-...",
              },
              {
                key: "openai" as const,
                label: "OpenAI",
                placeholder: "sk-proj-...",
              },
              {
                key: "google" as const,
                label: "Google AI",
                placeholder: "AIzaSy...",
              },
            ] as const
          ).map((provider) => (
            <div key={provider.key}>
              <label
                className="text-sm font-medium"
                htmlFor={`key-${provider.key}`}
              >
                {provider.label} API Key
              </label>
              <div className="mt-1 flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id={`key-${provider.key}`}
                    type={keyVisibility[provider.key] ? "text" : "password"}
                    value={apiKeys[provider.key]}
                    onChange={(e) =>
                      setApiKeys((prev) => ({
                        ...prev,
                        [provider.key]: e.target.value,
                      }))
                    }
                    placeholder={provider.placeholder}
                    className="pr-10"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      setKeyVisibility((prev) => ({
                        ...prev,
                        [provider.key]: !prev[provider.key],
                      }))
                    }
                    aria-label={
                      keyVisibility[provider.key] ? "Hide key" : "Show key"
                    }
                  >
                    {keyVisibility[provider.key] ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {apiKeys[provider.key] && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive hover:text-destructive"
                    aria-label={`Remove ${provider.label} key`}
                    onClick={() => handleClearApiKey(provider.key)}
                    disabled={keySaving}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          <Button onClick={handleSaveApiKeys} disabled={keySaving}>
            {keySaving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : null}
            Save API Keys
          </Button>
        </div>
      </Card>

      {/* Notifications / Alerts */}
      <Card id="alerts" className="p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Bell className="h-5 w-5" aria-hidden="true" />
          Job Alerts
        </h2>
        <div className="mt-4">
          {user?.subscriptionStatus !== "active" ? (
            <>
              <p className="text-sm text-muted-foreground">
                Upgrade to Pro to enable job alerts and get notified when new
                jobs match your criteria.
              </p>
              <div className="mt-3 rounded-md border bg-muted/30 p-4 text-center">
                <Bell className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  Upgrade to Pro to enable job alerts.
                </p>
              </div>
            </>
          ) : alertsLoading ? (
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
                <Bell className="mx-auto h-8 w-8 text-muted-foreground/50" />
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
                            {(alert.criteria as { keywords?: string[] })
                              .keywords?.join(", ") ?? "All jobs"}
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
                    >
                      <Power className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      aria-label="Delete alert"
                      onClick={() => setDeleteAlertId(alert.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Privacy & Data */}
      <Card id="privacy" className="p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Shield className="h-5 w-5" aria-hidden="true" />
          Privacy &amp; Data
        </h2>
        <div className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Your data is yours. Export your information or manage your data
            below.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={handleExportData}
              disabled={exportLoading}
            >
              {exportLoading ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-1.5 h-4 w-4" />
              )}
              Export My Data
            </Button>
            <Button
              variant="outline"
              onClick={() => setClearChatDialogOpen(true)}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Clear Chat History
            </Button>
          </div>
        </div>
      </Card>

      {/* Danger Zone */}
      <Card id="danger-zone" className="border-destructive/50 p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-destructive">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          Danger Zone
        </h2>
        <div className="mt-4">
          <p className="text-sm text-muted-foreground">
            Permanently delete your account and all associated data. This action
            cannot be undone.
          </p>
          <Button
            variant="destructive"
            className="mt-4"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            Delete Account
          </Button>
        </div>
      </Card>

      {/* Clear chat history confirmation dialog */}
      <ConfirmDialog
        open={clearChatDialogOpen}
        onOpenChange={setClearChatDialogOpen}
        title="Clear Chat History?"
        description="This will permanently delete all your chat conversations and messages. This action cannot be undone."
        confirmLabel="Clear All Chats"
        destructive
        onConfirm={handleClearChatHistory}
      />

      {/* Delete alert confirmation dialog */}
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

      {/* Delete account confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Delete Account?
            </DialogTitle>
            <DialogDescription>
              This will permanently delete your account and all data including
              saved jobs, applications, chat history, and preferences. This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium" htmlFor="delete-confirm">
              Type <span className="font-bold text-destructive">DELETE</span> to
              confirm
            </label>
            <Input
              id="delete-confirm"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              className="mt-1"
              autoComplete="off"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setDeleteConfirmText("");
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={deleteConfirmText !== "DELETE" || deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Account Forever"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ScrollToTop containerRef={scrollRef} />
    </div>
  );
}
