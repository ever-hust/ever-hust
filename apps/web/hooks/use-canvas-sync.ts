"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { JobCardData } from "@/components/canvas/job-card";
import type { JobFilters } from "@/components/canvas/filter-bar";
import type { SalaryInsightsData } from "@/components/canvas/salary-insights-card";
import type { MarketInsightsData } from "@/components/canvas/market-insights-card";
import type { EvaluationView } from "@/components/canvas/evaluation-card";
import type { ArtifactView } from "@/components/canvas/artifact-card";

/** Advisory tools whose structured result renders on the canvas as a generic artifact card. */
const ARTIFACT_TITLES: Record<string, string> = {
  draftCoverLetter: "Cover Letter",
  tailorResume: "Résumé Tailoring",
  negotiationBrief: "Negotiation Brief",
  companyDeepDive: "Company Brief",
  draftOutreach: "Outreach Draft",
  prepInterview: "Interview Prep",
  careerAdvisor: "Growth Plan",
  applyCopilot: "Application Draft",
};

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
  marketInsights: MarketInsightsData | null;
  evaluation: EvaluationView | null;
  artifact: ArtifactView | null;
  /** When true, show the DashboardCanvas instead of JobsCanvas */
  showDashboard: boolean;
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
    isLoading: true, // start loading — initial fetch will resolve this
    hasMore: false,
    favoritedJobIds: new Set(),
    coverLetterContext: null,
    salaryInsights: null,
    marketInsights: null,
    evaluation: null,
    artifact: null,
    showDashboard: true,
  });

  // Track whether the AI has populated jobs (to avoid overwriting with DB results)
  const aiPopulatedRef = useRef(false);

  // Fetch jobs from the database on mount AND whenever filters change.
  // AI chat tool results (searchJobs) will set aiPopulatedRef to true,
  // preventing this effect from overwriting AI results until filters change.
  useEffect(() => {
    const controller = new AbortController();
    async function fetchJobs() {
      setState((prev) => ({ ...prev, isLoading: true }));
      try {
        const params = new URLSearchParams({ page: "1", limit: "25" });
        const f = state.filters;
        if (f.keywords) params.set("keywords", f.keywords);
        if (f.location) params.set("location", f.location);
        if (f.isRemote) params.set("isRemote", "true");
        if (f.jobType) params.set("jobType", f.jobType);
        if (f.salaryMin) params.set("salaryMin", String(f.salaryMin));
        if (f.salaryMax) params.set("salaryMax", String(f.salaryMax));

        const res = await fetch(`/api/jobs/search?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok || controller.signal.aborted) return;
        const data = (await res.json()) as {
          jobs: JobCardData[];
          total: number;
          hasMore: boolean;
        };
        if (!controller.signal.aborted) {
          setState((prev) => ({
            ...prev,
            jobs: data.jobs,
            totalCount: data.total,
            hasMore: data.hasMore,
            isLoading: false,
          }));
          // When user applies filters, reset the AI-populated flag
          // so that subsequent filter changes keep working
          aiPopulatedRef.current = false;
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState((prev) => (prev.isLoading ? { ...prev, isLoading: false } : prev));
      }
    }
    fetchJobs();
    return () => controller.abort();
  }, [state.filters]);

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
            showDashboard: false,
          }));
          break;
        }

        case "updateFilters": {
          const filterResult = data as { filters: JobFilters };
          setState((prev) => ({
            ...prev,
            filters: { ...prev.filters, ...filterResult.filters },
            showDashboard: false,
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

        case "marketInsights": {
          const marketResult = result as MarketInsightsData;
          // Surface the card when there's data, or an error worth showing.
          if (marketResult.demandCount > 0 || marketResult.error) {
            setState((prev) => ({
              ...prev,
              marketInsights: marketResult,
            }));
          }
          break;
        }

        case "evaluateJob": {
          const evalResult = result as { evaluated?: boolean } & EvaluationView;
          // Only surface a successful evaluation; errors are narrated by the AI.
          if (evalResult.evaluated) {
            setState((prev) => ({
              ...prev,
              evaluation: evalResult,
            }));
          }
          break;
        }

        case "draftCoverLetter":
        case "tailorResume":
        case "negotiationBrief":
        case "companyDeepDive":
        case "draftOutreach":
        case "prepInterview":
        case "careerAdvisor":
        case "applyCopilot": {
          // Surface any successful advisory artifact as a generic card; errors are narrated.
          if (!data.error) {
            const subtitleParts = [data.jobTitle, data.companyName].filter(
              (x): x is string => typeof x === "string"
            );
            setState((prev) => ({
              ...prev,
              artifact: {
                title: ARTIFACT_TITLES[toolName] ?? "AI Result",
                subtitle: subtitleParts.length > 0 ? subtitleParts.join(" • ") : undefined,
                data: data as Record<string, unknown>,
              },
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

  const clearMarketInsights = useCallback(() => {
    setState((prev) => ({ ...prev, marketInsights: null }));
  }, []);

  const clearEvaluation = useCallback(() => {
    setState((prev) => ({ ...prev, evaluation: null }));
  }, []);

  const clearArtifact = useCallback(() => {
    setState((prev) => ({ ...prev, artifact: null }));
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
    clearMarketInsights,
    clearEvaluation,
    clearArtifact,
    addRealtimeJob,
  };
}
