"use client";

import { useEffect, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { JobsCanvas } from "@/components/canvas/jobs-canvas";
import type { JobCardData } from "@/components/canvas/job-card";
import type { JobFilters } from "@/components/canvas/filter-bar";
import { Skeleton } from "@repo/ui/skeleton";
import { toast } from "sonner";

export default function JobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobCardData[]>([]);
  const [filters, setFilters] = useState<JobFilters>({});
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [favoritedJobIds, setFavoritedJobIds] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // Load favorites
  useEffect(() => {
    async function loadFavorites() {
      try {
        const res = await fetch("/api/user/favorites");
        if (res.ok) {
          const data = (await res.json()) as { favoriteJobIds: number[] };
          setFavoritedJobIds(new Set(data.favoriteJobIds));
        }
      } catch {
        // Silently fail
      }
    }
    loadFavorites();
  }, []);

  // Load jobs on mount
  useEffect(() => {
    async function loadJobs() {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ page: "1", limit: "25" });
        if (filters.keywords) params.set("keywords", filters.keywords);
        if (filters.location) params.set("location", filters.location);
        if (filters.isRemote) params.set("isRemote", "true");
        if (filters.jobType) params.set("jobType", filters.jobType);
        if (filters.salaryMin) params.set("salaryMin", String(filters.salaryMin));
        if (filters.salaryMax) params.set("salaryMax", String(filters.salaryMax));

        const res = await fetch(`/api/jobs/search?${params.toString()}`);
        if (res.ok) {
          const data = (await res.json()) as {
            jobs: JobCardData[];
            total: number;
            hasMore: boolean;
          };
          setJobs(data.jobs);
          setTotalCount(data.total);
          setHasMore(data.hasMore);
          setPage(1);
        }
      } catch {
        // Silently fail
      } finally {
        setIsLoading(false);
      }
    }
    loadJobs();
  }, [filters]);

  const handleLoadMore = useCallback(async () => {
    const nextPage = page + 1;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage), limit: "25" });
      if (filters.keywords) params.set("keywords", filters.keywords);
      if (filters.location) params.set("location", filters.location);
      if (filters.isRemote) params.set("isRemote", "true");

      const res = await fetch(`/api/jobs/search?${params.toString()}`);
      if (res.ok) {
        const data = (await res.json()) as {
          jobs: JobCardData[];
          total: number;
          hasMore: boolean;
        };
        setJobs((prev) => [...prev, ...data.jobs]);
        setHasMore(data.hasMore);
        setPage(nextPage);
      }
    } catch {
      // Silently fail
    } finally {
      setIsLoading(false);
    }
  }, [page, filters]);

  const handleFavorite = useCallback(async (jobId: number) => {
    try {
      const res = await fetch("/api/user/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      if (res.ok) {
        const data = (await res.json()) as { jobId: number; favorited: boolean };
        setFavoritedJobIds((prev) => {
          const next = new Set(prev);
          if (data.favorited) {
            next.add(jobId);
            toast.success("Job added to favorites");
          } else {
            next.delete(jobId);
            toast.success("Job removed from favorites");
          }
          return next;
        });
      }
    } catch {
      toast.error("Failed to update favorite");
    }
  }, []);

  const handleViewDetails = useCallback(
    (jobId: number) => {
      router.push(`/jobs/${jobId}`);
    },
    [router]
  );

  return (
    <JobsCanvas
      jobs={jobs}
      filters={filters}
      totalCount={totalCount}
      isLoading={isLoading}
      hasMore={hasMore}
      favoritedJobIds={favoritedJobIds}
      onFiltersChange={setFilters}
      onLoadMore={handleLoadMore}
      onFavorite={handleFavorite}
      onViewDetails={handleViewDetails}
    />
  );
}
