"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

type SubscriptionStatus = "free" | "active" | "canceled" | "past_due";

interface SubscriptionInfo {
  /** Current plan status */
  status: SubscriptionStatus;
  /** Whether the user has an active paid plan */
  isSubscribed: boolean;
  /** Whether data is still loading */
  isLoading: boolean;
  /** Navigate to Stripe checkout for upgrade */
  upgrade: (planId?: string) => Promise<void>;
  /** Navigate to Stripe customer portal */
  manageSubscription: () => Promise<void>;
}

// Free-tier limits
export const FREE_LIMITS = {
  messagesPerDay: 10,
  searchesPerDay: 5,
  coverLettersPerWeek: 1,
  alerts: false,
} as const;

// Pro-tier limits
export const PRO_LIMITS = {
  messagesPerDay: Infinity,
  searchesPerDay: Infinity,
  coverLettersPerWeek: Infinity,
  alerts: true,
} as const;

/**
 * Hook for managing the user's subscription status.
 *
 * - Fetches subscription status from `/api/user/profile`
 * - Provides `isSubscribed` boolean for gating Pro features
 * - Includes `upgrade()` and `manageSubscription()` helpers
 */
export function useSubscription(): SubscriptionInfo {
  const [status, setStatus] = useState<SubscriptionStatus>("free");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSubscription() {
      try {
        const res = await fetch("/api/user/profile", { signal: controller.signal });
        if (res.ok && !controller.signal.aborted) {
          const data = (await res.json()) as {
            user: { subscriptionStatus: string };
          };
          const s = data.user.subscriptionStatus;
          if (
            s === "active" ||
            s === "canceled" ||
            s === "past_due"
          ) {
            setStatus(s);
          } else {
            setStatus("free");
          }
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.warn(
          "[useSubscription] Failed to load subscription status:",
          error instanceof Error ? error.message : error
        );
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    loadSubscription();
    return () => { controller.abort(); };
  }, []);

  const isSubscribed = useMemo(() => status === "active", [status]);

  const upgrade = useCallback(async (planId = "quarterly") => {
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });

      if (res.ok) {
        const data = (await res.json()) as { url: string };
        if (data.url) {
          window.location.href = data.url;
          return;
        }
      }
      throw new Error("Failed to start checkout");
    } catch {
      // Let the caller handle the error through UI
      throw new Error("Failed to start checkout. Please try again.");
    }
  }, []);

  const manageSubscription = useCallback(async () => {
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      if (res.ok) {
        const data = (await res.json()) as { url: string };
        if (data.url) {
          window.location.href = data.url;
          return;
        }
      }
      throw new Error("Failed to open portal");
    } catch {
      throw new Error(
        "Failed to open subscription portal. Please try again."
      );
    }
  }, []);

  return {
    status,
    isSubscribed,
    isLoading,
    upgrade,
    manageSubscription,
  };
}
