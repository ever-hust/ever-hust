import { Skeleton } from "@repo/ui/skeleton";

/**
 * Loading skeleton that matches the JobCard layout.
 * Shows during initial load and infinite scroll pagination.
 */
export function JobCardSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start gap-3">
        {/* Logo placeholder */}
        <Skeleton className="h-10 w-10 shrink-0 rounded-md" />

        <div className="min-w-0 flex-1">
          {/* Title and company */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="mt-1.5 h-3 w-1/3" />
            </div>
            <Skeleton className="h-7 w-7 shrink-0 rounded" />
          </div>

          {/* Location and salary */}
          <div className="mt-2 flex items-center gap-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-12" />
          </div>

          {/* Skills */}
          <div className="mt-2 flex gap-1">
            <Skeleton className="h-4 w-14 rounded-full" />
            <Skeleton className="h-4 w-16 rounded-full" />
            <Skeleton className="h-4 w-12 rounded-full" />
          </div>

          {/* Description preview */}
          <Skeleton className="mt-2 h-3 w-full" />
          <Skeleton className="mt-1 h-3 w-4/5" />

          {/* Tags row */}
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-4 w-14 rounded-full" />
              <Skeleton className="h-4 w-16 rounded-full" />
            </div>
            <Skeleton className="h-3 w-12" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Shows multiple skeleton cards for initial loading state.
 */
export function JobCardSkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }, (_, i) => (
        <JobCardSkeleton key={i} />
      ))}
    </div>
  );
}
