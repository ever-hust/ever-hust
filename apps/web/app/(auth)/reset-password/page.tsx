"use client";

import { Suspense, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@ever-hust/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@ever-hust/ui/card";
import { Input } from "@ever-hust/ui/input";
import { Label } from "@ever-hust/ui/label";
import { BriefcaseBusiness, Lock, Eye, EyeOff, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { APP_NAME } from "@ever-hust/utils";
import { ThemeToggle } from "@/components/shared/theme-toggle";

/* ------------------------------------------------------------------ */
/*  Inner form — needs useSearchParams so must be wrapped in Suspense */
/* ------------------------------------------------------------------ */

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!token) {
        toast.error("Missing reset token. Please request a new reset link.");
        return;
      }
      if (password.length < 8) {
        toast.error("Password must be at least 8 characters.");
        return;
      }
      if (password !== confirmPassword) {
        toast.error("Passwords do not match.");
        return;
      }

      setLoading(true);
      try {
        const res = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, newPassword: password }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          const msg =
            (body as { message?: string } | null)?.message ??
            "Failed to reset password. The link may have expired.";
          toast.error(msg);
          return;
        }

        setSuccess(true);
        toast.success("Password reset! Redirecting to sign in…");
        setTimeout(() => router.push("/login"), 2000);
      } catch {
        toast.error("Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [token, password, confirmPassword, router],
  );

  // No token in URL — show error state
  if (!token) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-7 w-7 text-destructive" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Invalid Reset Link</h2>
          <p className="mt-1 text-sm text-muted-foreground max-w-xs">
            This password reset link is invalid or has expired. Please request a new one.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/login">Back to Sign In</Link>
        </Button>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-950/30">
          <CheckCircle2 className="h-7 w-7 text-green-600 dark:text-green-400" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Password Reset!</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your password has been updated. Redirecting to sign in…
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="new-password" className="text-xs">
          New password
        </Label>
        <div className="relative">
          <Input
            id="new-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={8}
            autoComplete="new-password"
            autoFocus
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
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

      <Button type="submit" className="w-full gap-2" size="lg" disabled={loading}>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        ) : (
          <Lock className="h-4 w-4" aria-hidden="true" />
        )}
        Reset Password
      </Button>

      <Link
        href="/login"
        className="block w-full text-center text-xs text-muted-foreground hover:text-primary transition-colors"
      >
        Back to Sign In
      </Link>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

export default function ResetPasswordPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 p-4">
      {/* Dark mode toggle */}
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-2">
          <Link href="/" className="mx-auto mb-4 flex items-center gap-2">
            <BriefcaseBusiness className="h-8 w-8 text-primary" aria-hidden="true" />
            <span className="text-xl font-bold">{APP_NAME}</span>
          </Link>
          <CardTitle className="text-xl">Reset Your Password</CardTitle>
          <CardDescription>
            Enter a new password for your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <ResetPasswordForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
