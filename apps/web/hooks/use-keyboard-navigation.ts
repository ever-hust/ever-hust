"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

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
        // Set a flag that we're in "go to" mode
        const handler = (next: KeyboardEvent) => {
          window.removeEventListener("keydown", handler);
          clearTimeout(timeout);

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

        // Listen for the next key within 1 second
        const timeout = setTimeout(() => {
          window.removeEventListener("keydown", handler);
        }, 1000);

        window.addEventListener("keydown", handler);
        return;
      }
    },
    [router]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
