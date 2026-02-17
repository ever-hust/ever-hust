"use client";

import { useRef, useCallback, useEffect } from "react";
import { Send, StopCircle } from "lucide-react";
import { Button } from "@repo/ui/button";

interface ChatInputProps {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  isLoading: boolean;
}

const MAX_ROWS = 6;
const LINE_HEIGHT = 20; // ~text-sm line height in px

export function ChatInput({
  input,
  onInputChange,
  onSend,
  onStop,
  isLoading,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea based on content
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset to single row to measure scrollHeight accurately
    textarea.style.height = "auto";

    // Calculate max height (MAX_ROWS * line-height + padding)
    const maxHeight = MAX_ROWS * LINE_HEIGHT + 20; // 20px for py-2.5 padding
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);

    textarea.style.height = `${newHeight}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, []);

  // Adjust height when input changes
  useEffect(() => {
    adjustHeight();
  }, [input, adjustHeight]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isLoading) {
        onSend();
      }
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isLoading && onStop) {
      onStop();
      return;
    }
    if (input.trim() && !isLoading) {
      onSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onInputChange(e.target.value);
  };

  return (
    <div className="border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4 sm:pb-4">
      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <label htmlFor="chat-input" className="sr-only">
          Chat message
        </label>
        <textarea
          id="chat-input"
          ref={textareaRef}
          value={input}
          onChange={handleChange}
          onKeyDown={onKeyDown}
          placeholder="Ask about jobs, cover letters, interviews..."
          className="flex-1 resize-none rounded-lg border bg-background px-3 py-2.5 text-sm leading-5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          rows={1}
          disabled={isLoading && !onStop}
          style={{ overflow: "hidden" }}
        />
        {isLoading && onStop ? (
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={onStop}
            aria-label="Stop generating"
            className="shrink-0"
          >
            <StopCircle className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isLoading}
            aria-label="Send message"
            className="shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </form>
      <div className="mt-1.5 hidden items-center justify-between text-[10px] text-muted-foreground/60 sm:flex">
        <span>Press Enter to send, Shift+Enter for new line</span>
        {input.length > 200 && (
          <span className={input.length > 4000 ? "text-destructive" : ""}>
            {input.length.toLocaleString()} chars
          </span>
        )}
      </div>
    </div>
  );
}
