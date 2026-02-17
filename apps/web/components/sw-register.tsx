"use client";

import { useEffect } from "react";

/**
 * Registers the service worker for PWA support.
 * Should be included once in the root layout.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production"
    ) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("Service worker registration failed:", err);
      });
    }
  }, []);

  return null;
}
