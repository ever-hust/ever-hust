import Link from "next/link";
import { Button } from "@repo/ui/button";
import { MailX, ArrowLeft } from "lucide-react";

export default function InvitationNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <div className="rounded-full bg-muted p-4">
        <MailX className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      </div>
      <h1 className="mt-6 text-2xl font-bold">Invitation Not Found</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        This invitation link is invalid or has expired. Please ask the
        organization admin to send a new invitation.
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
