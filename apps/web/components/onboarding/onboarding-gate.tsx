"use client";

import { useState, useEffect, type ReactNode } from "react";
import { Skeleton } from "@ever-hust/ui/skeleton";
import { OnboardingWizard } from "./onboarding-wizard";

interface OnboardingGateProps {
  children: ReactNode;
}

/**
 * Wraps dashboard content and conditionally renders the onboarding wizard
 * instead of `children` when the user hasn't completed onboarding.
 */
export function OnboardingGate({ children }: OnboardingGateProps) {
  const [status, setStatus] = useState<"loading" | "onboarding" | "done">("loading");
  const [userName, setUserName] = useState<string | undefined>();
  const [linkedInConnected, setLinkedInConnected] = useState(false);

  useEffect(() => {
    // Fast-path: if already completed in this session, skip the fetch
    try {
      if (sessionStorage.getItem("onboarding_completed")) {
        setStatus("done");
        return;
      }
    } catch {
      /* sessionStorage unavailable */
    }

    const controller = new AbortController();

    async function check() {
      try {
        // Fetch profile and connected accounts in parallel
        const [profileRes, accountsRes] = await Promise.all([
          fetch("/api/user/profile", { signal: controller.signal }),
          fetch("/api/user/accounts", { signal: controller.signal }),
        ]);

        if (controller.signal.aborted) return;

        if (profileRes.ok) {
          const profileData = (await profileRes.json()) as {
            user: { name?: string; onboardingCompleted: boolean };
          };
          if (profileData.user.onboardingCompleted) {
            try {
              sessionStorage.setItem("onboarding_completed", "1");
            } catch {
              /* unavailable */
            }
            setStatus("done");
            return;
          }
          setUserName(profileData.user.name ?? undefined);
        }

        if (accountsRes.ok) {
          const accountsData = (await accountsRes.json()) as {
            accounts: { providerId: string }[];
          };
          setLinkedInConnected(
            accountsData.accounts.some((a) => a.providerId === "linkedin"),
          );
        }

        if (!controller.signal.aborted) {
          setStatus("onboarding");
        }
      } catch {
        // If fetch fails, show dashboard (non-blocking)
        if (!controller.signal.aborted) setStatus("done");
      }
    }

    check();
    return () => {
      controller.abort();
    };
  }, []);

  const handleComplete = () => {
    try {
      sessionStorage.setItem("onboarding_completed", "1");
    } catch {
      /* unavailable */
    }
    setStatus("done");
  };

  if (status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-lg space-y-4">
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-64 w-full rounded-lg" />
          <Skeleton className="h-10 w-32 ml-auto rounded-md" />
        </div>
      </div>
    );
  }

  if (status === "onboarding") {
    return (
      <OnboardingWizard
        userName={userName}
        linkedInConnected={linkedInConnected}
        onComplete={handleComplete}
      />
    );
  }

  return <>{children}</>;
}
