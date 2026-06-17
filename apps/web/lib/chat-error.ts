/**
 * Chat error handling — surfaces the server's *real* message in the chat panel.
 *
 * The AI chat route ({@link file://./../app/api/ai/chat/route.ts}) returns a JSON
 * body `{ error, details }` with a non-2xx status when a request is rejected
 * (e.g. the daily free-tier message cap → 429 "Daily message limit reached.
 * Upgrade to Pro…"). The Vercel AI SDK's `useChat`, left to its own devices,
 * surfaces a generic Error whose message does not carry that copy — so the panel
 * used to show "Something went wrong" instead of the actionable reason.
 *
 * Two pieces fix that:
 *  - {@link createLimitAwareFetch} wraps the transport's fetch, reads the server's
 *    JSON error body on a non-OK response, and throws a {@link ChatRequestError}
 *    carrying the real message + status + limitType.
 *  - {@link classifyChatError} turns any thrown error into a user-facing
 *    `{ title, description, upgradeHref, canRetry }`, preferring the server copy.
 */

/**
 * Error carrying the server's real message + metadata, thrown by the chat
 * transport's fetch wrapper on a non-OK response.
 */
export class ChatRequestError extends Error {
  readonly status?: number;
  readonly limitType?: string;
  /** The server-provided message (same as `message`, named for clarity at call sites). */
  readonly serverMessage: string;

  constructor(message: string, opts: { status?: number; limitType?: string } = {}) {
    super(message);
    this.name = "ChatRequestError";
    this.status = opts.status;
    this.limitType = opts.limitType;
    this.serverMessage = message;
  }
}

export type ChatErrorKind =
  | "auth"
  | "upgrade-limit"
  | "rate-limit"
  | "network"
  | "unknown";

export interface ClassifiedChatError {
  kind: ChatErrorKind;
  title: string;
  description: string;
  /** When set, render an "Upgrade to Pro" CTA linking here. */
  upgradeHref?: string;
  /** Whether offering a Retry action makes sense for this error. */
  canRetry: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Classify a thrown chat error into user-facing copy.
 *
 * Prefers the server's real message (via {@link ChatRequestError}) over generic
 * fallbacks, and distinguishes the **daily usage cap** (free tier → upgrade)
 * from a **transient per-minute throttle** (slow down and retry).
 */
export function classifyChatError(error: unknown): ClassifiedChatError {
  const status =
    isRecord(error) && typeof error.status === "number" ? error.status : undefined;
  const limitType =
    isRecord(error) && typeof error.limitType === "string" ? error.limitType : undefined;
  const serverMessage =
    isRecord(error) && typeof error.serverMessage === "string"
      ? error.serverMessage
      : undefined;
  const rawMessage =
    serverMessage ??
    (error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "");
  const msg = rawMessage.toLowerCase();

  // Daily free-tier message cap → surface the server's exact copy + upgrade CTA.
  // Detected by the structured limitType, or by the message text as a fallback.
  if (
    limitType === "messages" ||
    msg.includes("daily message limit") ||
    (msg.includes("limit") && msg.includes("upgrade"))
  ) {
    return {
      kind: "upgrade-limit",
      title: "Daily message limit reached",
      description:
        serverMessage ||
        rawMessage ||
        "You've reached today's free message limit. Upgrade to Pro for unlimited messages.",
      upgradeHref: "/settings",
      canRetry: false,
    };
  }

  if (
    status === 401 ||
    msg.includes("401") ||
    msg.includes("sign in") ||
    msg.includes("unauthorized")
  ) {
    return {
      kind: "auth",
      title: "Session expired",
      description: "Please refresh the page to sign in again.",
      canRetry: false,
    };
  }

  // Transient throttle (per-minute API rate limit) — distinct from the daily cap.
  if (
    status === 429 ||
    msg.includes("429") ||
    msg.includes("too many") ||
    msg.includes("rate limit") ||
    msg.includes("slow down")
  ) {
    return {
      kind: "rate-limit",
      title: "Slow down a moment",
      description: "You're sending messages too quickly. Wait a moment and try again.",
      canRetry: true,
    };
  }

  if (
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("econnrefused") ||
    msg.includes("fetch")
  ) {
    return {
      kind: "network",
      title: "Connection error",
      description: "Check your internet connection and try again.",
      canRetry: true,
    };
  }

  return {
    kind: "unknown",
    title: "Something went wrong",
    description: "An unexpected error occurred. Please try again.",
    canRetry: true,
  };
}

/**
 * Wrap a `fetch` so non-OK responses throw a {@link ChatRequestError} carrying
 * the server's JSON `{ error, details }` message — letting the chat UI render the
 * real reason instead of a generic failure.
 *
 * The OK (streaming) response is returned untouched; the error body is read from
 * a clone so the SDK's view of the response is never consumed.
 *
 * @param baseFetch underlying fetch (defaults to the global `fetch`, kept lazy so
 *   it picks up any same-tick monkey-patching, e.g. the 429 toast interceptor).
 */
export function createLimitAwareFetch(
  baseFetch: typeof fetch = (input, init) => fetch(input, init),
): typeof fetch {
  return async function limitAwareFetch(input, init) {
    const response = await baseFetch(input, init);
    if (response.ok) return response;

    let serverMessage: string | undefined;
    let limitType: string | undefined;
    try {
      const data: unknown = await response.clone().json();
      if (isRecord(data)) {
        if (typeof data.error === "string") serverMessage = data.error;
        const details = data.details;
        if (isRecord(details) && typeof details.limitType === "string") {
          limitType = details.limitType;
        }
      }
    } catch {
      // Non-JSON error body — fall through to a status-based message.
    }

    throw new ChatRequestError(
      serverMessage || `Request failed (${response.status})`,
      { status: response.status, limitType },
    );
  } as typeof fetch;
}
