"use client";

import { useState, useCallback, useRef } from "react";
import { Key, Eye, EyeOff, Trash2, Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@ever-hust/ui/button";
import { Card } from "@ever-hust/ui/card";
import { Input } from "@ever-hust/ui/input";
import { toast } from "sonner";
import { PROVIDER_IDS, PROVIDER_META, type ProviderId } from "@ever-hust/plugin";

/** Masked placeholder shown for existing keys */
const MASKED_KEY = "••••••••••••";

interface ApiKeysCardProps {
  initialKeys: Partial<Record<ProviderId, boolean>>;
}

function emptyKeyState<T>(value: (id: ProviderId) => T): Record<ProviderId, T> {
  return PROVIDER_IDS.reduce(
    (acc, id) => {
      acc[id] = value(id);
      return acc;
    },
    {} as Record<ProviderId, T>,
  );
}

export function ApiKeysCard({ initialKeys }: ApiKeysCardProps) {
  const [apiKeys, setApiKeys] = useState<Record<ProviderId, string>>(() =>
    emptyKeyState((id) => (initialKeys[id] ? MASKED_KEY : "")),
  );
  const [keyVisibility, setKeyVisibility] = useState<Record<ProviderId, boolean>>(
    () => emptyKeyState(() => false),
  );
  const savingRef = useRef(false);

  const saveMutation = useMutation({
    mutationFn: async (keysToSave: Record<string, string>) => {
      const res = await fetch("/api/user/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferences: { apiKeys: keysToSave },
        }),
      });
      if (!res.ok) throw new Error("Failed to save API keys");
    },
    onMutate: () => {
      savingRef.current = true;
    },
    onSuccess: () => {
      toast.success("API keys saved securely");
      setApiKeys((prev) =>
        emptyKeyState((id) => (prev[id] ? MASKED_KEY : "")),
      );
      setKeyVisibility(emptyKeyState(() => false));
    },
    onError: () => {
      toast.error("Failed to save API keys");
    },
    onSettled: () => {
      savingRef.current = false;
    },
  });

  const clearMutation = useMutation({
    mutationFn: async (provider: ProviderId) => {
      const res = await fetch("/api/user/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferences: { apiKeys: { [provider]: "" } },
        }),
      });
      if (!res.ok) throw new Error("Failed to remove API key");
      return provider;
    },
    onMutate: () => {
      savingRef.current = true;
    },
    onSuccess: (provider) => {
      setApiKeys((prev) => ({ ...prev, [provider]: "" }));
      toast.success(`${PROVIDER_META[provider].label} API key removed`);
    },
    onError: () => {
      toast.error("Failed to remove API key");
    },
    onSettled: () => {
      savingRef.current = false;
    },
  });

  const handleSaveApiKeys = useCallback(() => {
    if (savingRef.current) return;
    const keysToSave: Record<string, string> = {};
    for (const id of PROVIDER_IDS) {
      const value = apiKeys[id];
      if (value && value !== MASKED_KEY) keysToSave[id] = value;
    }
    saveMutation.mutate(keysToSave);
  }, [apiKeys, saveMutation]);

  const handleClearApiKey = useCallback(
    (provider: ProviderId) => {
      if (savingRef.current) return;
      clearMutation.mutate(provider);
    },
    [clearMutation],
  );

  const keySaving = saveMutation.isPending || clearMutation.isPending;

  return (
    <Card id="api-keys" className="p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Key className="h-5 w-5" aria-hidden="true" />
        API Keys (BYOK)
      </h2>
      <div className="mt-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          Bring your own API keys to use your preferred AI provider. When a key
          is provided, requests will use your key instead of the platform
          default. Keys are stored encrypted at rest.
        </p>
        {PROVIDER_IDS.map((id) => {
          const meta = PROVIDER_META[id];
          return (
            <div key={id}>
              <div className="flex items-baseline justify-between">
                <label className="text-sm font-medium" htmlFor={`key-${id}`}>
                  {meta.label} API Key
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
              <div className="mt-1 flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id={`key-${id}`}
                    type={keyVisibility[id] ? "text" : "password"}
                    value={apiKeys[id]}
                    onChange={(e) =>
                      setApiKeys((prev) => ({ ...prev, [id]: e.target.value }))
                    }
                    placeholder={meta.keyPlaceholder}
                    maxLength={200}
                    className="pr-10"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() =>
                      setKeyVisibility((prev) => ({ ...prev, [id]: !prev[id] }))
                    }
                    aria-label={keyVisibility[id] ? "Hide key" : "Show key"}
                  >
                    {keyVisibility[id] ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
                {apiKeys[id] && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive hover:text-destructive"
                    aria-label={`Remove ${meta.label} key`}
                    onClick={() => handleClearApiKey(id)}
                    disabled={keySaving}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground/70">{meta.keyHint}</p>
            </div>
          );
        })}
        <Button onClick={handleSaveApiKeys} disabled={keySaving}>
          {keySaving ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : null}
          Save API Keys
        </Button>
      </div>
    </Card>
  );
}
