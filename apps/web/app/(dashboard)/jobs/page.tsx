"use client";

import { useEffect, useCallback, useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { JobsCanvas } from "@/components/canvas/jobs-canvas";
import type { JobCardData } from "@/components/canvas/job-card";
import type { JobFilters } from "@/components/canvas/filter-bar";
import { useFavorites } from "@/hooks/use-favorites";
import { useHiddenJobs } from "@/hooks/use-hidden-jobs";
import { toast } from "sonner";

export default function JobsPage() {
  const router = useRouter();
  const { favoritedJobIds, toggleFavorite } = useFavorites();
  const { hiddenJobIds, hideJob } = useHiddenJobs();
  const [jobs, setJobs] = useState<JobCardData[]>([]);
  const [filters, setFilters] = useState<JobFilters>({});
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [sortMode, setSortMode] = useState<"recent" | "best_for_me">("recent");
  const loadMoreAbortRef = useRef<AbortController | null>(null);
  const pageRef = useRef(1);

  // Filter out hidden jobs from the displayed list
  const visibleJobs = useMemo(
    () => jobs.filter((job) => !hiddenJobIds.has(job.id)),
    [jobs, hiddenJobIds]
  );

  // Load jobs on mount and when filters change
  useEffect(() => {
    const controller = new AbortController();
    async function loadJobs() {
      setIsLoading(true);
      try {
        let endpoint: string;
        if (sortMode === "best_for_me") {
          // Personalised ranking by the user's fit scores (spec #3); filters don't apply.
          endpoint = `/api/user/recommended-jobs?limit=25`;
        } else {
          const params = new URLSearchParams({ page: "1", limit: "25" });
          if (filters.keywords) params.set("keywords", filters.keywords);
          if (filters.location) params.set("location", filters.location);
          if (filters.isRemote) params.set("isRemote", "true");
          if (filters.jobType) params.set("jobType", filters.jobType);
          if (filters.salaryMin) params.set("salaryMin", String(filters.salaryMin));
          if (filters.salaryMax) params.set("salaryMax", String(filters.salaryMax));
          endpoint = `/api/jobs/search?${params.toString()}`;
        }

        const res = await fetch(endpoint, { signal: controller.signal });
        if (!res.ok) throw new Error("Failed to load jobs");
        const data = (await res.json()) as {
          jobs: JobCardData[];
          total: number;
          hasMore: boolean;
        };
        if (!controller.signal.aborted) {
          setJobs(data.jobs);
          setTotalCount(data.total);
          setHasMore(data.hasMore);
          pageRef.current = 1;
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        toast.error("Failed to load jobs. Please try again.");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }
    loadJobs();
    return () => controller.abort();
  }, [filters, sortMode]);

  // Abort any pending load-more request on unmount
  useEffect(() => {
    return () => loadMoreAbortRef.current?.abort();
  }, []);

  const handleLoadMore = useCallback(async () => {
    loadMoreAbortRef.current?.abort();
    const controller = new AbortController();
    loadMoreAbortRef.current = controller;

    const nextPage = pageRef.current + 1;
    setIsLoading(true);
    try {
      let endpoint: string;
      if (sortMode === "best_for_me") {
        endpoint = `/api/user/recommended-jobs?limit=25&offset=${(nextPage - 1) * 25}`;
      } else {
        const params = new URLSearchParams({ page: String(nextPage), limit: "25" });
        if (filters.keywords) params.set("keywords", filters.keywords);
        if (filters.location) params.set("location", filters.location);
        if (filters.isRemote) params.set("isRemote", "true");
        if (filters.jobType) params.set("jobType", filters.jobType);
        if (filters.salaryMin) params.set("salaryMin", String(filters.salaryMin));
        if (filters.salaryMax) params.set("salaryMax", String(filters.salaryMax));
        endpoint = `/api/jobs/search?${params.toString()}`;
      }

      const res = await fetch(endpoint, {
        signal: controller.signal,
      });
      if (res.ok) {
        const data = (await res.json()) as {
          jobs: JobCardData[];
          total: number;
          hasMore: boolean;
        };
        if (!controller.signal.aborted) {
          setJobs((prev) => [...prev, ...data.jobs]);
          setHasMore(data.hasMore);
          pageRef.current = nextPage;
        }
      } else {
        toast.error("Failed to load more jobs.");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error("Failed to load more jobs");
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [filters, sortMode]);

  const handleSortModeChange = useCallback((mode: "recent" | "best_for_me") => {
    pageRef.current = 1;
    loadMoreAbortRef.current?.abort();
    setSortMode(mode);
  }, []);

  const handleViewDetails = useCallback(
    (jobId: number) => {
      router.push(`/jobs/${jobId}`);
    },
    [router]
  );

  const handleFiltersChange = useCallback((newFilters: JobFilters) => {
    pageRef.current = 1;
    loadMoreAbortRef.current?.abort();
    setFilters(newFilters);
  }, []);

  return (
    <JobsCanvas
      jobs={visibleJobs}
      filters={filters}
      totalCount={totalCount}
      isLoading={isLoading}
      hasMore={hasMore}
      favoritedJobIds={favoritedJobIds}
      onFiltersChange={handleFiltersChange}
      onLoadMore={handleLoadMore}
      onFavorite={toggleFavorite}
      onViewDetails={handleViewDetails}
      onHideJob={hideJob}
      sortMode={sortMode}
      onSortModeChange={handleSortModeChange}
    />
  );
}
