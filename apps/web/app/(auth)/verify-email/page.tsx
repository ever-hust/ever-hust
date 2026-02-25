"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@ever-hust/ui/card";
import { Button } from "@ever-hust/ui/button";
import { BriefcaseBusiness, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { APP_NAME } from "@ever-hust/utils";
import { Suspense } from "react";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [errorMessage, setErrorMessage] = useState("Verification link is invalid or expired.");

  const verify = useCallback(async () => {
    if (!token) {
      setStatus("error");
      setErrorMessage("No verification token found. Please check your email for the correct link.");
      return;
    }

    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (res.ok) {
        setStatus("success");
        // Auto-redirect to dashboard after 3 seconds
        setTimeout(() => router.push("/dashboard"), 3000);
      } else {
        const data = await res.json().catch(() => ({}));
        setStatus("error");
        setErrorMessage(
          (data as { message?: string }).message ?? "Verification link is invalid or expired."
        );
      }
    } catch {
      setStatus("error");
      setErrorMessage("Network error. Please check your connection and try again.");
    }
  }, [token, router]);

  useEffect(() => {
    verify();
  }, [verify]);

  return (
    <div id="main-content" className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2" aria-label={`${APP_NAME} home`}>
            <BriefcaseBusiness className="h-8 w-8 text-primary" aria-hidden="true" />
            <span className="text-2xl font-bold">{APP_NAME}</span>
          </Link>
        </div>

        <Card className="shadow-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">
              {status === "verifying" && "Verifying your email…"}
              {status === "success" && "Email verified!"}
              {status === "error" && "Verification failed"}
            </CardTitle>
            <CardDescription>
              {status === "verifying" && "Please wait while we verify your email address."}
              {status === "success" && "Your account is now active."}
              {status === "error" && "We couldn't verify your email."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            {status === "verifying" && (
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            )}

            {status === "success" && (
              <>
                <CheckCircle2 className="h-12 w-12 text-green-500" />
                <p className="text-sm text-muted-foreground text-center">
                  Redirecting you to the dashboard…
                </p>
                <Button asChild className="w-full">
                  <Link href="/dashboard">Go to Dashboard</Link>
                </Button>
              </>
            )}

            {status === "error" && (
              <>
                <XCircle className="h-12 w-12 text-destructive" />
                <p className="text-sm text-destructive text-center">{errorMessage}</p>
                <div className="flex flex-col gap-2 w-full">
                  <Button onClick={verify} variant="outline" className="w-full">
                    Try Again
                  </Button>
                  <Button asChild variant="ghost" className="w-full">
                    <Link href="/login">Back to Sign In</Link>
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link href="/" className="transition-colors hover:text-foreground">
            &larr; Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
