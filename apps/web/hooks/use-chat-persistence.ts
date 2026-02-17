"use client";

import { useState, useCallback, useRef, useEffect } from "react";

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
 */
export function useChatPersistence() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const savedMessageIds = useRef<Set<string>>(new Set());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = useCallback(async () => {
    setIsLoadingSessions(true);
    try {
      const res = await fetch("/api/chat/sessions");
      if (res.ok) {
        const data = (await res.json()) as { sessions: ChatSession[] };
        setSessions(data.sessions);
      }
    } catch {
      // Silently fail — chat still works without persistence
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

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
    } catch {
      // Non-blocking
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
      } catch {
        // Non-blocking
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

      // Debounce saves (wait 1s after last message)
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const sessionId = activeSessionId;
        if (!sessionId) return;

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
          }
        } catch {
          // Non-blocking
        }
      }, 1000);
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
      } catch {
        // Non-blocking
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
