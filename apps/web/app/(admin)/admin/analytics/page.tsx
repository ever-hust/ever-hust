import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@repo/ui/card";

export default function AdminAnalyticsPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">
          Platform usage metrics and business intelligence.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" aria-hidden="true" />
            Coming Soon
          </CardTitle>
          <CardDescription>
            Analytics features are under development. Check back soon for
            detailed platform insights.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Planned features include: user engagement metrics, AI usage
            analytics, job search trends, conversion funnels, and revenue
            dashboards.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
