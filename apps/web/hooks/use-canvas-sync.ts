"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { JobCardData } from "@/components/canvas/job-card";
import type { JobFilters } from "@/components/canvas/filter-bar";
import type { SalaryInsightsData } from "@/components/canvas/salary-insights-card";

export interface CoverLetterContext {
  jobId: number;
  jobTitle: string;
  companyName: string;
}

interface CanvasState {
  jobs: JobCardData[];
  filters: JobFilters;
  totalCount: number;
  isLoading: boolean;
  hasMore: boolean;
  favoritedJobIds: Set<number>;
  coverLetterContext: CoverLetterContext | null;
  salaryInsights: SalaryInsightsData | null;
}

export function useCanvasSync() {
  const loadMoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup safety-timeout on unmount to prevent setState on dead component
  useEffect(() => {
    return () => {
      if (loadMoreTimerRef.current) clearTimeout(loadMoreTimerRef.current);
    };
  }, []);

  const [state, setState] = useState<CanvasState>({
    jobs: [],
    filters: {},
    totalCount: 0,
    isLoading: false,
    hasMore: false,
    favoritedJobIds: new Set(),
    coverLetterContext: null,
    salaryInsights: null,
  });

  // Handle tool results from the AI chat stream
  const handleToolResult = useCallback(
    (toolName: string, result: unknown) => {
      const data = result as Record<string, unknown>;

      switch (toolName) {
        case "searchJobs": {
          const searchResult = data as {
            jobs: JobCardData[];
            totalCount: number;
            limit: number;
            offset: number;
            hasMore: boolean;
          };

          const jobs = searchResult.jobs ?? [];
          setState((prev) => ({
            ...prev,
            jobs:
              searchResult.offset > 0
                ? [...prev.jobs, ...jobs]
                : jobs,
            totalCount: searchResult.totalCount,
            hasMore: searchResult.hasMore,
            isLoading: false,
          }));
          break;
        }

        case "updateFilters": {
          const filterResult = data as { filters: JobFilters };
          setState((prev) => ({
            ...prev,
            filters: { ...prev.filters, ...filterResult.filters },
          }));
          break;
        }

        case "favoriteJob": {
          const favResult = data as { jobId: number; favorited: boolean };
          setState((prev) => {
            const newFavorites = new Set(prev.favoritedJobIds);
            if (favResult.favorited) {
              newFavorites.add(favResult.jobId);
            } else {
              newFavorites.delete(favResult.jobId);
            }
            return { ...prev, favoritedJobIds: newFavorites };
          });
          break;
        }

        case "generateCoverLetter": {
          const clResult = data as {
            generated: boolean;
            jobId: number;
            context?: {
              jobTitle: string;
              companyName: string;
            };
          };
          const ctx = clResult.context;
          if (clResult.generated && ctx) {
            setState((prev) => ({
              ...prev,
              coverLetterContext: {
                jobId: clResult.jobId,
                jobTitle: ctx.jobTitle,
                companyName: ctx.companyName,
              },
            }));
          }
          break;
        }

        case "salaryInsights": {
          const salaryResult = result as SalaryInsightsData;
          // Only show the card if there's actual salary data (sampleSize > 0)
          if (salaryResult.sampleSize > 0 || salaryResult.error) {
            setState((prev) => ({
              ...prev,
              salaryInsights: salaryResult,
            }));
          }
          break;
        }

        default:
          // Unknown tool — ignore but log for debugging
          if (process.env.NODE_ENV === "development") {
            console.debug(`[canvas-sync] Unhandled tool result: ${toolName}`);
          }
      }
    },
    []
  );

  const setFilters = useCallback((filters: JobFilters) => {
    setState((prev) => ({ ...prev, filters }));
  }, []);

  const setLoading = useCallback((isLoading: boolean) => {
    setState((prev) => ({ ...prev, isLoading }));
  }, []);

  const loadMore = useCallback(() => {
    // This triggers a new search via the chat — set loading state.
    // Safety timeout: if the AI doesn't produce a searchJobs result within
    // 30 seconds, reset loading to prevent the button staying stuck.
    // Previous timers are cleared to prevent accumulation on rapid calls.
    if (loadMoreTimerRef.current) clearTimeout(loadMoreTimerRef.current);
    setState((prev) => ({ ...prev, isLoading: true }));
    loadMoreTimerRef.current = setTimeout(() => {
      loadMoreTimerRef.current = null;
      setState((prev) => (prev.isLoading ? { ...prev, isLoading: false } : prev));
    }, 30_000);
  }, []);

  const setFavorites = useCallback((favoritedJobIds: Set<number>) => {
    setState((prev) => ({ ...prev, favoritedJobIds }));
  }, []);

  const clearCoverLetter = useCallback(() => {
    setState((prev) => ({ ...prev, coverLetterContext: null }));
  }, []);

  const clearSalaryInsights = useCallback(() => {
    setState((prev) => ({ ...prev, salaryInsights: null }));
  }, []);

  // Add a job from Supabase Realtime (live update from background sync).
  // Only prepends if the job doesn't already exist in the list.
  const addRealtimeJob = useCallback((job: JobCardData) => {
    setState((prev) => {
      if (prev.jobs.some((j) => j.id === job.id)) return prev;
      return {
        ...prev,
        jobs: [job, ...prev.jobs],
        totalCount: prev.totalCount + 1,
      };
    });
  }, []);

  return {
    ...state,
    handleToolResult,
    setFilters,
    setLoading,
    loadMore,
    setFavorites,
    clearCoverLetter,
    clearSalaryInsights,
    addRealtimeJob,
  };
}
