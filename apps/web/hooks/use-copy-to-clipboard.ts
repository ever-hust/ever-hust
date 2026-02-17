"use client";

import { useState, useCallback, useRef, useEffect } from "react";

/** Duration to show the "Copied!" feedback (ms). */
const DEFAULT_FEEDBACK_MS = 2_000;

/**
 * Hook that provides a `copy` function and a `copied` boolean.
 * After a successful copy, `copied` is `true` for `feedbackMs` (default 2 s)
 * then resets to `false`. Timer is cleaned up on unmount.
 */
export function useCopyToClipboard(feedbackMs = DEFAULT_FEEDBACK_MS) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Fallback for older browsers — use a temporary textarea
        try {
          const textarea = document.createElement("textarea");
          textarea.value = text;
          textarea.style.position = "fixed";
          textarea.style.opacity = "0";
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          document.body.removeChild(textarea);
        } catch {
          // Both clipboard methods failed
          return;
        }
      }
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), feedbackMs);
    },
    [feedbackMs]
  );

  return { copied, copy } as const;
}
