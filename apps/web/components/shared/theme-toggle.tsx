"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { Button } from "@ever-hust/ui/button";

/** The label rendered on the server and on the first client render, before the theme is known. */
export const THEME_TOGGLE_PENDING_LABEL = "Toggle theme";

/**
 * The toggle's accessible label. The theme is unknown on the server (next-themes reads it from
 * localStorage / `prefers-color-scheme` in the browser), so until the component has mounted the
 * label must not depend on it: otherwise the server says "Switch to dark mode", the client's first
 * render says "Switch to light mode", and React reports a hydration mismatch on the login page.
 */
export function themeToggleLabel(mounted: boolean, resolvedTheme: string | undefined): string {
  if (!mounted) return THEME_TOGGLE_PENDING_LABEL;
  return `Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`;
}

/**
 * A compact dark mode toggle for auth / marketing pages.
 * Uses `next-themes` `useTheme()` to toggle between light and dark.
 * The icons switch through the `dark:` class, which needs no JS, so only the label waits for mount.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const label = themeToggleLabel(mounted, resolvedTheme);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9 rounded-full"
      aria-label={label}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </Button>
  );
}
