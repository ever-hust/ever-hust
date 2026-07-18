"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatContextValue {
  /** Whether the chat panel is expanded (visible). */
  chatOpen: boolean;
  /** Toggle or set the chat panel open/closed. */
  setChatOpen: (open: boolean) => void;
  /** Toggle the chat panel. */
  toggleChat: () => void;
  /** Open chat panel, focus the input, and briefly highlight it. */
  focusChatInput: () => void;

  // Callbacks for bridging ChatPanel ↔ canvas (e.g. JobsCanvas)
  /** Called when ChatPanel receives a tool result (search, favorite, etc.) */
  onToolResult: ((toolName: string, result: unknown) => void) | undefined;
  setOnToolResult: (cb: ((toolName: string, result: unknown) => void) | undefined) => void;

  /** Called when ChatPanel produces a cover letter. */
  onCoverLetter: ((text: string) => void) | undefined;
  setOnCoverLetter: (cb: ((text: string) => void) | undefined) => void;

  /** Initial prompt to pre-fill the chat input (e.g. from deep link or compare). */
  initialPrompt: string | undefined;
  /** When true, ChatPanel auto-sends the initialPrompt (frictionless trial via ?m=). */
  initialPromptAutoSend: boolean;
  setInitialPrompt: (prompt: string | undefined, autoSend?: boolean) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ChatContext = createContext<ChatContextValue | null>(null);

const STORAGE_KEY = "hust-chat-open";

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ChatProvider({ children }: { children: ReactNode }) {
  const [chatOpen, setChatOpenRaw] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "false") setChatOpenRaw(false);
    } catch {
      // localStorage not available
    }
    setHydrated(true);
  }, []);

  const setChatOpen = useCallback((open: boolean) => {
    setChatOpenRaw(open);
    try {
      localStorage.setItem(STORAGE_KEY, String(open));
    } catch {
      // localStorage not available
    }
  }, []);

  const toggleChat = useCallback(() => {
    setChatOpen(!chatOpen);
  }, [chatOpen, setChatOpen]);

  const focusChatInput = useCallback(() => {
    setChatOpen(true);
    // Small delay to let the panel animate open before focusing
    requestAnimationFrame(() => {
      setTimeout(() => {
        const input = document.getElementById("chat-input") as HTMLTextAreaElement | null;
        if (input) {
          input.focus();
          // Brief highlight ring animation
          input.classList.add("ring-2", "ring-primary", "ring-offset-1");
          setTimeout(() => {
            input.classList.remove("ring-2", "ring-primary", "ring-offset-1");
          }, 1500);
        }
      }, 350); // slightly longer than the 300ms panel transition
    });
  }, [setChatOpen]);

  // Tool-result and cover-letter callbacks (set by canvas pages)
  const [onToolResult, setOnToolResult] =
    useState<((toolName: string, result: unknown) => void) | undefined>();
  const [onCoverLetter, setOnCoverLetter] =
    useState<((text: string) => void) | undefined>();
  const [initialPrompt, setInitialPromptRaw] = useState<string | undefined>();
  const [initialPromptAutoSend, setInitialPromptAutoSend] = useState(false);
  const setInitialPrompt = useCallback(
    (prompt: string | undefined, autoSend = false) => {
      setInitialPromptRaw(prompt);
      setInitialPromptAutoSend(autoSend);
    },
    []
  );

  // Prevent flash: don't render children until hydrated
  if (!hydrated) return null;

  return (
    <ChatContext.Provider
      value={{
        chatOpen,
        setChatOpen,
        toggleChat,
        focusChatInput,
        onToolResult,
        setOnToolResult,
        onCoverLetter,
        setOnCoverLetter,
        initialPrompt,
        initialPromptAutoSend,
        setInitialPrompt,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return ctx;
}
