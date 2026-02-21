"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Bot, Check, Save, Loader2 } from "lucide-react";
import { Badge } from "@ever-hust/ui/badge";
import { Button } from "@ever-hust/ui/button";
import { Card } from "@ever-hust/ui/card";
import { Input } from "@ever-hust/ui/input";
import { Label } from "@ever-hust/ui/label";
import { toast } from "sonner";
import { AI_MODELS } from "./types";

interface OrgAiConfigData {
  id?: number;
  organizationId?: string;
  preferredModel: string | null;
  customSystemPrompt: string | null;
  maxTokens: number | null;
  temperature: number | null;
  enabledTools: string[] | null;
  isActive?: boolean;
}

interface OrgAiConfigCardProps {
  orgId: number;
}

export function OrgAiConfigCard({ orgId }: OrgAiConfigCardProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [preferredModel, setPreferredModel] = useState<string>("");
  const [customSystemPrompt, setCustomSystemPrompt] = useState("");
  const [maxTokens, setMaxTokens] = useState<string>("");
  const [temperature, setTemperature] = useState<string>("0.7");

  // Track whether a config was previously saved (to allow clearing fields)
  const hadExistingConfig = useRef(false);

  // Fetch current config on mount
  useEffect(() => {
    const controller = new AbortController();
    async function fetchConfig() {
      try {
        const res = await fetch(`/api/organizations/${orgId}/ai-config`, {
          signal: controller.signal,
        });
        if (res.ok && !controller.signal.aborted) {
          const data = (await res.json()) as { config: OrgAiConfigData | null };
          if (data.config) {
            hadExistingConfig.current = true;
            setPreferredModel(data.config.preferredModel ?? "");
            setCustomSystemPrompt(data.config.customSystemPrompt ?? "");
            setMaxTokens(
              data.config.maxTokens != null
                ? String(data.config.maxTokens)
                : "",
            );
            setTemperature(
              data.config.temperature != null
                ? String(data.config.temperature)
                : "0.7",
            );
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        toast.error("Failed to load AI configuration");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    fetchConfig();
    return () => controller.abort();
  }, [orgId]);

  const handleSave = useCallback(async () => {
    // Validate maxTokens before submitting
    if (maxTokens) {
      const parsed = parseInt(maxTokens, 10);
      if (isNaN(parsed) || parsed < 100 || parsed > 200_000) {
        toast.error("Max tokens must be between 100 and 200,000");
        return;
      }
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {};

      // Send the value or null to allow clearing previously set fields
      body.preferredModel = preferredModel || null;
      body.customSystemPrompt = customSystemPrompt.trim() || null;
      body.maxTokens = maxTokens
        ? parseInt(maxTokens, 10)
        : null;

      const parsedTemp = parseFloat(temperature);
      body.temperature =
        !isNaN(parsedTemp) && parsedTemp >= 0 && parsedTemp <= 1
          ? parsedTemp
          : 0.7;

      const res = await fetch(`/api/organizations/${orgId}/ai-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        hadExistingConfig.current = true;
        toast.success("AI configuration saved");
      } else {
        const err = (await res.json()) as { error?: string };
        toast.error(err.error ?? "Failed to save configuration");
      }
    } catch {
      toast.error("Failed to save AI configuration");
    } finally {
      setSaving(false);
    }
  }, [orgId, preferredModel, customSystemPrompt, maxTokens, temperature]);

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          <span className="text-sm text-muted-foreground">
            Loading AI configuration...
          </span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Bot className="h-5 w-5" aria-hidden="true" />
        Organization AI Configuration
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Configure the default AI model and behavior for your organization. These
        settings apply to all members unless overridden by individual BYOK keys.
      </p>

      <div className="mt-6 space-y-6">
        {/* Model Selector */}
        <div className="space-y-3">
          <Label>Preferred AI Model</Label>
          <div className="space-y-2">
            {AI_MODELS.map((model) => {
              const isSelected = preferredModel === model.id;
              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() =>
                    setPreferredModel(isSelected ? "" : model.id)
                  }
                  className={`flex w-full items-center justify-between rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "hover:bg-accent/50"
                  } cursor-pointer`}
                >
                  <div>
                    <p className="text-sm font-medium">{model.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {model.desc}
                    </p>
                  </div>
                  {isSelected ? (
                    <Badge variant="default">
                      <Check className="mr-1 h-3 w-3" aria-hidden="true" />
                      Selected
                    </Badge>
                  ) : (
                    <Badge variant="outline">Available</Badge>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Leave unset to use the platform default based on subscription tier.
          </p>
        </div>

        {/* Custom System Prompt */}
        <div className="space-y-2">
          <Label htmlFor="org-system-prompt">Custom System Prompt</Label>
          <textarea
            id="org-system-prompt"
            value={customSystemPrompt}
            onChange={(e) => setCustomSystemPrompt(e.target.value)}
            placeholder="Add custom instructions for the AI assistant (e.g., focus on specific industries, use particular terminology)..."
            maxLength={5000}
            rows={4}
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <p className="text-xs text-muted-foreground">
            This text is appended to the base system prompt. Max 5,000
            characters. ({customSystemPrompt.length}/5000)
          </p>
        </div>

        {/* Temperature */}
        <div className="space-y-2">
          <Label htmlFor="org-temperature">
            Temperature: {temperature}
          </Label>
          <input
            id="org-temperature"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0.0 (Precise)</span>
            <span>1.0 (Creative)</span>
          </div>
        </div>

        {/* Max Tokens */}
        <div className="space-y-2">
          <Label htmlFor="org-max-tokens">Max Tokens</Label>
          <Input
            id="org-max-tokens"
            type="number"
            min={100}
            max={200000}
            placeholder="Leave empty for platform default"
            value={maxTokens}
            onChange={(e) => setMaxTokens(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Maximum number of tokens for AI responses (100 - 200,000). Leave
            empty to use the platform default.
          </p>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2
                className="mr-2 h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Save Configuration
          </Button>
        </div>
      </div>
    </Card>
  );
}
