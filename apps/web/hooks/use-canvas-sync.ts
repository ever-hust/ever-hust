"use client";

import { useState, useCallback } from "react";
import type { JobCardData } from "@/components/canvas/job-card";
import type { JobFilters } from "@/components/canvas/filter-bar";

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
}

export function useCanvasSync() {
  const [state, setState] = useState<CanvasState>({
    jobs: [],
    filters: {},
    totalCount: 0,
    isLoading: false,
    hasMore: false,
    favoritedJobIds: new Set(),
    coverLetterContext: null,
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

          setState((prev) => ({
            ...prev,
            jobs:
              searchResult.offset > 0
                ? [...prev.jobs, ...searchResult.jobs]
                : searchResult.jobs,
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
          if (clResult.generated && clResult.context) {
            setState((prev) => ({
              ...prev,
              coverLetterContext: {
                jobId: clResult.jobId,
                jobTitle: clResult.context!.jobTitle,
                companyName: clResult.context!.companyName,
              },
            }));
          }
          break;
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
    // This triggers a new search via the chat - we set loading state
    // The actual search happens through the chat interaction
    setState((prev) => ({ ...prev, isLoading: true }));
  }, []);

  const setFavorites = useCallback((favoritedJobIds: Set<number>) => {
    setState((prev) => ({ ...prev, favoritedJobIds }));
  }, []);

  const clearCoverLetter = useCallback(() => {
    setState((prev) => ({ ...prev, coverLetterContext: null }));
  }, []);

  return {
    ...state,
    handleToolResult,
    setFilters,
    setLoading,
    loadMore,
    setFavorites,
    clearCoverLetter,
  };
}
