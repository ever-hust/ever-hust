"use client";

import { useEffect, useRef, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { cn } from "@repo/ui/lib/utils";

/** How long to show the "back online" banner before auto-hiding (ms). */
const RECONNECTION_BANNER_MS = 3_000;

/**
 * Shows a banner when the user loses internet connection.
 * Briefly shows a success banner when connectivity is restored.
 */
export function ConnectionStatus() {
  const [isOffline, setIsOffline] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Check initial state
    if (!navigator.onLine) {
      setIsOffline(true);
      setShowBanner(true);
    }

    const handleOffline = () => {
      // Cancel any pending "hide banner" timer from a previous reconnection
      if (timerRef.current) clearTimeout(timerRef.current);
      setIsOffline(true);
      setShowBanner(true);
    };

    const handleOnline = () => {
      setIsOffline(false);
      // Show "back online" banner briefly to confirm reconnection, then auto-hide
      setShowBanner(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setShowBanner(false), RECONNECTION_BANNER_MS);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!showBanner) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        "fixed inset-x-0 top-0 z-[9999] flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-white shadow-md transition-all duration-300",
        isOffline ? "bg-destructive" : "bg-emerald-500"
      )}
    >
      {isOffline ? (
        <>
          <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
          No internet connection — some features may not work
        </>
      ) : (
        <>
          <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
          You&apos;re back online
        </>
      )}
    </div>
  );
}
