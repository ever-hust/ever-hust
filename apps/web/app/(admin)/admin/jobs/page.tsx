import { Briefcase } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@repo/ui/card";

export default function AdminJobsPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Jobs Management</h1>
        <p className="text-muted-foreground">
          Review and manage job listings across the platform.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" aria-hidden="true" />
            Coming Soon
          </CardTitle>
          <CardDescription>
            Job management features are under development. Check back soon for
            the ability to review, approve, and manage job listings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Planned features include: job approval workflows, bulk actions,
            featured job management, and content moderation tools.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
