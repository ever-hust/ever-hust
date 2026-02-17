"use client";

import { useState, useCallback, useRef, useEffect } from "react";

const LOG_PREFIX = "[chat-persistence]";

/** Debounce delay for auto-saving messages (ms). */
const SAVE_DEBOUNCE_MS = 1_000;

interface ChatSession {
  id: string;
  status: string;
  agentType: string | null;
  preview: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PersistedMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string | null;
  toolCalls: unknown;
  toolResults: unknown;
  metadata: unknown;
  createdAt: string;
}

/**
 * Hook for managing chat session persistence.
 *
 * Handles:
 * - Creating new sessions
 * - Loading session history
 * - Auto-saving messages as they come in (debounced)
 *
 * All persistence operations are non-blocking — the chat works even if the
 * API is unavailable. Failures are logged to the console for debugging.
 */
export function useChatPersistence() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const savedMessageIds = useRef<Set<string>>(new Set());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const activeSessionIdRef = useRef<string | null>(null);

  // Keep ref in sync with state so debounced callbacks see the latest value
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  // Clean up debounce timer on unmount to prevent state-update-after-unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const loadSessions = useCallback(async (signal?: AbortSignal) => {
    setIsLoadingSessions(true);
    try {
      const res = await fetch("/api/chat/sessions", { signal });
      if (res.ok && !signal?.aborted) {
        const data = (await res.json()) as { sessions: ChatSession[] };
        setSessions(data.sessions);
      } else if (!signal?.aborted) {
        console.warn(
          `${LOG_PREFIX} Failed to load sessions: ${res.status} ${res.statusText}`
        );
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.warn(
        `${LOG_PREFIX} Failed to load sessions:`,
        error instanceof Error ? error.message : error
      );
    } finally {
      if (!signal?.aborted) setIsLoadingSessions(false);
    }
  }, []);

  // Load sessions on mount with proper AbortController cleanup
  useEffect(() => {
    const controller = new AbortController();
    loadSessions(controller.signal);
    return () => { controller.abort(); };
  }, [loadSessions]);

  const createSession = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch("/api/chat/sessions", { method: "POST" });
      if (res.ok) {
        const data = (await res.json()) as { session: ChatSession };
        const session = data.session;
        setSessions((prev) => [session, ...prev]);
        setActiveSessionId(session.id);
        savedMessageIds.current = new Set();
        return session.id;
      }
      console.warn(
        `${LOG_PREFIX} Failed to create session: ${res.status} ${res.statusText}`
      );
    } catch (error) {
      console.warn(
        `${LOG_PREFIX} Failed to create session:`,
        error instanceof Error ? error.message : error
      );
    }
    return null;
  }, []);

  const loadMessages = useCallback(
    async (sessionId: string): Promise<PersistedMessage[]> => {
      try {
        const res = await fetch(
          `/api/chat/sessions/${sessionId}/messages`
        );
        if (res.ok) {
          const data = (await res.json()) as {
            messages: PersistedMessage[];
          };
          // Track which messages are already saved
          for (const m of data.messages) {
            savedMessageIds.current.add(m.id);
          }
          setActiveSessionId(sessionId);
          return data.messages;
        }
        console.warn(
          `${LOG_PREFIX} Failed to load messages for ${sessionId}: ${res.status}`
        );
      } catch (error) {
        console.warn(
          `${LOG_PREFIX} Failed to load messages for ${sessionId}:`,
          error instanceof Error ? error.message : error
        );
      }
      return [];
    },
    []
  );

  /**
   * Save new messages that haven't been persisted yet.
   * Call this whenever `messages` from useChat changes.
   * Automatically debounced to avoid excessive API calls.
   */
  const saveMessages = useCallback(
    (
      messages: Array<{
        id: string;
        role: string;
        content?: string;
        parts?: unknown[];
      }>
    ) => {
      if (!activeSessionId) return;

      // Filter to unsaved messages only
      const unsaved = messages.filter(
        (m) => !savedMessageIds.current.has(m.id)
      );
      if (unsaved.length === 0) return;

      // Capture the session ID at call time so the debounced callback only
      // writes to the session that was active when these messages appeared.
      // If the session changes during the debounce window, the stale save
      // is discarded instead of writing to the wrong session.
      const capturedSessionId = activeSessionId;

      // Debounce saves
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        if (!mountedRef.current) return;
        // Discard if the session changed during the debounce window
        const currentSessionId = activeSessionIdRef.current;
        if (!currentSessionId || currentSessionId !== capturedSessionId) return;
        const sessionId = currentSessionId;

        const payload = unsaved.map((m) => {
          // Extract text content from parts if available
          const textContent =
            m.content ??
            (m.parts
              ?.filter(
                (p) =>
                  typeof p === "object" &&
                  p !== null &&
                  (p as { type?: string }).type === "text"
              )
              .map((p) => (p as { text: string }).text)
              .join("\n") ||
              null);

          return {
            id: m.id,
            role: m.role as "user" | "assistant" | "system" | "tool",
            content: textContent,
          };
        });

        try {
          const res = await fetch(
            `/api/chat/sessions/${sessionId}/messages`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ messages: payload }),
            }
          );
          if (res.ok) {
            // Mark as saved
            for (const m of payload) {
              savedMessageIds.current.add(m.id);
            }
          } else {
            console.warn(
              `${LOG_PREFIX} Failed to save ${payload.length} message(s) to ${sessionId}: ${res.status}`
            );
          }
        } catch (error) {
          console.warn(
            `${LOG_PREFIX} Failed to save messages to ${sessionId}:`,
            error instanceof Error ? error.message : error
          );
        }
      }, SAVE_DEBOUNCE_MS);
    },
    [activeSessionId]
  );

  const startNewSession = useCallback(async () => {
    savedMessageIds.current = new Set();
    return createSession();
  }, [createSession]);

  const deleteSession = useCallback(
    async (sessionId: string): Promise<boolean> => {
      try {
        const res = await fetch(`/api/chat/sessions/${sessionId}`, {
          method: "DELETE",
        });
        if (res.ok || res.status === 204) {
          setSessions((prev) => prev.filter((s) => s.id !== sessionId));
          // If we deleted the active session, clear it
          if (activeSessionId === sessionId) {
            setActiveSessionId(null);
            savedMessageIds.current = new Set();
          }
          return true;
        }
        console.warn(
          `${LOG_PREFIX} Failed to delete session ${sessionId}: ${res.status}`
        );
      } catch (error) {
        console.warn(
          `${LOG_PREFIX} Failed to delete session ${sessionId}:`,
          error instanceof Error ? error.message : error
        );
      }
      return false;
    },
    [activeSessionId]
  );

  return {
    sessions,
    activeSessionId,
    isLoadingSessions,
    createSession,
    startNewSession,
    loadMessages,
    saveMessages,
    deleteSession,
    setActiveSessionId,
  };
}
