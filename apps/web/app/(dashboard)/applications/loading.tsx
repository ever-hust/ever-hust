import { Skeleton } from "@ever-hust/ui/skeleton";

export default function ApplicationsLoading() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b px-4 py-4 sm:px-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-1 h-4 w-72" />
        <div className="mt-4 flex gap-3">
          <Skeleton className="h-12 w-16 rounded-md" />
          <Skeleton className="h-12 w-16 rounded-md" />
          <Skeleton className="h-12 w-16 rounded-md" />
          <Skeleton className="h-12 w-16 rounded-md" />
        </div>
        <div className="mt-4 flex gap-1">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-7 w-16 rounded-md" />
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
