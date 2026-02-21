import { Skeleton } from "@ever-hust/ui/skeleton";

export default function MarketingLoading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center" aria-busy="true" role="status" aria-label="Loading page">
      <span className="sr-only">Loading page...</span>
      <div className="w-full max-w-3xl space-y-6 px-4">
        <Skeleton className="mx-auto h-10 w-64" />
        <Skeleton className="mx-auto h-5 w-96" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    </div>
  );
}
