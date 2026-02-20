"use client";

import { useEffect, useRef } from "react";
import { isInputElement, isInsideDialog, matchesShortcut } from "../lib/hook-utils";

interface KeyboardShortcut {
  /** Keyboard shortcut key (e.g., "k", "Escape", "/") */
  key: string;
  /** Modifier keys required */
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** Callback to run when shortcut is triggered */
  handler: () => void;
  /** Description for help display */
  description: string;
}

/**
 * Global keyboard shortcuts for the chat interface.
 *
 * Uses a ref to hold the latest shortcuts so the event listener is only
 * registered once per mount, avoiding unnecessary add/removeEventListener
 * churn when callers pass a new array reference on each render.
 *
 * Shortcuts:
 * - Cmd/Ctrl + K: Focus the chat input
 * - Escape: Clear current selection / close modals
 * - /: Focus the chat input (when not already focused)
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const inputFocused = isInputElement(target);
      const dialogOpen = isInsideDialog(target, event.key);

      for (const shortcut of shortcutsRef.current) {
        if (!matchesShortcut(event, shortcut)) continue;

        const ctrlOrMeta = shortcut.ctrl || shortcut.meta;

        // Allow Escape even when in inputs; otherwise only Ctrl/Cmd shortcuts
        if (inputFocused && event.key !== "Escape") {
          if (!ctrlOrMeta) continue;
        }

        // Skip non-Escape shortcuts when a dialog is open
        if (dialogOpen) continue;

        event.preventDefault();
        shortcut.handler();
        break;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);
}

/**
 * Default chat keyboard shortcuts.
 * Call with handler references to wire them up.
 */
export function getChatShortcuts(handlers: {
  focusInput: () => void;
  clearSelection?: () => void;
}): KeyboardShortcut[] {
  const shortcuts: KeyboardShortcut[] = [
    {
      key: "k",
      ctrl: true,
      handler: handlers.focusInput,
      description: "Focus chat input",
    },
    {
      key: "/",
      handler: handlers.focusInput,
      description: "Focus chat input",
    },
  ];

  if (handlers.clearSelection) {
    shortcuts.push({
      key: "Escape",
      handler: handlers.clearSelection,
      description: "Clear selection / close panel",
    });
  }

  return shortcuts;
}
