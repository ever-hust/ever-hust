"use client";

import { useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { safeExternalUrl } from "@/lib/safe-url";

type SubscriptionStatus = "free" | "active" | "canceled" | "past_due";

interface SubscriptionInfo {
  /** Current plan status */
  status: SubscriptionStatus;
  /** Whether the user has an active paid plan */
  isSubscribed: boolean;
  /** Whether data is still loading */
  isLoading: boolean;
  /** Error message if subscription status fetch failed */
  error: string | null;
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

function parseStatus(raw: string): SubscriptionStatus {
  if (raw === "active" || raw === "canceled" || raw === "past_due") return raw;
  return "free";
}

/**
 * Hook for managing the user's subscription status.
 *
 * - Fetches subscription status from `/api/user/profile`
 * - Provides `isSubscribed` boolean for gating Pro features
 * - Includes `upgrade()` and `manageSubscription()` helpers
 */
export function useSubscription(): SubscriptionInfo {
  const { data, isLoading, error } = useQuery({
    queryKey: ["subscription"],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/user/profile", { signal });
      if (!res.ok) throw new Error("Failed to load subscription status");
      const json = (await res.json()) as {
        user: { subscriptionStatus: string };
      };
      return parseStatus(json.user.subscriptionStatus);
    },
  });

  const status = data ?? "free";
  const isSubscribed = useMemo(() => status === "active" || status === "past_due", [status]);

  const upgrade = useCallback(async (planId = "quarterly") => {
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });

      if (res.ok) {
        const data = (await res.json()) as { url: string };
        const safeUrl = safeExternalUrl(data.url);
        if (safeUrl) {
          window.location.href = safeUrl;
          return;
        }
      }
      throw new Error("Failed to start checkout");
    } catch (err) {
      console.warn(
        "[useSubscription] Checkout failed:",
        err instanceof Error ? err.message : err
      );
      throw new Error("Failed to start checkout. Please try again.");
    }
  }, []);

  const manageSubscription = useCallback(async () => {
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      if (res.ok) {
        const data = (await res.json()) as { url: string };
        const safeUrl = safeExternalUrl(data.url);
        if (safeUrl) {
          window.location.href = safeUrl;
          return;
        }
      }
      throw new Error("Failed to open portal");
    } catch (err) {
      console.warn(
        "[useSubscription] Portal failed:",
        err instanceof Error ? err.message : err
      );
      throw new Error(
        "Failed to open subscription portal. Please try again."
      );
    }
  }, []);

  return {
    status,
    isSubscribed,
    isLoading,
    error: error?.message ?? null,
    upgrade,
    manageSubscription,
  };
}
