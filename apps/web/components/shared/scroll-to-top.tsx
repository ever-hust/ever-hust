"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@repo/ui/lib/utils";

interface ScrollToTopProps {
  /** The scrollable container element ref. If not provided, uses window scroll. */
  containerRef?: React.RefObject<HTMLElement | null>;
  /** Scroll distance (px) before the button appears. Default: 400 */
  threshold?: number;
  className?: string;
}

/**
 * Floating "scroll to top" button that appears when the user
 * has scrolled past a threshold. Supports both window scroll
 * and scrollable container elements.
 */
export function ScrollToTop({
  containerRef,
  threshold = 400,
  className,
}: ScrollToTopProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = containerRef?.current ?? window;
    const handleScroll = () => {
      if (containerRef?.current) {
        setVisible(containerRef.current.scrollTop > threshold);
      } else {
        setVisible(window.scrollY > threshold);
      }
    };

    target.addEventListener("scroll", handleScroll, { passive: true });
    return () => target.removeEventListener("scroll", handleScroll);
  }, [containerRef, threshold]);

  const scrollToTop = useCallback(() => {
    if (containerRef?.current) {
      containerRef.current.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [containerRef]);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={scrollToTop}
      className={cn(
        "fixed bottom-6 right-6 z-40 flex h-10 w-10 items-center justify-center rounded-full border bg-card shadow-lg transition-all hover:bg-accent hover:shadow-xl active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "animate-in fade-in slide-in-from-bottom-4 duration-200",
        className
      )}
      aria-label="Scroll to top"
    >
      <ArrowUp className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
