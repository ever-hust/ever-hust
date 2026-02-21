"use client";

import { useEffect, useCallback, useState, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { SplitScreen } from "@/components/layout/split-screen";
import { ChatPanel } from "@/components/chat/chat-panel";
import { JobsCanvas } from "@/components/canvas/jobs-canvas";
import { useCanvasSync } from "@/hooks/use-canvas-sync";
import { useFavorites } from "@/hooks/use-favorites";
import { useRealtimeJobs, type RealtimeJob } from "@/hooks/use-realtime-jobs";
import { useKeyboardShortcuts, getChatShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { toast } from "sonner";

// Lazy-load components that are only rendered conditionally
const SalaryInsightsCard = dynamic(
  () =>
    import("@/components/canvas/salary-insights-card").then(
      (mod) => mod.SalaryInsightsCard,
    ),
  { ssr: false },
);

// Lazy-load dialog components — they are only rendered when the user opens
// them, so they don't need to be in the initial bundle.
const CoverLetterModal = dynamic(
  () =>
    import("@/components/shared/cover-letter-modal").then(
      (mod) => mod.CoverLetterModal,
    ),
  { ssr: false },
);

const JobDetailPanel = dynamic(
  () =>
    import("@/components/canvas/job-detail-panel").then(
      (mod) => mod.JobDetailPanel,
    ),
  { ssr: false },
);

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

  // Sync favorites from the useFavorites hook into the canvas state
  const { favoritedJobIds: hookFavorites } = useFavorites();
  useEffect(() => {
    canvas.setFavorites(hookFavorites);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hookFavorites]);

  // Subscribe to live job updates via Supabase Realtime.
  // New jobs inserted by the background sync task will appear on the canvas
  // automatically without requiring a page refresh or new search.
  useRealtimeJobs({
    onInsert: useCallback(
      (job: RealtimeJob) => {
        canvas.addRealtimeJob({
          id: job.id,
          externalId: job.external_id,
          title: job.title,
          companyName: job.company_name,
          companyLogo: job.company_logo,
          companyUrl: null,
          jobUrl: job.job_url,
          applyUrl: null,
          locationCity: job.location_city,
          locationState: null,
          locationCountry: job.location_country,
          isRemote: job.is_remote,
          jobType: null,
          salaryMin: job.salary_min != null ? String(job.salary_min) : null,
          salaryMax: job.salary_max != null ? String(job.salary_max) : null,
          salaryCurrency: job.salary_currency,
          salaryInterval: null,
          description: null,
          skills: job.skills,
          datePosted: job.date_posted,
          site: job.site,
          jobLevel: null,
          companyIndustry: null,
        });
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      []
    ),
  });

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

  // Destructure the stable callback ref so we can depend on it directly
  // instead of the entire canvas object (which changes identity on state updates).
  const { handleToolResult } = canvas;

  // Toggle favorite via API (direct from UI click)
  const handleFavorite = useCallback(async (jobId: number) => {
    try {
      const res = await fetch("/api/user/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      if (!res.ok) {
        toast.error("Failed to update favorite");
        return;
      }
      const data = (await res.json()) as {
        jobId: number;
        favorited: boolean;
      };
      handleToolResult("favoriteJob", data);
      toast.success(data.favorited ? "Job added to favorites" : "Job removed from favorites");
    } catch {
      toast.error("Failed to update favorite");
    }
  }, [handleToolResult]);

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
          <div className="flex h-full flex-col">
            {/* Salary insights overlay — rendered above jobs when available */}
            {canvas.salaryInsights && (
              <div className="border-b p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground font-medium">
                    Salary Analysis
                  </span>
                  <button
                    type="button"
                    onClick={canvas.clearSalaryInsights}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                    aria-label="Dismiss salary insights"
                  >
                    Dismiss
                  </button>
                </div>
                <SalaryInsightsCard data={canvas.salaryInsights} />
              </div>
            )}
            <div className="flex-1 overflow-hidden">
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
            </div>
          </div>
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
