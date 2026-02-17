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
      // Focus the chat input after a tick so the textarea renders
      setTimeout(() => {
        document.getElementById("chat-input")?.focus();
      }, 100);
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
        }, 1500);
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

    // If the text is long enough to be a cover letter (>200 chars), emit it
    if (textParts.length > 200 && onCoverLetter) {
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
      setShowScrollButton(distanceFromBottom > 100);
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  // Auto-scroll to bottom on new messages (only if already near bottom)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // If user is near bottom (within 150px), auto-scroll
    if (distanceFromBottom < 150) {
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
    // Pop messages from the end until we remove the last user message
    while (trimmed.length > 0) {
      const last = trimmed[trimmed.length - 1];
      trimmed.pop();
      if (last?.role === "user") break;
    }
    setMessages(trimmed);
    // Resend
    await sendMessage({ text: lastUserMessage.current });
  }, [messages, isLoading, setMessages, sendMessage]);

  const handleStop = () => {
    stop();
    setAgentState("idle");
    setActiveToolName(undefined);
  };

  const handleNewChat = async () => {
    // Clear current messages and start a fresh session
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
        // Convert persisted messages to the format useChat expects
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

        {error && (
          <div role="alert" className="mt-2 rounded-md border border-destructive/50 bg-destructive/10 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-destructive">
                  {error.message?.includes("401") || error.message?.includes("sign in")
                    ? "Session expired"
                    : error.message?.includes("429") || error.message?.includes("limit")
                      ? "Rate limit reached"
                      : error.message?.includes("fetch") || error.message?.includes("network")
                        ? "Connection error"
                        : "Something went wrong"}
                </p>
                <p className="mt-0.5 text-xs text-destructive/80">
                  {error.message?.includes("401") || error.message?.includes("sign in")
                    ? "Please refresh the page to sign in again."
                    : error.message?.includes("429") || error.message?.includes("limit")
                      ? "You've sent too many messages. Wait a moment and try again."
                      : error.message?.includes("fetch") || error.message?.includes("network")
                        ? "Check your internet connection and try again."
                        : error.message || "An unexpected error occurred. Please try again."}
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
