"use client";

import { useState, useCallback, useEffect, useRef, useMemo, memo } from "react";
import type { UIMessage } from "ai";
import { Copy, Check, AlertTriangle, Loader2, X } from "lucide-react";
import { cn } from "@ever-hust/ui/lib/utils";
import { answeredByFreeFallback } from "@/lib/chat-metadata";
import { MarkdownText } from "./markdown-text";
import { toolChipLabel, type ToolChipState } from "./tool-labels";

interface ChatMessagesProps {
  messages: UIMessage[];
  isLoading: boolean;
}

/** Duration to show the "Copied!" feedback (ms). */
const COPY_FEEDBACK_MS = 2_000;

/** Small copy-to-clipboard button shown on hover over assistant messages */
const CopyButton = memo(function CopyButton({ text }: { text: string }) {
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
});

/** CSS class suffixes for the three typing dots */
const TYPING_DOT_CLASSES = ["typing-dot-1", "typing-dot-2", "typing-dot-3"] as const;

/** Assistant reply surface: full column width, hairline border, faint tint. */
const ASSISTANT_SURFACE = "rounded-xl border border-border/60 bg-card/40";

/** Memoized typing indicator — static content that never needs to re-render */
const TypingIndicator = memo(function TypingIndicator() {
  return (
    <div
      className={cn(ASSISTANT_SURFACE, "flex w-fit items-center gap-1.5 px-3.5 py-3")}
      role="status"
      aria-label="Assistant is typing"
    >
      {TYPING_DOT_CLASSES.map((cls) => (
        <div
          key={cls}
          className={`h-1.5 w-1.5 rounded-full bg-muted-foreground/60 typing-dot ${cls}`}
        />
      ))}
      <span className="sr-only">Assistant is thinking...</span>
    </div>
  );
});

type MessagePart = UIMessage["parts"][number];

interface ToolChip {
  key: string;
  toolName: string;
  state: ToolChipState;
}

type Segment =
  | { kind: "text"; key: string; text: string }
  | { kind: "tools"; key: string; tools: ToolChip[] };

function isToolPart(part: MessagePart): boolean {
  return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

function toToolChip(part: MessagePart, index: number): ToolChip {
  const p = part as { type: string; toolName?: string; toolCallId?: string; state?: string };
  const toolName = p.toolName ?? (p.type.startsWith("tool-") ? p.type.slice(5) : "tool");
  const state: ToolChipState =
    p.state === "output-available" ? "done" : p.state === "output-error" ? "failed" : "running";
  return { key: p.toolCallId ?? `tool-${index}`, toolName, state };
}

/**
 * Message parts in display order, with consecutive tool calls grouped into one
 * chip row so a burst of tools reads as a single status line.
 */
function toSegments(parts: UIMessage["parts"]): Segment[] {
  const segments: Segment[] = [];
  parts.forEach((part, i) => {
    if (part.type === "text") {
      if (part.text.trim()) segments.push({ kind: "text", key: `text-${i}`, text: part.text });
      return;
    }
    if (!isToolPart(part)) return;
    const last = segments.at(-1);
    const chip = toToolChip(part, i);
    if (last?.kind === "tools") last.tools.push(chip);
    else segments.push({ kind: "tools", key: `tools-${i}`, tools: [chip] });
  });
  return segments;
}

const ToolChipRow = memo(function ToolChipRow({ tools }: { tools: ToolChip[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Assistant actions">
      {tools.map((tool) => (
        <li
          key={tool.key}
          className={cn(
            "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs",
            tool.state === "failed"
              ? "border-destructive/40 text-destructive"
              : "border-border/70 text-muted-foreground",
          )}
        >
          {tool.state === "running" && (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden="true" />
          )}
          {tool.state === "done" && (
            <Check className="h-3 w-3 shrink-0 text-emerald-500" aria-hidden="true" />
          )}
          {tool.state === "failed" && <X className="h-3 w-3 shrink-0" aria-hidden="true" />}
          <span className="truncate">{toolChipLabel(tool.toolName, tool.state)}</span>
        </li>
      ))}
    </ul>
  );
});

/** Memoized single message to avoid re-renders when new messages arrive */
const MessageBubble = memo(function MessageBubble({
  message,
}: {
  message: UIMessage;
}) {
  const segments = useMemo(() => toSegments(message.parts), [message.parts]);
  const textContent = useMemo(
    () =>
      segments
        .filter((s): s is Extract<Segment, { kind: "text" }> => s.kind === "text")
        .map((s) => s.text)
        .join("\n"),
    [segments],
  );

  if (message.role === "user") {
    return (
      <div role="article" aria-label="Your message" className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm leading-relaxed text-primary-foreground">
          {textContent}
        </div>
      </div>
    );
  }

  if (segments.length === 0) return null;

  return (
    <div role="article" aria-label="Assistant message" className="flex flex-col gap-1">
      <div
        className={cn(
          ASSISTANT_SURFACE,
          "group relative min-w-0 space-y-2.5 px-3.5 py-3 text-sm leading-relaxed sm:px-4",
        )}
      >
        {segments.map((segment) =>
          segment.kind === "tools" ? (
            <ToolChipRow key={segment.key} tools={segment.tools} />
          ) : (
            <div key={segment.key} className="min-w-0 break-words">
              <MarkdownText text={segment.text} />
            </div>
          ),
        )}

        {textContent.length > 0 && <CopyButton text={textContent} />}
      </div>

      {answeredByFreeFallback(message.metadata) && (
        <p className="flex items-center gap-1 px-1 text-[11px] text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
          Answered by a free backup model — premium AI is temporarily unavailable.
        </p>
      )}
    </div>
  );
});

export const ChatMessages = memo(function ChatMessages({ messages, isLoading }: ChatMessagesProps) {
  // The dots cover waits where the reply itself shows no progress: before it
  // starts, and between finished tool calls and the first words of the answer.
  const last = messages.at(-1);
  const replyShowsProgress =
    last?.role === "assistant" &&
    toSegments(last.parts).some(
      (s) => s.kind === "text" || s.tools.some((t) => t.state === "running"),
    );
  const showTyping = isLoading && !replyShowsProgress;

  return (
    <div className="space-y-3" role="log" aria-live="polite" aria-label="Conversation">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}

      {showTyping && <TypingIndicator />}
    </div>
  );
});
