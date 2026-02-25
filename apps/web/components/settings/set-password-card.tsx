"use client";

import { useState, useCallback } from "react";
import { Lock, Loader2, Check, Eye, EyeOff } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@ever-hust/ui/button";
import { Card } from "@ever-hust/ui/card";
import { Input } from "@ever-hust/ui/input";
import { Label } from "@ever-hust/ui/label";
import { toast } from "sonner";

interface ConnectedAccount {
  providerId: string;
}

/**
 * Settings card that lets users set or change their password.
 *
 * - Social-only users (no "credential" provider) see a "Set password" form.
 * - Users who already have a password see a "Change password" form.
 *
 * Uses BetterAuth's `/api/auth/set-password` and `/api/auth/change-password`
 * endpoints via direct fetch.
 */
export function SetPasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if user already has a credential (password) account
  const { data: accounts = [], isLoading } = useQuery<ConnectedAccount[]>({
    queryKey: ["connected-accounts"],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/user/accounts", { signal });
      if (!res.ok) throw new Error("Failed to load accounts");
      const data = await res.json();
      return data.accounts as ConnectedAccount[];
    },
    staleTime: 60_000,
  });

  const hasPassword = accounts.some((a) => a.providerId === "credential");

  const resetForm = useCallback(() => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowCurrent(false);
    setShowNew(false);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (newPassword.length < 8) {
        toast.error("Password must be at least 8 characters.");
        return;
      }
      if (newPassword !== confirmPassword) {
        toast.error("Passwords do not match.");
        return;
      }

      setIsSubmitting(true);
      try {
        if (hasPassword) {
          // Change existing password
          const res = await fetch("/api/auth/change-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              currentPassword,
              newPassword,
            }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => null);
            const msg =
              (body as { message?: string } | null)?.message ??
              "Failed to change password.";
            toast.error(msg);
            return;
          }
          toast.success("Password changed successfully.");
        } else {
          // Set password for the first time (social-only users)
          const res = await fetch("/api/auth/set-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ newPassword }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => null);
            const msg =
              (body as { message?: string } | null)?.message ??
              "Failed to set password.";
            toast.error(msg);
            return;
          }
          toast.success("Password set! You can now sign in with email & password.");
        }
        resetForm();
      } catch {
        toast.error("Something went wrong. Please try again.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [hasPassword, currentPassword, newPassword, confirmPassword, resetForm],
  );

  if (isLoading) return null; // Don't render until we know account state

  return (
    <Card id="set-password" className="p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Lock className="h-5 w-5" aria-hidden="true" />
        {hasPassword ? "Change Password" : "Set Password"}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {hasPassword
          ? "Update your account password."
          : "Add a password so you can also sign in with email & password."}
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        {hasPassword && (
          <div className="space-y-1.5">
            <Label htmlFor="current-password" className="text-xs">
              Current password
            </Label>
            <div className="relative">
              <Input
                id="current-password"
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showCurrent ? "Hide password" : "Show password"}
              >
                {showCurrent ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="new-password" className="text-xs">
            {hasPassword ? "New password" : "Password"}
          </Label>
          <div className="relative">
            <Input
              id="new-password"
              type={showNew ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={8}
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showNew ? "Hide password" : "Show password"}
            >
              {showNew ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm-password" className="text-xs">
            Confirm password
          </Label>
          <Input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>

        <Button
          type="submit"
          size="sm"
          disabled={isSubmitting || !newPassword || !confirmPassword}
          className="gap-1.5"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="h-4 w-4" aria-hidden="true" />
          )}
          {hasPassword ? "Update Password" : "Set Password"}
        </Button>
      </form>
    </Card>
  );
}
