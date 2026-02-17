"use client";

import { useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

/** Time window (ms) for the second key after pressing "g". */
const GO_TO_MODE_TIMEOUT_MS = 1_000;

/**
 * Hook that registers global keyboard shortcuts for sidebar navigation.
 * Uses `g` then a letter key (vim-style "go to" pattern):
 *   g c → Go to Chat
 *   g j → Go to Jobs
 *   g a → Go to Applications
 *   g f → Go to Favorites
 *   g p → Go to Profile
 *   g s → Go to Settings
 *
 * Also supports:
 *   Ctrl/Cmd+K → Focus chat input (handled elsewhere)
 *   ? → Toggle keyboard shortcuts help (handled in KeyboardShortcutsHelp)
 */
export function useKeyboardNavigation() {
  const router = useRouter();

  // Track the current go-to handler + timeout so we can clean up previous
  // registrations if the user presses "g" multiple times quickly.
  const goToHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null);
  const goToTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Remove any in-flight go-to mode listener/timer. */
  const cleanupGoToMode = useCallback(() => {
    if (goToHandlerRef.current) {
      window.removeEventListener("keydown", goToHandlerRef.current);
      goToHandlerRef.current = null;
    }
    if (goToTimeoutRef.current) {
      clearTimeout(goToTimeoutRef.current);
      goToTimeoutRef.current = null;
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Don't trigger with modifier keys (except for specific combos)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Handle "g" prefix - start listening for next key
      if (e.key === "g" && !e.shiftKey) {
        // Clean up any previous go-to mode (e.g. user pressed "g" twice)
        cleanupGoToMode();

        const handler = (next: KeyboardEvent) => {
          cleanupGoToMode();

          // Check the target again
          const nextTarget = next.target as HTMLElement;
          if (
            nextTarget.tagName === "INPUT" ||
            nextTarget.tagName === "TEXTAREA" ||
            nextTarget.isContentEditable
          ) {
            return;
          }

          switch (next.key) {
            case "c":
              next.preventDefault();
              router.push("/chat");
              break;
            case "j":
              next.preventDefault();
              router.push("/jobs");
              break;
            case "a":
              next.preventDefault();
              router.push("/applications");
              break;
            case "f":
              next.preventDefault();
              router.push("/favorites");
              break;
            case "p":
              next.preventDefault();
              router.push("/profile");
              break;
            case "s":
              next.preventDefault();
              router.push("/settings");
              break;
          }
        };

        goToHandlerRef.current = handler;
        goToTimeoutRef.current = setTimeout(cleanupGoToMode, GO_TO_MODE_TIMEOUT_MS);

        window.addEventListener("keydown", handler);
        return;
      }
    },
    [router, cleanupGoToMode]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      // Clean up any pending go-to mode on unmount
      cleanupGoToMode();
    };
  }, [handleKeyDown, cleanupGoToMode]);
}
