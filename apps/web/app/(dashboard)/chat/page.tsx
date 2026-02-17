"use client";

import { useEffect, useCallback, useState, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { SplitScreen } from "@/components/layout/split-screen";
import { ChatPanel } from "@/components/chat/chat-panel";
import { JobsCanvas } from "@/components/canvas/jobs-canvas";
import { CoverLetterModal } from "@/components/shared/cover-letter-modal";
import { JobDetailPanel } from "@/components/canvas/job-detail-panel";
import { useCanvasSync } from "@/hooks/use-canvas-sync";
import { useKeyboardShortcuts, getChatShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { toast } from "sonner";

export default function ChatPage() {
  const searchParams = useSearchParams();
  const canvas = useCanvasSync();
  const [coverLetterText, setCoverLetterText] = useState("");
  const [coverLetterOpen, setCoverLetterOpen] = useState(false);
  const [detailJobId, setDetailJobId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [initialPrompt, setInitialPrompt] = useState<string | undefined>();
  const deepLinkHandled = useRef(false);

  // Keyboard shortcuts
  const shortcuts = useMemo(
    () =>
      getChatShortcuts({
        focusInput: () => {
          const chatInput = document.getElementById("chat-input");
          chatInput?.focus();
        },
        clearSelection: () => {
          if (detailOpen) setDetailOpen(false);
          if (coverLetterOpen) setCoverLetterOpen(false);
        },
      }),
    [detailOpen, coverLetterOpen]
  );
  useKeyboardShortcuts(shortcuts);

  // Load user's favorites on mount
  useEffect(() => {
    const controller = new AbortController();
    async function loadFavorites() {
      try {
        const res = await fetch("/api/user/favorites", { signal: controller.signal });
        if (res.ok && !controller.signal.aborted) {
          const data = (await res.json()) as { favoriteJobIds: number[] };
          canvas.setFavorites(new Set(data.favoriteJobIds));
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Silently fail - favorites will be empty
      }
    }
    loadFavorites();
    return () => { controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle ?job= deep link — fetch job info and build initial prompt
  useEffect(() => {
    if (deepLinkHandled.current) return;
    const jobParam = searchParams.get("job");
    if (!jobParam) return;
    deepLinkHandled.current = true;

    const jobId = Number(jobParam);
    if (isNaN(jobId)) return;

    const controller = new AbortController();
    async function fetchJobAndBuildPrompt() {
      try {
        const res = await fetch(`/api/jobs/${jobId}`, { signal: controller.signal });
        if (!res.ok || controller.signal.aborted) return;
        const data = (await res.json()) as {
          job: { title: string; companyName?: string | null; locationCity?: string | null; isRemote?: boolean };
        };
        const { title, companyName, locationCity, isRemote } = data.job;
        const company = companyName ?? "the company";
        const locationParts: string[] = [];
        if (locationCity) locationParts.push(locationCity);
        if (isRemote) locationParts.push("remote");
        const locationStr = locationParts.length > 0 ? ` (${locationParts.join(", ")})` : "";

        setInitialPrompt(
          `Write me a cover letter for the "${title}" position at ${company}${locationStr}. Make it professional and tailored.`
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Failed to fetch job — ignore deep link
      }
    }
    fetchJobAndBuildPrompt();
    return () => { controller.abort(); };
  }, [searchParams]);

  // Toggle favorite via API (direct from UI click)
  const handleFavorite = useCallback(async (jobId: number) => {
    try {
      const res = await fetch("/api/user/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          jobId: number;
          favorited: boolean;
        };
        canvas.handleToolResult("favoriteJob", data);
        toast.success(data.favorited ? "Job added to favorites" : "Job removed from favorites");
      }
    } catch {
      toast.error("Failed to update favorite");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open job detail panel instead of navigating away
  const handleViewDetails = useCallback((jobId: number) => {
    setDetailJobId(jobId);
    setDetailOpen(true);
  }, []);

  // Handle cover letter text from AI chat
  const handleCoverLetter = useCallback((text: string) => {
    setCoverLetterText(text);
    setCoverLetterOpen(true);
  }, []);

  return (
    <>
      <SplitScreen
        jobCount={canvas.totalCount}
        chatPanel={
          <ChatPanel
            onToolResult={canvas.handleToolResult}
            onCoverLetter={handleCoverLetter}
            initialPrompt={initialPrompt}
          />
        }
        canvasPanel={
          <JobsCanvas
            jobs={canvas.jobs}
            filters={canvas.filters}
            totalCount={canvas.totalCount}
            isLoading={canvas.isLoading}
            hasMore={canvas.hasMore}
            favoritedJobIds={canvas.favoritedJobIds}
            onFiltersChange={canvas.setFilters}
            onLoadMore={canvas.loadMore}
            onFavorite={handleFavorite}
            onViewDetails={handleViewDetails}
          />
        }
      />

      {/* Job detail slide-over panel */}
      <JobDetailPanel
        jobId={detailJobId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        isFavorited={detailJobId !== null && canvas.favoritedJobIds.has(detailJobId)}
        onFavorite={handleFavorite}
      />

      <CoverLetterModal
        open={coverLetterOpen}
        onOpenChange={setCoverLetterOpen}
        coverLetter={coverLetterText}
        jobTitle={canvas.coverLetterContext?.jobTitle}
        companyName={canvas.coverLetterContext?.companyName}
      />
    </>
  );
}
