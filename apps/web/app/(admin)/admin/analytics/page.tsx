import dynamic from "next/dynamic";
import { Skeleton } from "@repo/ui/skeleton";

/**
 * Dynamically import the analytics dashboard to keep the heavy recharts
 * library out of the initial admin bundle. Admin analytics is a low-traffic
 * page, so deferring the ~50KB+ charting code until navigation time is a
 * clear win for the rest of the admin routes.
 */
const AnalyticsDashboard = dynamic(
  () => import("@/components/admin/analytics-dashboard"),
  {
    loading: () => (
      <div className="flex flex-col gap-6 p-6">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px] w-full rounded-lg" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-[380px] w-full rounded-lg" />
          <Skeleton className="h-[380px] w-full rounded-lg" />
        </div>
      </div>
    ),
  },
);

export default function AdminAnalyticsPage() {
  return <AnalyticsDashboard />;
}
