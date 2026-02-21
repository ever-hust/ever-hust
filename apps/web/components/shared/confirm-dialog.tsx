"use client";

import { useState, useCallback, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@repo/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@repo/ui/dialog";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dialog title */
  title: string;
  /** Dialog description */
  description: string;
  /** Text for the confirm button (default: "Confirm") */
  confirmLabel?: string;
  /** Text for the cancel button (default: "Cancel") */
  cancelLabel?: string;
  /** Whether the confirm button should be destructive (red) */
  destructive?: boolean;
  /** Callback when confirmed. Can be async — will show loading state. */
  onConfirm: () => void | Promise<void>;
}

/**
 * Reusable confirmation dialog for actions that need user verification.
 * Supports async confirm with loading state.
 *
 * @example
 * ```tsx
 * <ConfirmDialog
 *   open={dialogOpen}
 *   onOpenChange={setDialogOpen}
 *   title="Delete session?"
 *   description="This will permanently delete the conversation. This cannot be undone."
 *   confirmLabel="Delete"
 *   destructive
 *   onConfirm={handleDelete}
 * />
 * ```
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Reset stale error when dialog re-opens
  useEffect(() => {
    if (open) setErrorMsg(null);
  }, [open]);

  const handleConfirm = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      // Log for developers and show user-facing feedback so the dialog
      // doesn't silently stay open with no indication of failure.
      console.warn(
        "[ConfirmDialog] onConfirm threw:",
        err instanceof Error ? err.message : err
      );
      setErrorMsg("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [onConfirm, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className={destructive ? "text-destructive" : undefined}>
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {errorMsg && (
          <p role="alert" className="text-sm text-destructive">
            {errorMsg}
          </p>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
