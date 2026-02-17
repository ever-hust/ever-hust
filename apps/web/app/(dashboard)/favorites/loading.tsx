import { Skeleton } from "@repo/ui/skeleton";

export default function FavoritesLoading() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b px-4 py-4 sm:px-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-1 h-4 w-72" />
      </div>
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="rounded-lg border p-4">
              <div className="flex items-start gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                    <Skeleton className="h-5 w-14 rounded-full" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
