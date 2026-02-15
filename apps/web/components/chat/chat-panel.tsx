"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useRef, useEffect, useState, useMemo } from "react";
import { ChatMessages } from "./chat-messages";
import { ChatInput } from "./chat-input";

interface ChatPanelProps {
  onToolResult?: (toolName: string, result: unknown) => void;
  onCoverLetter?: (text: string) => void;
}

export function ChatPanel({ onToolResult, onCoverLetter }: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const coverLetterPending = useRef(false);

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/ai/chat" }),
    []
  );

  const { messages, sendMessage, status, error } = useChat({
    transport,
    onToolCall: ({ toolCall }) => {
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

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    await sendMessage({ text });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4" aria-live="polite" aria-label="Chat messages">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-sm text-center">
              <h2 className="text-xl font-semibold">
                Welcome to Ever Jobs
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                I&apos;m your AI job search assistant. Tell me what kind of job
                you&apos;re looking for, and I&apos;ll help you find it.
              </p>
              <div className="mt-4 space-y-2">
                <p className="text-xs text-muted-foreground">Try asking:</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {[
                    "Find me remote React jobs",
                    "Senior engineer roles in NYC",
                    "AI/ML jobs over $200k",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="rounded-full border bg-card px-3 py-1.5 text-xs transition-colors hover:bg-accent"
                      onClick={() => setInput(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <ChatMessages messages={messages} isLoading={isLoading} />
        )}

        {error && (
          <div role="alert" className="mt-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error.message}
          </div>
        )}
      </div>

      {/* Input area */}
      <ChatInput
        input={input}
        onInputChange={setInput}
        onSend={handleSend}
        isLoading={isLoading}
      />
    </div>
  );
}
