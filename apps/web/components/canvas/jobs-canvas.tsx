"use client";

import { useRef, useCallback } from "react";
import { Briefcase, Loader2 } from "lucide-react";
import { JobCard, type JobCardData } from "./job-card";
import { JobCardSkeletonList } from "./job-card-skeleton";
import { FilterBar, type JobFilters } from "./filter-bar";
import { EmptyState } from "@/components/shared/empty-state";

interface JobsCanvasProps {
  jobs: JobCardData[];
  filters: JobFilters;
  totalCount: number;
  isLoading: boolean;
  hasMore: boolean;
  favoritedJobIds: Set<number>;
  onFiltersChange: (filters: JobFilters) => void;
  onLoadMore: () => void;
  onFavorite: (jobId: number) => void;
  onViewDetails: (jobId: number) => void;
}

export function JobsCanvas({
  jobs,
  filters,
  totalCount,
  isLoading,
  hasMore,
  favoritedJobIds,
  onFiltersChange,
  onLoadMore,
  onFavorite,
  onViewDetails,
}: JobsCanvasProps) {
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Infinite scroll sentinel
  const lastJobRef = useCallback(
    (node: HTMLElement | null) => {
      if (isLoading) return;
      if (observerRef.current) observerRef.current.disconnect();

      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0]?.isIntersecting && hasMore) {
          onLoadMore();
        }
      });

      if (node) observerRef.current.observe(node);
    },
    [isLoading, hasMore, onLoadMore]
  );

  return (
    <div className="flex h-full flex-col" role="region" aria-label="Job listings">
      <FilterBar filters={filters} onFiltersChange={onFiltersChange} />

      {/* Results count */}
      <div className="flex items-center justify-between px-3 py-2" aria-live="polite" aria-atomic="true">
        <p className="text-xs text-muted-foreground">
          {totalCount > 0 ? (
            <>
              Showing {jobs.length} of {totalCount} jobs
            </>
          ) : isLoading ? (
            "Searching..."
          ) : (
            "No jobs found"
          )}
        </p>
      </div>

      {/* Job cards */}
      <div className="flex-1 overflow-y-auto px-3 pb-3" role="feed" aria-busy={isLoading}>
        {jobs.length === 0 && isLoading ? (
          <JobCardSkeletonList count={5} />
        ) : jobs.length === 0 && !isLoading ? (
          <EmptyState
            icon={Briefcase}
            title="No jobs yet"
            description='Use the chat to search for jobs. Try saying "Find me remote React developer positions" or use the filters above.'
          />
        ) : (
          <ul className="space-y-2" aria-label="Job results">
            {jobs.map((job, index) => (
              <li
                key={job.id}
                ref={index === jobs.length - 1 ? lastJobRef : undefined}
              >
                <JobCard
                  job={job}
                  isFavorited={favoritedJobIds.has(job.id)}
                  onFavorite={onFavorite}
                  onViewDetails={onViewDetails}
                />
              </li>
            ))}

            {isLoading && (
              <li className="list-none">
                <div className="flex items-center justify-center py-4" role="status" aria-label="Loading more jobs">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
                  <span className="sr-only">Loading more jobs...</span>
                </div>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
