"use client";

import { useEffect, useCallback, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { JobsCanvas } from "@/components/canvas/jobs-canvas";
import type { JobCardData } from "@/components/canvas/job-card";
import type { JobFilters } from "@/components/canvas/filter-bar";
import { useFavorites } from "@/hooks/use-favorites";
import { toast } from "sonner";

export default function JobsPage() {
  const router = useRouter();
  const { favoritedJobIds, toggleFavorite } = useFavorites();
  const [jobs, setJobs] = useState<JobCardData[]>([]);
  const [filters, setFilters] = useState<JobFilters>({});
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const loadMoreAbortRef = useRef<AbortController | null>(null);
  // Track page in a ref so handleLoadMore doesn't depend on `page` state,
  // avoiding re-creation of the callback (and re-renders) on every pagination.
  const pageRef = useRef(1);

  // Load jobs on mount and when filters change
  useEffect(() => {
    const controller = new AbortController();
    async function loadJobs() {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ page: "1", limit: "25" });
        if (filters.keywords) params.set("keywords", filters.keywords);
        if (filters.location) params.set("location", filters.location);
        if (filters.isRemote) params.set("isRemote", "true");
        if (filters.jobType) params.set("jobType", filters.jobType);
        if (filters.salaryMin) params.set("salaryMin", String(filters.salaryMin));
        if (filters.salaryMax) params.set("salaryMax", String(filters.salaryMax));

        const res = await fetch(`/api/jobs/search?${params.toString()}`, { signal: controller.signal });
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
          setPage(1);
          pageRef.current = 1;
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load jobs");
        toast.error("Failed to load jobs. Please try again.");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }
    loadJobs();
    return () => controller.abort();
  }, [filters]);

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
      const params = new URLSearchParams({ page: String(nextPage), limit: "25" });
      if (filters.keywords) params.set("keywords", filters.keywords);
      if (filters.location) params.set("location", filters.location);
      if (filters.isRemote) params.set("isRemote", "true");
      if (filters.jobType) params.set("jobType", filters.jobType);
      if (filters.salaryMin) params.set("salaryMin", String(filters.salaryMin));
      if (filters.salaryMax) params.set("salaryMax", String(filters.salaryMax));

      const res = await fetch(`/api/jobs/search?${params.toString()}`, {
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
          setPage(nextPage);
          pageRef.current = nextPage;
        }
      } else {
        toast.error("Failed to load more jobs.");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error("Failed to load more jobs");
    } finally {
      // Only reset loading if this request wasn't aborted by a newer one.
      // The newer request will manage its own loading state.
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [filters]);

  const handleViewDetails = useCallback(
    (jobId: number) => {
      router.push(`/jobs/${jobId}`);
    },
    [router]
  );

  // Reset page tracking synchronously on filter change to prevent stale
  // pageRef values if loadMore fires between setFilters and the useEffect.
  const handleFiltersChange = useCallback((newFilters: JobFilters) => {
    pageRef.current = 1;
    loadMoreAbortRef.current?.abort();
    setFilters(newFilters);
  }, []);

  return (
    <JobsCanvas
      jobs={jobs}
      filters={filters}
      totalCount={totalCount}
      isLoading={isLoading}
      hasMore={hasMore}
      favoritedJobIds={favoritedJobIds}
      onFiltersChange={handleFiltersChange}
      onLoadMore={handleLoadMore}
      onFavorite={toggleFavorite}
      onViewDetails={handleViewDetails}
    />
  );
}
