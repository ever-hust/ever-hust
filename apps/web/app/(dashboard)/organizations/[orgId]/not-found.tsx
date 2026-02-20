import Link from "next/link";
import { Button } from "@repo/ui/button";
import { Building2, ArrowLeft } from "lucide-react";

export default function OrganizationNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <div className="rounded-full bg-muted p-4">
        <Building2 className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      </div>
      <h1 className="mt-6 text-2xl font-bold">Organization Not Found</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        This organization doesn&apos;t exist or you don&apos;t have access to it.
        It may have been deleted or you may need an invitation.
      </p>
      <Button variant="outline" className="mt-6 gap-2" asChild>
        <Link href="/organizations">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Organizations
        </Link>
      </Button>
    </div>
  );
}
