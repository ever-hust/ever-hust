"use client";

import { useState, useCallback, useRef } from "react";
import { Key, Eye, EyeOff, Trash2, Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@ever-hust/ui/button";
import { Card } from "@ever-hust/ui/card";
import { Input } from "@ever-hust/ui/input";
import { toast } from "sonner";

/** Masked placeholder shown for existing keys */
const MASKED_KEY = "••••••••••••";

interface ApiKeysCardProps {
  initialKeys: {
    anthropic: boolean;
    openai: boolean;
    google: boolean;
  };
}

export function ApiKeysCard({ initialKeys }: ApiKeysCardProps) {
  const [apiKeys, setApiKeys] = useState<{
    anthropic: string;
    openai: string;
    google: string;
  }>({
    anthropic: initialKeys.anthropic ? MASKED_KEY : "",
    openai: initialKeys.openai ? MASKED_KEY : "",
    google: initialKeys.google ? MASKED_KEY : "",
  });
  const [keyVisibility, setKeyVisibility] = useState<{
    anthropic: boolean;
    openai: boolean;
    google: boolean;
  }>({ anthropic: false, openai: false, google: false });
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
    onMutate: () => { savingRef.current = true; },
    onSuccess: () => {
      toast.success("API keys saved securely");
      setApiKeys((prev) => ({
        anthropic: prev.anthropic ? MASKED_KEY : "",
        openai: prev.openai ? MASKED_KEY : "",
        google: prev.google ? MASKED_KEY : "",
      }));
      setKeyVisibility({ anthropic: false, openai: false, google: false });
    },
    onError: () => {
      toast.error("Failed to save API keys");
    },
    onSettled: () => { savingRef.current = false; },
  });

  const clearMutation = useMutation({
    mutationFn: async (provider: "anthropic" | "openai" | "google") => {
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
    onMutate: () => { savingRef.current = true; },
    onSuccess: (provider) => {
      setApiKeys((prev) => ({ ...prev, [provider]: "" }));
      toast.success(`${provider.charAt(0).toUpperCase() + provider.slice(1)} API key removed`);
    },
    onError: () => {
      toast.error("Failed to remove API key");
    },
    onSettled: () => { savingRef.current = false; },
  });

  const handleSaveApiKeys = useCallback(() => {
    if (savingRef.current) return;
    const keysToSave: Record<string, string> = {};
    if (apiKeys.anthropic && apiKeys.anthropic !== MASKED_KEY) {
      keysToSave.anthropic = apiKeys.anthropic;
    }
    if (apiKeys.openai && apiKeys.openai !== MASKED_KEY) {
      keysToSave.openai = apiKeys.openai;
    }
    if (apiKeys.google && apiKeys.google !== MASKED_KEY) {
      keysToSave.google = apiKeys.google;
    }
    saveMutation.mutate(keysToSave);
  }, [apiKeys, saveMutation]);

  const handleClearApiKey = useCallback(
    (provider: "anthropic" | "openai" | "google") => {
      if (savingRef.current) return;
      clearMutation.mutate(provider);
    },
    [clearMutation],
  );

  const keySaving = saveMutation.isPending || clearMutation.isPending;

  const providers = [
    { key: "anthropic" as const, label: "Anthropic", placeholder: "sk-ant-api03-..." },
    { key: "openai" as const, label: "OpenAI", placeholder: "sk-proj-..." },
    { key: "google" as const, label: "Google AI", placeholder: "AIzaSy..." },
  ] as const;

  return (
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
        {providers.map((provider) => (
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
                  maxLength={200}
                  className="pr-10"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
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
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
        ))}
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
