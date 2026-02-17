import { Skeleton } from "@repo/ui/skeleton";

/**
 * Dashboard loading skeleton.
 * Shows while dashboard pages are loading via Next.js streaming/suspense.
 */
export default function DashboardLoading() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden" aria-busy="true" role="status" aria-label="Loading page">
      <span className="sr-only">Loading page...</span>

      {/* Header skeleton */}
      <div className="border-b px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-md" />
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      </div>

      {/* Content skeleton */}
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-16 w-3/4 rounded-lg" />
      </div>
    </div>
  );
}
