import { Skeleton } from "@ever-hust/ui/skeleton";

export default function ProfileLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <Skeleton className="h-40 w-full rounded-lg" />
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-32 w-full rounded-lg" />
      <Skeleton className="h-24 w-full rounded-lg" />
    </div>
  );
}
