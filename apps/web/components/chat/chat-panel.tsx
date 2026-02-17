"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { ChatMessages } from "./chat-messages";
import { ChatInput } from "./chat-input";
import { ChatEmptyState } from "./chat-empty-state";
import { ChatHistory } from "./chat-history";
import { AgentStatus, type AgentState } from "./agent-status";
import { useChatPersistence } from "@/hooks/use-chat-persistence";
import { MessageSquarePlus, RefreshCcw, ArrowDown } from "lucide-react";
import { Button } from "@repo/ui/button";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum character length to treat an AI response as a cover letter. */
const COVER_LETTER_MIN_CHARS = 200;

/** Distance from the bottom (px) within which we auto-scroll on new messages. */
const AUTO_SCROLL_THRESHOLD_PX = 150;

/** Distance from the bottom (px) before showing the "scroll to bottom" button. */
const SHOW_SCROLL_BUTTON_PX = 100;

/** Duration of the "done" flash before returning to idle (ms). */
const DONE_FLASH_MS = 1_500;

// ---------------------------------------------------------------------------
// Error classification — replaces fragile substring matching
// ---------------------------------------------------------------------------

type ChatErrorKind = "auth" | "rate-limit" | "network" | "unknown";

function classifyError(error: Error): ChatErrorKind {
  const msg = (error.message ?? "").toLowerCase();
  if (msg.includes("401") || msg.includes("sign in") || msg.includes("unauthorized"))
    return "auth";
  if (msg.includes("429") || msg.includes("rate") || msg.includes("limit") || msg.includes("too many"))
    return "rate-limit";
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("econnrefused") || msg.includes("failed to fetch"))
    return "network";
  return "unknown";
}

const ERROR_TITLES: Record<ChatErrorKind, string> = {
  auth: "Session expired",
  "rate-limit": "Rate limit reached",
  network: "Connection error",
  unknown: "Something went wrong",
};

const ERROR_DESCRIPTIONS: Record<ChatErrorKind, string> = {
  auth: "Please refresh the page to sign in again.",
  "rate-limit": "You\u2019ve sent too many messages. Wait a moment and try again.",
  network: "Check your internet connection and try again.",
  unknown: "An unexpected error occurred. Please try again.",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ChatPanelProps {
  onToolResult?: (toolName: string, result: unknown) => void;
  onCoverLetter?: (text: string) => void;
  /** Optional initial prompt to pre-fill the input (e.g. from ?job= deep link) */
  initialPrompt?: string;
}

export function ChatPanel({ onToolResult, onCoverLetter, initialPrompt }: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [activeToolName, setActiveToolName] = useState<string | undefined>();
  const coverLetterPending = useRef(false);
  const hasCreatedSession = useRef(false);
  const initialPromptUsed = useRef(false);

  const {
    sessions,
    activeSessionId,
    isLoadingSessions,
    createSession,
    startNewSession,
    loadMessages,
    saveMessages: persistMessages,
    deleteSession,
  } = useChatPersistence();

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/ai/chat" }),
    []
  );

  const { messages, sendMessage, stop, setMessages, status, error } = useChat({
    transport,
    onToolCall: ({ toolCall }) => {
      // Show which tool is running in the status indicator
      setAgentState("tool-running");
      setActiveToolName(toolCall.toolName);

      if (onToolResult && toolCall.toolName) {
        onToolResult(toolCall.toolName, toolCall.input);
      }
      // Track when cover letter tool is called
      if (toolCall.toolName === "generateCoverLetter") {
        coverLetterPending.current = true;
      }
    },
  });

  const isLoading = status === "streaming" || status === "submitted";

  // Pre-fill input from deep link (e.g. ?job=123)
  useEffect(() => {
    if (initialPrompt && !initialPromptUsed.current && messages.length === 0) {
      initialPromptUsed.current = true;
      setInput(initialPrompt);
      // Focus the chat input after a frame so the textarea renders
      requestAnimationFrame(() => {
        document.getElementById("chat-input")?.focus();
      });
    }
  }, [initialPrompt, messages.length]);

  // Sync agent state with chat status
  useEffect(() => {
    if (status === "submitted") {
      setAgentState("thinking");
      setActiveToolName(undefined);
    } else if (status === "streaming") {
      // If streaming and not tool-running, it's the LLM generating text
      if (agentState !== "tool-running") {
        setAgentState("thinking");
      }
    } else if (status === "ready") {
      // Brief "done" flash before going idle
      if (agentState !== "idle") {
        setAgentState("done");
        const timer = setTimeout(() => {
          setAgentState("idle");
          setActiveToolName(undefined);
        }, DONE_FLASH_MS);
        return () => clearTimeout(timer);
      }
    }
  }, [status, agentState]);

  // Create a session on first user message
  useEffect(() => {
    if (messages.length > 0 && !activeSessionId && !hasCreatedSession.current) {
      hasCreatedSession.current = true;
      createSession();
    }
  }, [messages.length, activeSessionId, createSession]);

  // Auto-save messages to persistence layer
  useEffect(() => {
    if (messages.length > 0 && !isLoading) {
      persistMessages(messages);
    }
  }, [messages, isLoading, persistMessages]);

  // Detect cover letter in AI response after generateCoverLetter tool call
  useEffect(() => {
    if (!coverLetterPending.current || isLoading) return;
    // Find the latest assistant message with text after a generateCoverLetter tool call
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;

    const textParts = lastAssistant.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { type: "text"; text: string }).text)
      .join("\n");

    if (textParts.length > COVER_LETTER_MIN_CHARS && onCoverLetter) {
      onCoverLetter(textParts);
      coverLetterPending.current = false;
    }
  }, [messages, isLoading, onCoverLetter]);

  const [showScrollButton, setShowScrollButton] = useState(false);

  // Track whether user has scrolled up from bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollButton(distanceFromBottom > SHOW_SCROLL_BUTTON_PX);
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  // Auto-scroll to bottom on new messages (only if already near bottom)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < AUTO_SCROLL_THRESHOLD_PX) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, []);

  const lastUserMessage = useRef<string | null>(null);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    lastUserMessage.current = text;
    setInput("");
    await sendMessage({ text });
  };

  const handleRetry = useCallback(async () => {
    if (!lastUserMessage.current || isLoading) return;
    // Remove the last user message + any incomplete assistant response
    const trimmed = [...messages];
    while (trimmed.length > 0) {
      const last = trimmed[trimmed.length - 1];
      trimmed.pop();
      if (last?.role === "user") break;
    }
    setMessages(trimmed);
    await sendMessage({ text: lastUserMessage.current });
  }, [messages, isLoading, setMessages, sendMessage]);

  const handleStop = () => {
    stop();
    setAgentState("idle");
    setActiveToolName(undefined);
  };

  const handleNewChat = async () => {
    setMessages([]);
    setAgentState("idle");
    setActiveToolName(undefined);
    coverLetterPending.current = false;
    hasCreatedSession.current = false;
    await startNewSession();
  };

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      const persisted = await loadMessages(sessionId);
      if (persisted.length > 0) {
        const restored = persisted.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant" | "system",
          content: m.content ?? "",
          parts: m.content
            ? [{ type: "text" as const, text: m.content }]
            : [],
        }));
        setMessages(restored);
        hasCreatedSession.current = true;
      } else {
        setMessages([]);
      }
      setAgentState("idle");
      setActiveToolName(undefined);
      coverLetterPending.current = false;
    },
    [loadMessages, setMessages]
  );

  // Classify error once for cleaner rendering
  const errorKind = error ? classifyError(error) : null;

  return (
    <div className="flex h-full flex-col">
      {/* Chat header with history and new chat buttons */}
      {(messages.length > 0 || sessions.length > 0) && (
        <div className="relative flex items-center justify-between border-b px-4 py-2">
          <ChatHistory
            sessions={sessions}
            activeSessionId={activeSessionId}
            isLoading={isLoadingSessions}
            onSelectSession={handleSelectSession}
            onDeleteSession={async (sessionId) => {
              const deleted = await deleteSession(sessionId);
              if (deleted && sessionId === activeSessionId) {
                setMessages([]);
                setAgentState("idle");
                setActiveToolName(undefined);
              }
              return deleted;
            }}
          />
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewChat}
              className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              New Chat
            </Button>
          )}
        </div>
      )}

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4" aria-live="polite" aria-label="Chat messages">
        {messages.length === 0 ? (
          <ChatEmptyState onSuggestionClick={setInput} />
        ) : (
          <ChatMessages messages={messages} isLoading={isLoading} />
        )}

        {error && errorKind && (
          <div role="alert" className="mt-2 rounded-md border border-destructive/50 bg-destructive/10 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-destructive">
                  {ERROR_TITLES[errorKind]}
                </p>
                <p className="mt-0.5 text-xs text-destructive/80">
                  {ERROR_DESCRIPTIONS[errorKind]}
                </p>
              </div>
              {lastUserMessage.current && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRetry}
                  disabled={isLoading}
                  className="shrink-0 gap-1.5 border-destructive/30 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <RefreshCcw className="h-3 w-3" />
                  Retry
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && messages.length > 0 && (
        <div className="flex justify-center py-1">
          <button
            type="button"
            onClick={scrollToBottom}
            className="flex items-center gap-1 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Scroll to latest messages"
          >
            <ArrowDown className="h-3 w-3" />
            New messages
          </button>
        </div>
      )}

      {/* Agent status indicator */}
      <AgentStatus state={agentState} activeToolName={activeToolName} />

      {/* Input area */}
      <ChatInput
        input={input}
        onInputChange={setInput}
        onSend={handleSend}
        onStop={handleStop}
        isLoading={isLoading}
      />
    </div>
  );
}
