"use client";

import { useState, useCallback } from "react";
import { Bot, Check, Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { Badge } from "@ever-hust/ui/badge";
import { Card } from "@ever-hust/ui/card";
import { toast } from "sonner";
import { AI_MODELS } from "./types";

interface AIModelCardProps {
  subscriptionStatus: string;
  initialModel: string;
}

export function AIModelCard({ subscriptionStatus, initialModel }: AIModelCardProps) {
  const [selectedModel, setSelectedModel] = useState(initialModel);
  const isPro = subscriptionStatus === "active" || subscriptionStatus === "past_due";

  const modelMutation = useMutation({
    mutationFn: async (modelId: string) => {
      const res = await fetch("/api/user/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferences: { aiModel: modelId },
        }),
      });
      if (!res.ok) throw new Error("Failed to update AI model");
      return modelId;
    },
    onMutate: (modelId: string) => {
      const previousModel = selectedModel;
      setSelectedModel(modelId);
      return { previousModel };
    },
    onSuccess: () => {
      toast.success("AI model updated");
    },
    onError: (_err, _modelId, context) => {
      if (context?.previousModel) {
        setSelectedModel(context.previousModel);
      }
      toast.error("Failed to update AI model");
    },
  });

  const handleModelSelect = useCallback(
    (modelId: string) => {
      const model = AI_MODELS.find((m) => m.id === modelId);
      if (model && !model.free && !isPro) {
        toast.error("Upgrade to Pro to use this model");
        return;
      }
      modelMutation.mutate(modelId);
    },
    [isPro, modelMutation],
  );

  return (
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
            const isLocked = !model.free && !isPro;
            return (
              <button
                key={model.id}
                type="button"
                disabled={isLocked || modelMutation.isPending}
                onClick={() => handleModelSelect(model.id)}
                className={`flex w-full items-center justify-between rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "hover:bg-accent/50"
                } ${isLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
              >
                <div>
                  <p className="text-sm font-medium">{model.name}</p>
                  <p className="text-xs text-muted-foreground">{model.desc}</p>
                </div>
                {isLocked ? (
                  <Badge variant="secondary">Pro only</Badge>
                ) : modelMutation.isPending && modelMutation.variables === model.id ? (
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
      </div>
    </Card>
  );
}
