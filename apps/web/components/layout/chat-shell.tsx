"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  MessageSquare,
} from "lucide-react";
import { cn } from "@ever-hust/ui/lib/utils";
import { ChatPanel } from "@/components/chat/chat-panel";
import { useChatContext } from "@/components/chat/chat-context";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ChatShellProps {
  children: React.ReactNode;
}

export function ChatShell({ children }: ChatShellProps) {
  const { chatOpen, toggleChat, onToolResult, onCoverLetter, initialPrompt } =
    useChatContext();

  // Track if component has mounted (for initial animation prevention)
  const mounted = useRef(false);
  const [enableTransition, setEnableTransition] = useState(false);

  useEffect(() => {
    // Enable transition only after first render to prevent initial animation
    const timer = setTimeout(() => {
      mounted.current = true;
      setEnableTransition(true);
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  // Mobile slide-over state
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleMobileToggle = useCallback(() => {
    setMobileOpen((prev) => !prev);
  }, []);

  const handleMobileClose = useCallback(() => {
    setMobileOpen(false);
  }, []);

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* ── Desktop chat panel ────────────────────────────────── */}
      <div
        className={cn(
          "relative hidden flex-col border-r md:flex",
          "chat-panel-desktop",
          enableTransition && "chat-panel-animated",
          chatOpen ? "chat-panel-open" : "chat-panel-closed",
        )}
      >
        <ChatPanel
          onToolResult={onToolResult}
          onCoverLetter={onCoverLetter}
          initialPrompt={initialPrompt}
        />
      </div>

      {/* ── Toggle button (desktop) ───────────────────────────── */}
      <button
        type="button"
        onClick={toggleChat}
        className={cn(
          "group hidden md:flex",
          "items-center justify-center",
          "w-5 flex-shrink-0",
          "border-r bg-muted/30 hover:bg-muted/60",
          "text-muted-foreground hover:text-foreground",
          "transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        )}
        aria-label={chatOpen ? "Collapse chat" : "Expand chat"}
        title={chatOpen ? "Collapse chat (⌘+B)" : "Expand chat (⌘+B)"}
      >
        {chatOpen ? (
          <PanelLeftClose className="h-4 w-4 opacity-50 group-hover:opacity-100 transition-opacity" />
        ) : (
          <PanelLeftOpen className="h-4 w-4 opacity-50 group-hover:opacity-100 transition-opacity" />
        )}
      </button>

      {/* ── Canvas (page content) ─────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {children}
      </div>

      {/* ── Mobile: floating chat button ──────────────────────── */}
      <button
        type="button"
        onClick={handleMobileToggle}
        className={cn(
          "fixed bottom-4 right-4 z-40 md:hidden",
          "flex h-12 w-12 items-center justify-center",
          "rounded-full bg-primary text-primary-foreground shadow-lg",
          "transition-transform duration-200",
          mobileOpen && "scale-0",
        )}
        aria-label="Open chat"
      >
        <MessageSquare className="h-5 w-5" />
      </button>

      {/* ── Mobile: chat slide-over ───────────────────────────── */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={handleMobileClose}
            aria-hidden="true"
          />
          {/* Panel */}
          <div
            className={cn(
              "fixed inset-y-0 left-0 z-50 w-[85vw] max-w-md md:hidden",
              "flex flex-col bg-background shadow-2xl",
              "animate-in slide-in-from-left-full duration-300",
            )}
          >
            {/* Close button inside mobile panel */}
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-sm font-medium">Chat</span>
              <button
                type="button"
                onClick={handleMobileClose}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                aria-label="Close chat"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
            <ChatPanel
              onToolResult={onToolResult}
              onCoverLetter={onCoverLetter}
              initialPrompt={initialPrompt}
            />
          </div>
        </>
      )}
    </div>
  );
}
