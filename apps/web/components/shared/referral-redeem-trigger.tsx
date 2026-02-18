"use client";

import { useReferralRedeem } from "@/hooks/use-referral-redeem";

/**
 * Invisible client component that triggers referral code redemption
 * after the user lands on any authenticated dashboard page.
 *
 * Placed in the dashboard layout so it runs once per session.
 */
export function ReferralRedeemTrigger() {
  useReferralRedeem();
  return null;
}
