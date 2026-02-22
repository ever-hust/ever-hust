"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@ever-hust/ui/button";
import { Card } from "@ever-hust/ui/card";
import { Input } from "@ever-hust/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@ever-hust/ui/dialog";
import { toast } from "sonner";

export function DangerZoneCard() {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up redirect timer on unmount
  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, []);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/user/account", { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        throw new Error("Failed to delete account");
      }
    },
    onSuccess: () => {
      toast.success("Account deleted. Redirecting...");
      redirectTimerRef.current = setTimeout(() => {
        window.location.href = "/";
      }, 1500);
    },
    onError: () => {
      toast.error("Failed to delete account");
    },
  });

  const handleDeleteAccount = useCallback(() => {
    if (deleteConfirmText !== "DELETE") return;
    deleteMutation.mutate();
  }, [deleteConfirmText, deleteMutation]);

  return (
    <>
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
            <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Delete Account
          </Button>
        </div>
      </Card>

      <Dialog open={deleteDialogOpen} onOpenChange={(open) => {
        setDeleteDialogOpen(open);
        if (!open) setDeleteConfirmText("");
      }}>
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
              Type{" "}
              <span className="font-bold text-destructive">DELETE</span> to
              confirm
            </label>
            <Input
              id="delete-confirm"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              maxLength={10}
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
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={deleteConfirmText !== "DELETE" || deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2
                    className="mr-1.5 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                  Deleting...
                </>
              ) : (
                "Delete Account Forever"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
