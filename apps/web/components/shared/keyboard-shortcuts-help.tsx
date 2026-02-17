"use client";

import { useEffect, useState, useCallback } from "react";
import { Keyboard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@repo/ui/dialog";

interface ShortcutEntry {
  keys: string[];
  description: string;
}

const SHORTCUT_SECTIONS: {
  title: string;
  shortcuts: ShortcutEntry[];
}[] = [
  {
    title: "Chat",
    shortcuts: [
      { keys: ["⌘", "K"], description: "Focus chat input" },
      { keys: ["/"], description: "Focus chat input" },
      { keys: ["Esc"], description: "Close panel / clear selection" },
      { keys: ["Enter"], description: "Send message" },
      { keys: ["Shift", "Enter"], description: "New line in message" },
    ],
  },
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["g", "c"], description: "Go to Chat" },
      { keys: ["g", "j"], description: "Go to Jobs" },
      { keys: ["g", "a"], description: "Go to Applications" },
      { keys: ["g", "f"], description: "Go to Favorites" },
      { keys: ["g", "p"], description: "Go to Profile" },
      { keys: ["g", "s"], description: "Go to Settings" },
      { keys: ["⌘", "\\"], description: "Toggle jobs canvas" },
      { keys: ["?"], description: "Show keyboard shortcuts" },
    ],
  },
  {
    title: "Jobs",
    shortcuts: [
      { keys: ["↑", "↓"], description: "Navigate job list" },
      { keys: ["Enter"], description: "View job details" },
      { keys: ["Esc"], description: "Close job details" },
    ],
  },
];

/**
 * Keyboard shortcuts help modal.
 * Opens with `?` key (when not typing in an input).
 * Shows all available keyboard shortcuts organized by section.
 */
export function KeyboardShortcutsHelp() {
  const [isOpen, setIsOpen] = useState(false);

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

      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    },
    []
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Detect OS for modifier key display
  const isMac =
    typeof navigator !== "undefined" &&
    navigator.platform?.toLowerCase().includes("mac");

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" aria-hidden="true" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Navigate faster with these keyboard shortcuts.
            {!isMac && (
              <span className="block mt-1 text-xs">
                Use Ctrl instead of ⌘ on Windows/Linux.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {SHORTCUT_SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {section.title}
              </h3>
              <div className="space-y-1">
                {section.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.description}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent/50"
                  >
                    <span className="text-muted-foreground">
                      {shortcut.description}
                    </span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, i) => {
                        // Use "then" separator for sequential keys (all lowercase single chars)
                        const isSequential =
                          shortcut.keys.length === 2 &&
                          shortcut.keys.every(
                            (k) => k.length === 1 && k === k.toLowerCase()
                          );
                        return (
                          <span key={i}>
                            {i > 0 && (
                              <span className="mx-0.5 text-[10px] text-muted-foreground">
                                {isSequential ? "then" : "+"}
                              </span>
                            )}
                            <kbd className="inline-flex min-w-[24px] items-center justify-center rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground">
                              {key === "⌘" && !isMac ? "Ctrl" : key}
                            </kbd>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-[10px] text-muted-foreground">
          Press{" "}
          <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">
            ?
          </kbd>{" "}
          to toggle this dialog
        </p>
      </DialogContent>
    </Dialog>
  );
}
