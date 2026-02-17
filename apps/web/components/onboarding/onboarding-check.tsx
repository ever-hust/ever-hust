"use client";

import { useState, useEffect } from "react";
import { OnboardingDialog } from "./onboarding-dialog";

/**
 * Client component that checks if the current user needs onboarding.
 * Renders the OnboardingDialog if they haven't completed it yet.
 *
 * Place this in the dashboard layout so it fires on any dashboard page.
 */
export function OnboardingCheck() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [userName, setUserName] = useState<string | undefined>();

  useEffect(() => {
    // Don't show onboarding if user already dismissed in this session
    if (sessionStorage.getItem("onboarding_dismissed")) return;

    async function check() {
      try {
        const res = await fetch("/api/user/profile");
        if (!res.ok) return;
        const data = (await res.json()) as {
          user: {
            name?: string;
            onboardingCompleted: boolean;
          };
        };

        if (!data.user.onboardingCompleted) {
          setUserName(data.user.name ?? undefined);
          setShowOnboarding(true);
        }
      } catch {
        // Non-blocking
      }
    }

    check();
  }, []);

  const handleComplete = () => {
    setShowOnboarding(false);
    sessionStorage.setItem("onboarding_dismissed", "1");
  };

  if (!showOnboarding) return null;

  return (
    <OnboardingDialog
      open={showOnboarding}
      onComplete={handleComplete}
      userName={userName}
    />
  );
}
