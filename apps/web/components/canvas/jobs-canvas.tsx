"use client";

import { useState, useRef, useCallback, useMemo, useEffect, memo } from "react";
import { Briefcase, Loader2, GitCompareArrows, X, SearchX } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Badge } from "@repo/ui/badge";
import { JobCard, type JobCardData } from "./job-card";
import { JobCardSkeletonList } from "./job-card-skeleton";
import { FilterBar, type JobFilters } from "./filter-bar";
import { JobCompareDialog } from "./job-compare-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { MAX_COMPARE_JOBS } from "@/lib/constants";

/** Returns true if any filter field has a non-empty value. */
function hasActiveFilters(filters: JobFilters): boolean {
  return !!(
    filters.keywords ||
    filters.location ||
    filters.isRemote ||
    filters.jobType ||
    (filters.salaryMin != null && filters.salaryMin > 0) ||
    (filters.salaryMax != null && filters.salaryMax > 0) ||
    (filters.skills && filters.skills.length > 0)
  );
}

interface JobsCanvasProps {
  jobs: JobCardData[];
  filters: JobFilters;
  totalCount: number;
  isLoading: boolean;
  hasMore: boolean;
  favoritedJobIds: Set<number>;
  isCompareMode?: boolean;
  selectedJobIds?: Set<number>;
  onFiltersChange: (filters: JobFilters) => void;
  onLoadMore: () => void;
  onFavorite: (jobId: number) => void;
  onViewDetails: (jobId: number) => void;
  onToggleCompareMode?: () => void;
  onToggleJobCompare?: (jobId: number) => void;
}

export const JobsCanvas = memo(function JobsCanvas({
  jobs,
  filters,
  totalCount,
  isLoading,
  hasMore,
  favoritedJobIds,
  isCompareMode: controlledCompareMode,
  selectedJobIds: controlledSelectedIds,
  onFiltersChange,
  onLoadMore,
  onFavorite,
  onViewDetails,
  onToggleCompareMode,
  onToggleJobCompare,
}: JobsCanvasProps) {
  // Internal compare state — used when controlled props are not provided
  const [internalCompareMode, setInternalCompareMode] = useState(false);
  const [internalSelectedIds, setInternalSelectedIds] = useState<Set<number>>(new Set());
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);

  const isCompareMode = controlledCompareMode ?? internalCompareMode;
  const selectedJobIds = controlledSelectedIds ?? internalSelectedIds;

  const handleToggleCompareMode = useCallback(() => {
    if (onToggleCompareMode) {
      onToggleCompareMode();
    } else {
      setInternalCompareMode((prev) => {
        if (prev) setInternalSelectedIds(new Set());
        return !prev;
      });
    }
  }, [onToggleCompareMode]);

  const handleToggleJobCompare = useCallback(
    (jobId: number) => {
      if (onToggleJobCompare) {
        onToggleJobCompare(jobId);
      } else {
        setInternalSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(jobId)) {
            next.delete(jobId);
          } else if (next.size < MAX_COMPARE_JOBS) {
            next.add(jobId);
          }
          return next;
        });
      }
    },
    [onToggleJobCompare]
  );

  const handleOpenCompare = useCallback(() => {
    if (selectedJobIds.size >= 2) {
      setCompareDialogOpen(true);
    }
  }, [selectedJobIds]);

  /** Jobs selected for comparison, in stable order matching the jobs array. */
  const selectedJobs = useMemo(
    () => jobs.filter((job) => selectedJobIds.has(job.id)),
    [jobs, selectedJobIds]
  );

  const observerRef = useRef<IntersectionObserver | null>(null);

  // Disconnect the IntersectionObserver when the component unmounts to prevent
  // leaked callbacks that could fire after the component is gone.
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, []);

  // Infinite scroll sentinel
  const lastJobRef = useCallback(
    (node: HTMLElement | null) => {
      // Always disconnect the previous observer first to prevent leaks
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (isLoading || !node) return;

      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0]?.isIntersecting && hasMore) {
          onLoadMore();
        }
      });
      observerRef.current.observe(node);
    },
    [isLoading, hasMore, onLoadMore]
  );

  return (
    <div className="flex h-full flex-col" role="region" aria-label="Job listings">
      <FilterBar filters={filters} onFiltersChange={onFiltersChange} />

      {/* Results count + compare toggle */}
      <div className="flex flex-wrap items-center justify-between gap-1 px-3 py-2" aria-live="polite" aria-atomic="true">
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

        {jobs.length >= 2 && (
          <Button
            variant={isCompareMode ? "secondary" : "ghost"}
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={handleToggleCompareMode}
            aria-pressed={isCompareMode}
            aria-label={isCompareMode ? "Exit compare mode" : "Enter compare mode"}
          >
            {isCompareMode ? (
              <>
                <X className="h-3 w-3" aria-hidden="true" />
                Cancel
              </>
            ) : (
              <>
                <GitCompareArrows className="h-3 w-3" aria-hidden="true" />
                Compare
              </>
            )}
          </Button>
        )}
      </div>

      {/* Compare action bar */}
      {isCompareMode && (
        <div className="flex items-center gap-2 border-t border-b bg-muted/30 px-3 py-2">
          <p className="text-xs text-muted-foreground">
            Select 2-3 jobs to compare
          </p>
          {selectedJobIds.size > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {selectedJobIds.size}/{MAX_COMPARE_JOBS} selected
            </Badge>
          )}
          <Button
            size="sm"
            className="ml-auto h-7 gap-1.5 text-xs"
            disabled={selectedJobIds.size < 2}
            onClick={handleOpenCompare}
          >
            <GitCompareArrows className="h-3 w-3" aria-hidden="true" />
            Compare ({selectedJobIds.size})
          </Button>
        </div>
      )}

      {/* Job cards */}
      <div className="flex-1 overflow-y-auto px-3 pb-3" role="feed" aria-busy={isLoading}>
        {jobs.length === 0 && isLoading ? (
          <JobCardSkeletonList count={5} />
        ) : jobs.length === 0 && !isLoading ? (
          hasActiveFilters(filters) ? (
            <EmptyState
              icon={SearchX}
              title="No jobs found matching your criteria"
              description="Try adjusting your filters, broadening your search terms, or removing some filter conditions to see more results."
            >
              <Button
                variant="outline"
                size="sm"
                onClick={() => onFiltersChange({})}
              >
                Clear All Filters
              </Button>
            </EmptyState>
          ) : (
            <EmptyState
              icon={Briefcase}
              title="No jobs yet"
              description='Use the chat to search for jobs. Try saying "Find me remote React developer positions" or use the filters above.'
            />
          )
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
                  isCompareMode={isCompareMode}
                  isSelected={selectedJobIds.has(job.id)}
                  onFavorite={onFavorite}
                  onViewDetails={onViewDetails}
                  onToggleCompare={handleToggleJobCompare}
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

      {/* Compare dialog */}
      <JobCompareDialog
        jobs={selectedJobs}
        open={compareDialogOpen}
        onOpenChange={setCompareDialogOpen}
      />
    </div>
  );
});
