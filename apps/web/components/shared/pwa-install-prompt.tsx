"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@repo/ui/button";

/** Delay (ms) before showing the install banner after the event fires. */
const PWA_PROMPT_DELAY_MS = 3_000;

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

/**
 * PWA install prompt banner.
 * Shows when the browser's beforeinstallprompt event fires (indicating the app
 * is installable) and the user hasn't previously dismissed it.
 *
 * The prompt is hidden:
 * - In standalone/PWA mode (already installed)
 * - After the user dismisses it (persisted in localStorage)
 * - On browsers that don't support PWA install
 */
export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Don't show if already in PWA mode
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    if ("standalone" in window.navigator && (window.navigator as Record<string, unknown>).standalone === true) return;

    // Don't show if user previously dismissed
    const dismissed = localStorage.getItem("pwa-install-dismissed");
    if (dismissed) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Small delay so page loads first — track timer for cleanup
      delayTimerRef.current = setTimeout(() => setShowBanner(true), PWA_PROMPT_DELAY_MS);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setShowBanner(false);
    setDeferredPrompt(null);
    localStorage.setItem("pwa-install-dismissed", "true");
  }, []);

  if (!showBanner) return null;

  return (
    <div
      role="banner"
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md transition-all duration-300 md:left-auto md:right-4"
    >
      <div className="flex items-center gap-3 rounded-lg border bg-card p-4 shadow-lg">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Download className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Install Ever Jobs</p>
          <p className="text-xs text-muted-foreground">
            Get quick access from your home screen
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={handleInstall} className="h-8 text-xs">
            Install
          </Button>
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="Dismiss install prompt"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
