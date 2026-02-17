"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { History, MessageSquare, ChevronRight, Loader2, X, Trash2, Search } from "lucide-react";
import { Button } from "@repo/ui/button";
import { cn } from "@repo/ui/lib/utils";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatSessionDate, timeAgo } from "@/lib/format-date";

interface ChatSession {
  id: string;
  status: string;
  agentType: string | null;
  preview: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ChatHistoryProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  isLoading: boolean;
  onSelectSession: (sessionId: string) => void | Promise<void>;
  onDeleteSession?: (sessionId: string) => Promise<boolean>;
}

/**
 * Chat history panel showing previous conversations.
 * Can be toggled open/closed with a button.
 * Shows sessions sorted by most recent first.
 */
export function ChatHistory({
  sessions,
  activeSessionId,
  isLoading,
  onSelectSession,
  onDeleteSession,
}: ChatHistoryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Filter sessions by search query (matches preview text)
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter(
      (s) =>
        s.preview?.toLowerCase().includes(q) ||
        formatSessionDate(s.updatedAt).toLowerCase().includes(q)
    );
  }, [sessions, searchQuery]);

  // Focus search input when panel opens; clear search when closing
  useEffect(() => {
    let rafId: number | null = null;
    if (isOpen && sessions.length > 3) {
      // Small delay to wait for DOM render — track for cleanup
      rafId = requestAnimationFrame(() => searchInputRef.current?.focus());
    }
    if (!isOpen) setSearchQuery("");
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [isOpen, sessions.length]);

  const handleSelect = useCallback(
    async (sessionId: string) => {
      if (sessionId === activeSessionId) {
        setIsOpen(false);
        return;
      }
      setLoadingSessionId(sessionId);
      try {
        await onSelectSession(sessionId);
      } finally {
        setLoadingSessionId(null);
        setIsOpen(false);
      }
    },
    [activeSessionId, onSelectSession]
  );

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent, sessionId: string) => {
      e.stopPropagation(); // Don't trigger session selection
      if (!onDeleteSession) return;
      setConfirmDeleteId(sessionId);
    },
    [onDeleteSession]
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!confirmDeleteId || !onDeleteSession) return;
    setDeletingSessionId(confirmDeleteId);
    try {
      await onDeleteSession(confirmDeleteId);
    } finally {
      setDeletingSessionId(null);
      setConfirmDeleteId(null);
    }
  }, [confirmDeleteId, onDeleteSession]);

  // Don't render anything if there are no sessions
  if (!isLoading && sessions.length === 0) return null;

  return (
    <>
      {/* Toggle button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        aria-expanded={isOpen}
        aria-controls="chat-history-panel"
      >
        <History className="h-3.5 w-3.5" aria-hidden="true" />
        History
        {sessions.length > 0 && (
          <span className="ml-0.5 text-[10px] text-muted-foreground">
            ({sessions.length})
          </span>
        )}
      </Button>

      {/* History panel - slides down from the header */}
      {isOpen && (
        <div
          id="chat-history-panel"
          className="absolute left-0 right-0 top-full z-30 border-b bg-card shadow-md"
        >
          <div className="flex items-center justify-between border-b px-4 py-2">
            <h3 className="text-xs font-semibold text-muted-foreground">
              Previous Conversations
            </h3>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="Close history"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          {/* Search input — only show when there are several sessions */}
          {sessions.length > 3 && (
            <div className="border-b px-3 py-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input
                  ref={searchInputRef}
                  type="search"
                  placeholder="Search conversations…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-7 w-full rounded-md border bg-background pl-7 pr-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-label="Search conversations"
                />
              </div>
            </div>
          )}

          <div className="max-h-64 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
              </div>
            ) : filteredSessions.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                {searchQuery
                  ? "No conversations match your search"
                  : "No previous conversations"}
              </p>
            ) : (
              <ul className="divide-y">
                {filteredSessions.map((session) => {
                  const isActive = session.id === activeSessionId;
                  const isSessionLoading = session.id === loadingSessionId;
                  const isDeleting = session.id === deletingSessionId;
                  const date = new Date(session.updatedAt);

                  return (
                    <li key={session.id}>
                      <div
                        role="button"
                        tabIndex={isSessionLoading || isDeleting ? -1 : 0}
                        className={cn(
                          "group/item flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/50 cursor-pointer",
                          isActive && "bg-accent/30",
                          isDeleting && "pointer-events-none opacity-50"
                        )}
                        onClick={() => {
                          if (!(isSessionLoading || isDeleting)) handleSelect(session.id);
                        }}
                        onKeyDown={(e) => {
                          if ((e.key === "Enter" || e.key === " ") && !(isSessionLoading || isDeleting)) {
                            e.preventDefault();
                            handleSelect(session.id);
                          }
                        }}
                      >
                        <MessageSquare
                          className={cn(
                            "h-3.5 w-3.5 shrink-0",
                            isActive ? "text-primary" : "text-muted-foreground"
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">
                            {isActive
                              ? "Current conversation"
                              : session.preview ?? formatSessionDate(date)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {timeAgo(date)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          {onDeleteSession && (
                            <button
                              type="button"
                              className="rounded p-1 opacity-0 transition-opacity group-hover/item:opacity-100 hover:bg-destructive/10 hover:text-destructive focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label={`Delete conversation: ${session.preview ?? "untitled"}`}
                              onClick={(e) => handleDeleteClick(e, session.id)}
                              disabled={isDeleting}
                            >
                              {isDeleting ? (
                                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                              ) : (
                                <Trash2 className="h-3 w-3" aria-hidden="true" />
                              )}
                            </button>
                          )}
                          {isSessionLoading ? (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-hidden="true" />
                          ) : (
                            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteId(null);
        }}
        title="Delete conversation?"
        description="This will permanently delete this conversation and all its messages. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteConfirm}
      />
    </>
  );
}

