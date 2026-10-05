/**
 * Metadata the chat API attaches to streamed assistant messages
 * (`toUIMessageStreamResponse({ messageMetadata })` in app/api/ai/chat).
 */
export interface ChatMessageMetadata {
  /**
   * Set when Hust's platform AI credits ran out and a free OpenRouter model
   * answered instead of the selected one.
   */
  aiFallback?: "free-models";
}

export function answeredByFreeFallback(metadata: unknown): boolean {
  return (metadata as ChatMessageMetadata | undefined)?.aiFallback === "free-models";
}
