"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { isValidReferralCode } from "../lib/hook-utils";

const STORAGE_KEY = "ej_referral_code";

/**
 * Hook that checks for a stored referral code in localStorage (set during
 * the login page via `?ref=CODE`) and automatically redeems it by calling
 * POST /api/referrals/redeem.
 *
 * This hook is meant to be placed in a component that renders after
 * successful authentication (e.g., the dashboard layout or chat page).
 * It runs exactly once per mount and clears the stored code regardless
 * of whether redemption succeeds, to prevent repeated attempts.
 */
export function useReferralRedeem() {
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    let code: string | null = null;
    try {
      code = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // localStorage unavailable
      return;
    }

    if (!code) return;

    // Clear the code immediately to prevent duplicate redemptions
    // even if the network request fails or the component re-mounts.
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }

    // Validate format before sending
    if (!isValidReferralCode(code)) return;

    async function redeemReferral(referralCode: string) {
      try {
        const res = await fetch("/api/referrals/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: referralCode }),
        });

        if (res.ok) {
          toast.success("Referral code applied! Your referrer earned credits.");
        } else {
          // Silently ignore errors — the code may already be used, invalid,
          // or belong to the current user. These are not actionable by the user.
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          if (data.error) {
            console.info(
              "[useReferralRedeem] Referral redemption skipped:",
              data.error
            );
          }
        }
      } catch {
        // Network error — silently ignore. The code has already been
        // cleared from localStorage so it won't be retried.
        console.warn("[useReferralRedeem] Failed to reach referral API");
      }
    }

    redeemReferral(code);
  }, []);
}
