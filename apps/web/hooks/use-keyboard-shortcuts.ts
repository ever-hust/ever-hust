"use client";

import { useEffect, useRef } from "react";

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
      // Ignore shortcuts when typing in inputs/textareas (except Escape)
      const target = event.target as HTMLElement;
      const isInputFocused =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      for (const shortcut of shortcutsRef.current) {
        const ctrlOrMeta = shortcut.ctrl || shortcut.meta;
        const modifierMatch = ctrlOrMeta
          ? event.ctrlKey || event.metaKey
          : true;

        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
        const altMatch = shortcut.alt ? event.altKey : !event.altKey;

        if (
          event.key.toLowerCase() === shortcut.key.toLowerCase() &&
          modifierMatch &&
          shiftMatch &&
          altMatch
        ) {
          // Allow Escape even when in inputs
          if (isInputFocused && event.key !== "Escape") {
            // Only allow Ctrl/Cmd shortcuts when in inputs
            if (!ctrlOrMeta) continue;
          }

          event.preventDefault();
          shortcut.handler();
          break;
        }
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
  toggleCanvas?: () => void;
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

  if (handlers.toggleCanvas) {
    shortcuts.push({
      key: "\\",
      ctrl: true,
      handler: handlers.toggleCanvas,
      description: "Toggle jobs canvas",
    });
  }

  return shortcuts;
}
