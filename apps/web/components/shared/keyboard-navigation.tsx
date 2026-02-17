"use client";

import { useKeyboardNavigation } from "@/hooks/use-keyboard-navigation";

/**
 * Invisible component that registers keyboard navigation shortcuts.
 * Place in the dashboard layout to enable vim-style "g" shortcuts.
 */
export function KeyboardNavigation() {
  useKeyboardNavigation();
  return null;
}
