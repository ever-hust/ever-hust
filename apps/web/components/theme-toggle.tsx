"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@repo/ui/button";

/**
 * Theme toggle that cycles through: light → dark → system.
 * Shows the current icon for the selected theme.
 */
export function ThemeToggle() {
  const { setTheme, theme } = useTheme();

  const cycle = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  const label =
    theme === "light"
      ? "Switch to dark theme"
      : theme === "dark"
        ? "Switch to system theme"
        : "Switch to light theme";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycle}
      aria-label={label}
      title={label}
      className="relative"
    >
      {/* Light mode: Sun */}
      <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      {/* Dark mode: Moon */}
      <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      {/* System indicator dot */}
      {theme === "system" && (
        <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary" />
      )}
    </Button>
  );
}
