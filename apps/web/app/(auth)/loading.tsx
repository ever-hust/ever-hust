import { Skeleton } from "@ever-hust/ui/skeleton";

export default function AuthLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" aria-busy="true" role="status" aria-label="Loading page">
      <span className="sr-only">Loading page...</span>
      <div className="w-full max-w-md space-y-6 p-6">
        <Skeleton className="mx-auto h-12 w-48" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </div>
  );
}
