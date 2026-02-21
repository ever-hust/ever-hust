import type { Metadata } from "next";
import { Sidebar } from "@/components/layout/sidebar";
import { OnboardingCheck } from "@/components/onboarding/onboarding-check";
import { PWAInstallPrompt } from "@/components/shared/pwa-install-prompt";
import { KeyboardShortcutsHelp } from "@/components/shared/keyboard-shortcuts-help";
import { KeyboardNavigation } from "@/components/shared/keyboard-navigation";
import { ReferralRedeemTrigger } from "@/components/shared/referral-redeem-trigger";

export const metadata: Metadata = {
  title: {
    default: "Dashboard",
    template: "%s | Ever Jobs",
  },
  robots: {
    index: false, // Dashboard pages should not be indexed
  },
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main id="main-content" className="flex flex-1 flex-col overflow-hidden">{children}</main>
      <OnboardingCheck />
      <PWAInstallPrompt />
      <KeyboardShortcutsHelp />
      <KeyboardNavigation />
      <ReferralRedeemTrigger />
    </div>
  );
}
