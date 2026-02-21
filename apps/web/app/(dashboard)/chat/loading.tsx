import { Skeleton } from "@ever-hust/ui/skeleton";

export default function ChatLoading() {
  return (
    <div className="flex h-full">
      {/* Chat panel skeleton */}
      <div className="flex w-[40%] flex-col border-r p-4">
        <div className="flex-1 space-y-4">
          <Skeleton className="h-20 w-3/4" />
          <Skeleton className="ml-auto h-12 w-2/3" />
          <Skeleton className="h-16 w-3/4" />
        </div>
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
      {/* Canvas skeleton */}
      <div className="flex-1 p-3">
        <Skeleton className="h-8 w-full rounded-lg" />
        <div className="mt-3 space-y-2">
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
