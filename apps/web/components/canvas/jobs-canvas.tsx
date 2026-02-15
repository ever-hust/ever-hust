"use client";

import { useRef, useCallback } from "react";
import { Briefcase, Loader2 } from "lucide-react";
import { JobCard, type JobCardData } from "./job-card";
import { FilterBar, type JobFilters } from "./filter-bar";

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
    (node: HTMLDivElement | null) => {
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
    <div className="flex h-full flex-col">
      <FilterBar filters={filters} onFiltersChange={onFiltersChange} />

      {/* Results count */}
      <div className="flex items-center justify-between px-3 py-2">
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
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {jobs.length === 0 && !isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Briefcase className="mx-auto h-12 w-12 text-muted-foreground/30" />
              <h3 className="mt-3 text-sm font-medium">No jobs yet</h3>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                Use the chat to search for jobs. Try saying &quot;Find me remote
                React developer positions&quot; or use the filters above.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {jobs.map((job, index) => (
              <div
                key={job.id}
                ref={index === jobs.length - 1 ? lastJobRef : undefined}
              >
                <JobCard
                  job={job}
                  isFavorited={favoritedJobIds.has(job.id)}
                  onFavorite={onFavorite}
                  onViewDetails={onViewDetails}
                />
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
