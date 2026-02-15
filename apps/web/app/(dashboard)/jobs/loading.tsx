import { Skeleton } from "@repo/ui/skeleton";

export default function JobsLoading() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-3">
        <Skeleton className="h-8 w-full rounded-lg" />
      </div>
      <div className="flex-1 p-3">
        <div className="space-y-2">
          <Skeleton className="h-36 w-full rounded-lg" />
          <Skeleton className="h-36 w-full rounded-lg" />
          <Skeleton className="h-36 w-full rounded-lg" />
          <Skeleton className="h-36 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
