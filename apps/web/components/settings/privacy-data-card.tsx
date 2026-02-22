"use client";

import { useState, useCallback } from "react";
import { Shield, Loader2, Download, Trash2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@ever-hust/ui/button";
import { Card } from "@ever-hust/ui/card";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

export function PrivacyDataCard() {
  const [clearChatDialogOpen, setClearChatDialogOpen] = useState(false);

  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/user/export");
      if (!res.ok) throw new Error("Failed to export data");
      return res.blob();
    },
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement("a");
        a.href = url;
        a.download = `ever-jobs-data-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast.success("Data exported successfully");
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    onError: () => {
      toast.error("Failed to export data");
    },
  });

  const clearChatMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/chat/sessions", { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        throw new Error("Failed to clear chat history");
      }
    },
    onSuccess: () => {
      toast.success("Chat history cleared");
    },
    onError: () => {
      toast.error("Failed to clear chat history");
    },
  });

  const handleClearChatHistory = useCallback(async () => {
    await clearChatMutation.mutateAsync();
  }, [clearChatMutation]);

  return (
    <>
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
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending}
            >
              {exportMutation.isPending ? (
                <Loader2
                  className="mr-1.5 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
              )}
              Export My Data
            </Button>
            <Button
              variant="outline"
              onClick={() => setClearChatDialogOpen(true)}
            >
              <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Clear Chat History
            </Button>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={clearChatDialogOpen}
        onOpenChange={setClearChatDialogOpen}
        title="Clear Chat History?"
        description="This will permanently delete all your chat conversations and messages. This action cannot be undone."
        confirmLabel="Clear All Chats"
        destructive
        onConfirm={handleClearChatHistory}
      />
    </>
  );
}
