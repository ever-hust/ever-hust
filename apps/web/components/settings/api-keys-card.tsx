"use client";

import { useState, useCallback } from "react";
import { Key, Eye, EyeOff, Trash2, Loader2 } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Card } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
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
  const [keySaving, setKeySaving] = useState(false);

  const handleSaveApiKeys = useCallback(async () => {
    setKeySaving(true);
    try {
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

      const res = await fetch("/api/user/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferences: { apiKeys: keysToSave },
        }),
      });
      if (res.ok) {
        toast.success("API keys saved securely");
        setApiKeys((prev) => ({
          anthropic: prev.anthropic ? MASKED_KEY : "",
          openai: prev.openai ? MASKED_KEY : "",
          google: prev.google ? MASKED_KEY : "",
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
