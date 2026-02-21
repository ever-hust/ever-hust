import { Skeleton } from "@ever-hust/ui/skeleton";

export default function OrganizationsLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <Skeleton className="h-12 w-56" />
      <Skeleton className="h-32 w-full rounded-lg" />
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  );
}
