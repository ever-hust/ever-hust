import { Skeleton } from "@repo/ui/skeleton";

export default function JobDetailLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* Header */}
      <div className="space-y-3">
        <Skeleton className="h-8 w-3/4 rounded-lg" />
        <Skeleton className="h-5 w-1/2 rounded-lg" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      </div>

      {/* Company Info */}
      <div className="flex items-center gap-4">
        <Skeleton className="h-12 w-12 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-40 rounded-lg" />
          <Skeleton className="h-4 w-32 rounded-lg" />
        </div>
      </div>

      {/* Salary & Details */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
      </div>

      {/* Description */}
      <div className="space-y-3">
        <Skeleton className="h-6 w-40 rounded-lg" />
        <Skeleton className="h-4 w-full rounded-lg" />
        <Skeleton className="h-4 w-full rounded-lg" />
        <Skeleton className="h-4 w-5/6 rounded-lg" />
        <Skeleton className="h-4 w-full rounded-lg" />
        <Skeleton className="h-4 w-4/5 rounded-lg" />
        <Skeleton className="h-4 w-full rounded-lg" />
        <Skeleton className="h-4 w-3/4 rounded-lg" />
      </div>

      {/* Skills */}
      <div className="space-y-3">
        <Skeleton className="h-6 w-24 rounded-lg" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-7 w-16 rounded-full" />
          <Skeleton className="h-7 w-20 rounded-full" />
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-7 w-14 rounded-full" />
          <Skeleton className="h-7 w-18 rounded-full" />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Skeleton className="h-10 w-32 rounded-lg" />
        <Skeleton className="h-10 w-36 rounded-lg" />
      </div>
    </div>
  );
}
