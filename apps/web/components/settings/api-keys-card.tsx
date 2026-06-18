"use client";

import { useState, useCallback, useRef } from "react";
import { Key, Eye, EyeOff, Trash2, Loader2, Check } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@ever-hust/ui/button";
import { Card } from "@ever-hust/ui/card";
import { Input } from "@ever-hust/ui/input";
import { toast } from "sonner";
import {
  BYOK_PROVIDER_IDS,
  BYOK_PROVIDER_META,
  type ByokProviderId,
} from "@ever-hust/plugin";

/** Shown as the placeholder for an already-connected provider. The real key is
 *  never sent to the client — the API only ever returns a boolean. */
const MASKED_KEY = "••••••••••••";

interface ApiKeysCardProps {
  initialKeys: Partial<Record<ByokProviderId, boolean>>;
}

export function ApiKeysCard({ initialKeys }: ApiKeysCardProps) {
  // Connection state is booleans only — we never hold a real key client-side.
  const [connected, setConnected] = useState<Record<ByokProviderId, boolean>>(() =>
    BYOK_PROVIDER_IDS.reduce(
      (acc, id) => {
        acc[id] = !!initialKeys[id];
        return acc;
      },
      {} as Record<ByokProviderId, boolean>,
    ),
  );
  const [selected, setSelected] = useState<ByokProviderId>(BYOK_PROVIDER_IDS[0]!);
  // The freshly-typed key for the selected provider (cleared after save/switch).
  const [draftKey, setDraftKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const savingRef = useRef(false);

  const selectProvider = useCallback((id: ByokProviderId) => {
    setSelected(id);
    setDraftKey("");
    setShowKey(false);
  }, []);

  const saveMutation = useMutation({
    mutationFn: async ({ provider, key }: { provider: ByokProviderId; key: string }) => {
      const res = await fetch("/api/user/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: { apiKeys: { [provider]: key } } }),
      });
      if (!res.ok) throw new Error("Failed to save API key");
      return provider;
    },
    onMutate: () => {
      savingRef.current = true;
    },
    onSuccess: (provider) => {
      setConnected((prev) => ({ ...prev, [provider]: true }));
      setDraftKey("");
      setShowKey(false);
      toast.success(`${BYOK_PROVIDER_META[provider].label} key saved securely`);
    },
    onError: () => toast.error("Failed to save API key"),
    onSettled: () => {
      savingRef.current = false;
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (provider: ByokProviderId) => {
      const res = await fetch("/api/user/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: { apiKeys: { [provider]: "" } } }),
      });
      if (!res.ok) throw new Error("Failed to remove API key");
      return provider;
    },
    onMutate: () => {
      savingRef.current = true;
    },
    onSuccess: (provider) => {
      setConnected((prev) => ({ ...prev, [provider]: false }));
      setDraftKey("");
      setShowKey(false);
      toast.success(`${BYOK_PROVIDER_META[provider].label} key removed`);
    },
    onError: () => toast.error("Failed to remove API key"),
    onSettled: () => {
      savingRef.current = false;
    },
  });

  const busy = saveMutation.isPending || removeMutation.isPending;

  const handleSave = useCallback(() => {
    const key = draftKey.trim();
    if (!key || savingRef.current) return;
    saveMutation.mutate({ provider: selected, key });
  }, [draftKey, selected, saveMutation]);

  const handleRemove = useCallback(() => {
    if (savingRef.current) return;
    removeMutation.mutate(selected);
  }, [selected, removeMutation]);

  const meta = BYOK_PROVIDER_META[selected];
  const isConnected = connected[selected];

  return (
    <Card id="api-keys" className="p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Key className="h-5 w-5" aria-hidden="true" />
        API Keys (BYOK)
      </h2>
      <div className="mt-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          Hust provides AI by default. To use your own provider instead, pick one below and add
          its key — its models then unlock in the <span className="font-medium">AI Model</span>{" "}
          picker. Keys are encrypted at rest and never shown again after saving.
        </p>

        {/* Provider picker */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist" aria-label="API key provider">
          {BYOK_PROVIDER_IDS.map((id) => {
            const active = id === selected;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectProvider(id)}
                className={`flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  active ? "border-primary bg-primary/5" : "hover:bg-accent/50"
                }`}
              >
                {connected[id] && (
                  <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                )}
                {BYOK_PROVIDER_META[id].label}
              </button>
            );
          })}
        </div>

        {/* Selected provider editor */}
        <div className="rounded-lg border p-4">
          <div className="flex items-baseline justify-between">
            <label className="text-sm font-medium" htmlFor={`key-${selected}`}>
              {meta.label} API Key
              {isConnected && (
                <span className="ml-2 text-xs font-normal text-emerald-600 dark:text-emerald-400">
                  Connected
                </span>
              )}
            </label>
            <a
              href={meta.getKeyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline"
            >
              Get a key
            </a>
          </div>
          <div className="mt-2 flex gap-2">
            <div className="relative flex-1">
              <Input
                id={`key-${selected}`}
                type={showKey ? "text" : "password"}
                value={draftKey}
                onChange={(e) => setDraftKey(e.target.value)}
                placeholder={isConnected ? MASKED_KEY : meta.keyPlaceholder}
                maxLength={200}
                className="pr-10"
                autoComplete="off"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setShowKey((v) => !v)}
                aria-label={showKey ? "Hide key" : "Show key"}
              >
                {showKey ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
            {isConnected && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-destructive hover:text-destructive"
                aria-label={`Remove ${meta.label} key`}
                onClick={handleRemove}
                disabled={busy}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground/70">{meta.keyHint}</p>
          <div className="mt-3 flex items-center gap-2">
            <Button onClick={handleSave} disabled={busy || !draftKey.trim()} size="sm">
              {saveMutation.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              {isConnected ? "Replace key" : "Save key"}
            </Button>
            {isConnected && (
              <span className="text-xs text-muted-foreground">
                Saved keys can&apos;t be viewed — enter a new one to replace.
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
