import Link from "next/link";
import { Button } from "@repo/ui/button";
import { BriefcaseBusiness } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <BriefcaseBusiness className="h-12 w-12 text-muted-foreground" />
      <h1 className="mt-6 text-4xl font-bold">404</h1>
      <p className="mt-2 text-lg text-muted-foreground">
        Page not found
      </p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <div className="mt-6 flex gap-3">
        <Link href="/">
          <Button>Go Home</Button>
        </Link>
        <Link href="/chat">
          <Button variant="outline">Go to Dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
