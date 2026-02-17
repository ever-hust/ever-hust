import { Skeleton } from "@repo/ui/skeleton";

export default function JobDetailLoading() {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Back navigation skeleton */}
        <Skeleton className="mb-6 h-5 w-28" />

        {/* Header skeleton */}
        <div className="mb-6">
          <div className="flex items-start gap-4">
            <Skeleton className="h-14 w-14 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-8 w-2/3" />
              <div className="mt-2 flex gap-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
              </div>
              <div className="mt-3 flex gap-2">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-28 rounded-full" />
              </div>
            </div>
          </div>
        </div>

        {/* Action buttons skeleton */}
        <div className="mb-6 flex gap-3">
          <Skeleton className="h-10 w-36 rounded-md" />
          <Skeleton className="h-10 w-44 rounded-md" />
          <Skeleton className="h-10 w-10 rounded-md" />
        </div>

        <Skeleton className="mb-6 h-px w-full" />

        {/* Content grid skeleton */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Description column */}
          <div className="space-y-6 lg:col-span-2">
            <div className="rounded-lg border p-6">
              <Skeleton className="mb-4 h-6 w-36" />
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>

            <div className="rounded-lg border p-6">
              <Skeleton className="mb-4 h-6 w-40" />
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-7 w-20 rounded-full" />
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar column */}
          <div className="space-y-6">
            <div className="rounded-lg border p-6">
              <Skeleton className="mb-4 h-6 w-28" />
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <Skeleton className="h-4 w-4 shrink-0" />
                    <div className="flex-1">
                      <Skeleton className="mb-1 h-3 w-20" />
                      <Skeleton className="h-4 w-28" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border p-6">
              <Skeleton className="mb-4 h-6 w-32" />
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-md" />
                  <div>
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="mt-1 h-3 w-24" />
                  </div>
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>

            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}
