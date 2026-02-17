import type { Metadata } from "next";
import { Sidebar } from "@/components/layout/sidebar";
import { OnboardingCheck } from "@/components/onboarding/onboarding-check";
import { PWAInstallPrompt } from "@/components/shared/pwa-install-prompt";
import { KeyboardShortcutsHelp } from "@/components/shared/keyboard-shortcuts-help";
import { KeyboardNavigation } from "@/components/shared/keyboard-navigation";

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
      {/* Skip to main content link for keyboard/screen reader users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:shadow-lg"
      >
        Skip to main content
      </a>
      <Sidebar />
      <main id="main-content" className="flex flex-1 flex-col overflow-hidden">{children}</main>
      <OnboardingCheck />
      <PWAInstallPrompt />
      <KeyboardShortcutsHelp />
      <KeyboardNavigation />
    </div>
  );
}
