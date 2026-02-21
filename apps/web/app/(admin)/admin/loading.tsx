import { Skeleton } from "@ever-hust/ui/skeleton";

export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header skeleton */}
      <div>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>

      {/* Stats grid skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-6">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-5 rounded" />
            </div>
            <Skeleton className="mt-3 h-8 w-20" />
          </div>
        ))}
      </div>

      {/* Quick Actions + Recent Activity skeleton */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border bg-card">
          <div className="p-6 pb-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="mt-1 h-4 w-40" />
          </div>
          <div className="flex flex-col gap-3 p-6 pt-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-md" />
            ))}
          </div>
        </div>

        <div className="rounded-lg border bg-card">
          <div className="p-6 pb-2">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="mt-1 h-4 w-56" />
          </div>
          <div className="flex flex-col gap-3 p-6 pt-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="mb-1 h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
