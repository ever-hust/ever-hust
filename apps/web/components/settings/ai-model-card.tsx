"use client";

import { useState, useCallback } from "react";
import { Bot, Check, Loader2, Lock, KeyRound } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { Badge } from "@ever-hust/ui/badge";
import { Card } from "@ever-hust/ui/card";
import { toast } from "sonner";
import {
  BYOK_PROVIDER_IDS,
  PROVIDER_LABELS,
  modelsByProvider,
  type ByokProviderId,
  type ProviderId,
} from "@ever-hust/plugin";

interface AIModelCardProps {
  subscriptionStatus: string;
  /** Current selection (catalog key). */
  initialModel: string;
  /** BYOK providers the user has saved a key for. */
  connectedProviders: ByokProviderId[];
}

export function AIModelCard({
  subscriptionStatus,
  initialModel,
  connectedProviders,
}: AIModelCardProps) {
  const [selectedModel, setSelectedModel] = useState(initialModel);
  const isPro = subscriptionStatus === "active" || subscriptionStatus === "past_due";
  const connected = new Set<ByokProviderId>(connectedProviders);

  const modelMutation = useMutation({
    mutationFn: async (modelKey: string) => {
      const res = await fetch("/api/user/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: { aiModel: modelKey } }),
      });
      if (!res.ok) throw new Error("Failed to update AI model");
      return modelKey;
    },
    onMutate: (modelKey: string) => {
      const previousModel = selectedModel;
      setSelectedModel(modelKey);
      return { previousModel };
    },
    onSuccess: () => toast.success("AI model updated"),
    onError: (_err, _modelKey, context) => {
      if (context?.previousModel) setSelectedModel(context.previousModel);
      toast.error("Failed to update AI model");
    },
  });

  const handleSelect = useCallback(
    (modelKey: string, locked: boolean) => {
      if (locked) {
        toast.error("Upgrade to Pro to use this model");
        return;
      }
      modelMutation.mutate(modelKey);
    },
    [modelMutation],
  );

  // Display order: Hust (default platform) first, then BYOK providers.
  const groups: ProviderId[] = ["hust", ...BYOK_PROVIDER_IDS];

  return (
    <Card id="ai-model" className="p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Bot className="h-5 w-5" aria-hidden="true" />
        AI Model
      </h2>
      <div className="mt-4 space-y-5">
        <p className="text-sm text-muted-foreground">
          Hust provides AI out of the box — pick from the models below. To use another provider,
          add your own API key under <span className="font-medium">API Keys</span> and its models
          unlock here.
        </p>

        {groups.map((provider) => {
          const models = modelsByProvider(provider);
          if (models.length === 0) return null;
          const isByok = provider !== "hust";
          const providerConnected = !isByok || connected.has(provider as ByokProviderId);

          return (
            <div key={provider} className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">{PROVIDER_LABELS[provider]}</h3>
                {provider === "hust" ? (
                  <Badge variant="secondary" className="text-[10px]">Default</Badge>
                ) : providerConnected ? (
                  <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400">
                    Connected
                  </Badge>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <KeyRound className="h-3 w-3" aria-hidden="true" />
                    Add a key in API Keys to unlock
                  </span>
                )}
              </div>

              {providerConnected &&
                models.map((model) => {
                  const isSelected = selectedModel === model.key;
                  // Hust pro models need a paid plan; BYOK models use the user's
                  // own key, so they're allowed on any tier once connected.
                  const locked = provider === "hust" && model.tier === "pro" && !isPro;
                  return (
                    <button
                      key={model.key}
                      type="button"
                      disabled={locked || modelMutation.isPending}
                      onClick={() => handleSelect(model.key, locked)}
                      className={`flex w-full items-center justify-between rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        isSelected ? "border-primary bg-primary/5" : "hover:bg-accent/50"
                      } ${locked ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                    >
                      <div>
                        <p className="text-sm font-medium">{model.name}</p>
                        <p className="text-xs text-muted-foreground">{model.desc}</p>
                      </div>
                      {locked ? (
                        <Badge variant="secondary">
                          <Lock className="mr-1 h-3 w-3" aria-hidden="true" />
                          Pro only
                        </Badge>
                      ) : modelMutation.isPending && modelMutation.variables === model.key ? (
                        <Badge variant="default">
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />
                          Saving...
                        </Badge>
                      ) : isSelected ? (
                        <Badge variant="default">
                          <Check className="mr-1 h-3 w-3" aria-hidden="true" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline">Available</Badge>
                      )}
                    </button>
                  );
                })}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
