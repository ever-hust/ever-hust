"use client";

import { useEffect, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { SplitScreen } from "@/components/layout/split-screen";
import { ChatPanel } from "@/components/chat/chat-panel";
import { JobsCanvas } from "@/components/canvas/jobs-canvas";
import { CoverLetterModal } from "@/components/shared/cover-letter-modal";
import { useCanvasSync } from "@/hooks/use-canvas-sync";
import { toast } from "sonner";

export default function ChatPage() {
  const canvas = useCanvasSync();
  const router = useRouter();
  const [coverLetterText, setCoverLetterText] = useState("");
  const [coverLetterOpen, setCoverLetterOpen] = useState(false);

  // Load user's favorites on mount
  useEffect(() => {
    async function loadFavorites() {
      try {
        const res = await fetch("/api/user/favorites");
        if (res.ok) {
          const data = (await res.json()) as { favoriteJobIds: number[] };
          canvas.setFavorites(new Set(data.favoriteJobIds));
        }
      } catch {
        // Silently fail - favorites will be empty
      }
    }
    loadFavorites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Navigate to job detail page
  const handleViewDetails = useCallback(
    (jobId: number) => {
      router.push(`/jobs/${jobId}`);
    },
    [router]
  );

  // Handle cover letter text from AI chat
  const handleCoverLetter = useCallback((text: string) => {
    setCoverLetterText(text);
    setCoverLetterOpen(true);
  }, []);

  return (
    <>
      <SplitScreen
        chatPanel={
          <ChatPanel
            onToolResult={canvas.handleToolResult}
            onCoverLetter={handleCoverLetter}
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
