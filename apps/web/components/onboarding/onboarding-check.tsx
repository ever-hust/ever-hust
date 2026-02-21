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
    try {
      if (sessionStorage.getItem("onboarding_dismissed")) return;
    } catch {
      // sessionStorage unavailable (e.g. sandboxed iframe) — check the server
    }

    const controller = new AbortController();

    async function check() {
      try {
        const res = await fetch("/api/user/profile", { signal: controller.signal });
        if (!res.ok || controller.signal.aborted) return;
        const data = (await res.json()) as {
          user: {
            name?: string;
            onboardingCompleted: boolean;
          };
        };

        if (!controller.signal.aborted) {
          if (!data.user.onboardingCompleted) {
            setUserName(data.user.name ?? undefined);
            setShowOnboarding(true);
          } else {
            // Cache completed state so future sessions skip the profile fetch
            try { sessionStorage.setItem("onboarding_dismissed", "1"); } catch { /* unavailable */ }
          }
        }
      } catch {
        // Non-blocking (AbortError, network, etc.)
      }
    }

    check();
    return () => { controller.abort(); };
  }, []);

  const handleComplete = () => {
    setShowOnboarding(false);
    try { sessionStorage.setItem("onboarding_dismissed", "1"); } catch { /* unavailable */ }
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
