/**
 * Pure utility functions extracted from React hooks for independent testability.
 * These are used by hooks in apps/web/hooks/ but contain zero React dependencies.
 */

// ── Set utilities ───────────────────────────────────────────────────────

/** Toggle a value in a Set — returns a new Set with the item added or removed. */
export function toggleSetMember<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

// ── Retry / backoff ─────────────────────────────────────────────────────

/** Calculate exponential backoff delay: baseDelay * 2^attempt */
export function exponentialBackoffDelay(
  attempt: number,
  baseDelayMs: number = 1000,
): number {
  return Math.pow(2, attempt) * baseDelayMs;
}

/** Calculate retry delay with random jitter to prevent thundering herd. */
export function retryDelayWithJitter(
  attempt: number,
  baseDelayMs: number = 1000,
  maxJitterMs: number = 200,
): number {
  return baseDelayMs * Math.pow(2, attempt) + Math.random() * maxJitterMs;
}

// ── Keyboard utilities ──────────────────────────────────────────────────

/** Check if a keyboard event target is an input/textarea/contenteditable. */
export function isInputElement(target: HTMLElement): boolean {
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  );
}

/** Check if a keyboard event target is inside a dialog (except for Escape). */
export function isInsideDialog(
  target: HTMLElement,
  eventKey: string,
): boolean {
  return eventKey !== "Escape" && !!target.closest("[role='dialog']");
}

interface ShortcutDefinition {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
}

/** Check if a keyboard event matches a shortcut definition. */
export function matchesShortcut(
  event: Pick<
    KeyboardEvent,
    "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey"
  >,
  shortcut: ShortcutDefinition,
): boolean {
  const ctrlOrMeta = shortcut.ctrl || shortcut.meta;
  const modifierMatch = ctrlOrMeta
    ? event.ctrlKey || event.metaKey
    : !(event.ctrlKey || event.metaKey);

  const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
  const altMatch = shortcut.alt ? event.altKey : !event.altKey;

  return (
    event.key.toLowerCase() === shortcut.key.toLowerCase() &&
    modifierMatch &&
    shiftMatch &&
    altMatch
  );
}

// ── Validation utilities ────────────────────────────────────────────────

/** Validate a referral code format: uppercase alphanumeric, max length. */
export function isValidReferralCode(
  code: string,
  maxLength: number = 20,
): boolean {
  return /^[A-Z0-9]+$/.test(code) && code.length <= maxLength;
}

// ── VAPID key conversion ────────────────────────────────────────────────

/**
 * Convert a URL-safe base64 string to a Uint8Array.
 * Used for VAPID public key conversion in Web Push subscriptions.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// ── Message text extraction ─────────────────────────────────────────────

interface MessageLike {
  content?: string | null;
  parts?: unknown[];
}

/** Extract text content from a chat message, falling back to parts. */
export function extractMessageText(message: MessageLike): string | null {
  // Use nullish coalescing: only fall through to parts if content is null/undefined,
  // not for empty string (preserves original ?? behavior from the hook)
  if (message.content != null) return message.content || null;

  if (!message.parts || message.parts.length === 0) return null;

  const textParts = message.parts
    .filter(
      (p): p is { type: "text"; text: string } =>
        typeof p === "object" &&
        p !== null &&
        (p as { type?: string }).type === "text",
    )
    .map((p) => p.text)
    .join("\n");

  return textParts || null;
}
