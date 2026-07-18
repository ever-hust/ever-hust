"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Global 429 interceptor — monkey-patches `window.fetch` to intercept
 * rate-limited (429) responses and show a user-friendly toast.
 *
 * De-duplicated: won't show more than one toast per 5 seconds.
 */
export function RateLimitInterceptor() {
  const lastToastRef = useRef(0);

  useEffect(() => {
    const originalFetch = window.fetch;

    window.fetch = async function patchedFetch(...args: Parameters<typeof fetch>): Promise<Response> {
      const response = await originalFetch.apply(this, args);

      // The chat panel renders its own (richer) message for limit errors —
      // including the "Daily message limit reached → Upgrade" nudge — so skip the
      // generic toast for that route to avoid a competing, less helpful message.
      const url =
        typeof args[0] === "string"
          ? args[0]
          : args[0] instanceof URL
            ? args[0].href
            : args[0] instanceof Request
              ? args[0].url
              : "";
      const isChatRoute = url.includes("/api/ai/chat");

      if (response.status === 429 && !isChatRoute) {
        const now = Date.now();
        if (now - lastToastRef.current > 5000) {
          lastToastRef.current = now;

          // Try to read retry-after header
          const retryAfter = response.headers.get("Retry-After")
            ?? response.headers.get("X-RateLimit-Reset");

          const seconds = retryAfter ? Math.ceil(Number(retryAfter)) : null;
          const message = seconds && !isNaN(seconds)
            ? `Too many requests — please wait ${seconds} seconds`
            : "Too many requests — please slow down";

          toast.error(message, {
            id: "rate-limit-toast",
            duration: 5000,
          });
        }
      }

      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null; // Invisible — just patches fetch
}
