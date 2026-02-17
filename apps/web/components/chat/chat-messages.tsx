import { useState, useCallback, useEffect, useRef, useMemo, memo } from "react";
import type { UIMessage } from "ai";
import { Bot, User, Copy, Check } from "lucide-react";
import { Avatar, AvatarFallback } from "@repo/ui/avatar";
import { cn } from "@repo/ui/lib/utils";
import { MarkdownText } from "./markdown-text";

interface ChatMessagesProps {
  messages: UIMessage[];
  isLoading: boolean;
}

/** Duration to show the "Copied!" feedback (ms). */
const COPY_FEEDBACK_MS = 2_000;

/** Small copy-to-clipboard button shown on hover over assistant messages */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up the feedback timer on unmount to prevent state-update-after-unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch {
      // clipboard API not available — fail silently
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="absolute -bottom-3 right-2 rounded-md border bg-card p-1 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label="Copy message"
    >
      {copied ? (
        <Check className="h-3 w-3 text-emerald-500" aria-hidden="true" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
      )}
      <span className="sr-only" aria-live="polite">
        {copied ? "Message copied to clipboard" : ""}
      </span>
    </button>
  );
}

/** Pre-computed animation delays to avoid recalculation on re-renders */
const TYPING_DOT_DELAYS = ["0s", "0.16s", "0.32s"] as const;

/** Memoized typing indicator — static content that never needs to re-render */
const TypingIndicator = memo(function TypingIndicator() {
  return (
    <div className="flex gap-2 sm:gap-3" role="status" aria-label="Assistant is typing">
      <Avatar className="mt-0.5 hidden h-7 w-7 shrink-0 sm:flex">
        <AvatarFallback className="bg-primary text-primary-foreground text-xs">
          <Bot className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      <div className="flex items-center gap-1.5 rounded-xl bg-muted px-4 py-3">
        {TYPING_DOT_DELAYS.map((delay, i) => (
          <div
            key={i}
            className="h-2 w-2 rounded-full bg-muted-foreground/60"
            style={{
              animation: "typing-bounce 1.4s ease-in-out infinite",
              animationDelay: delay,
            }}
          />
        ))}
      </div>
      <span className="sr-only">Assistant is thinking...</span>
    </div>
  );
});

/** Memoized single message bubble to avoid re-renders when new messages arrive */
const MessageBubble = memo(function MessageBubble({
  message,
}: {
  message: UIMessage;
}) {
  // Memoize text extraction so it only recomputes when parts change
  const textContent = useMemo(
    () =>
      message.parts
        .filter((p) => p.type === "text")
        .map((p) => (p as { type: "text"; text: string }).text)
        .join("\n"),
    [message.parts],
  );

  return (
    <div
      role="article"
      aria-label={message.role === "user" ? "Your message" : "Assistant message"}
      className={cn(
        "flex gap-2 sm:gap-3",
        message.role === "user" ? "justify-end" : "justify-start"
      )}
    >
      {message.role !== "user" && (
        <Avatar className="mt-0.5 hidden h-7 w-7 shrink-0 sm:flex">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs">
            <Bot className="h-4 w-4" aria-hidden="true" />
          </AvatarFallback>
        </Avatar>
      )}

      <div className="flex flex-col gap-0.5">
        <div
          className={cn(
            "group relative max-w-[92%] rounded-xl px-3 py-2 text-sm leading-relaxed sm:max-w-[85%] sm:px-4 sm:py-2.5",
            message.role === "user"
              ? "bg-primary text-primary-foreground"
              : "bg-muted"
          )}
        >
          {message.parts.map((part, i) => {
            if (part.type === "text") {
              if (message.role === "assistant") {
                return <MarkdownText key={i} text={part.text} />;
              }
              return (
                <div key={i} className="whitespace-pre-wrap">
                  {part.text}
                </div>
              );
            }
            if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
              const toolPart = part as {
                type: string;
                toolName?: string;
                state: string;
              };
              const toolName =
                toolPart.toolName ??
                (toolPart.type.startsWith("tool-")
                  ? toolPart.type.slice(5)
                  : "tool");
              return (
                <div
                  key={i}
                  className="my-1 rounded border bg-background/50 p-2 text-xs text-muted-foreground"
                >
                  <span className="font-medium">{toolName}</span>
                  {toolPart.state === "output-available" && (
                    <span className="ml-2 text-green-600 dark:text-green-400">
                      Done
                    </span>
                  )}
                  {(toolPart.state === "input-streaming" ||
                    toolPart.state === "input-available") && (
                    <span className="ml-2 text-yellow-600 dark:text-yellow-400">
                      Running...
                    </span>
                  )}
                </div>
              );
            }
            return null;
          })}

          {/* Copy button for assistant messages */}
          {message.role === "assistant" && textContent.length > 0 && (
            <CopyButton text={textContent} />
          )}
        </div>

      </div>

      {message.role === "user" && (
        <Avatar className="mt-0.5 hidden h-7 w-7 shrink-0 sm:flex">
          <AvatarFallback className="text-xs">
            <User className="h-4 w-4" aria-hidden="true" />
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
});

export function ChatMessages({ messages, isLoading }: ChatMessagesProps) {
  return (
    <div className="space-y-4" role="log" aria-live="polite" aria-label="Conversation">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}

      {isLoading && <TypingIndicator />}
    </div>
  );
}
