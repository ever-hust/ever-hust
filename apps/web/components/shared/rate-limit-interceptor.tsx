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

      if (response.status === 429) {
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
