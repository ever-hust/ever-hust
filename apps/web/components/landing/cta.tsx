import Link from "next/link";
import { Button } from "@repo/ui/button";
import { ArrowRight } from "lucide-react";

export function CTA() {
  return (
    <section className="px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Ready to transform your job search?
        </h2>
        <p className="mt-4 text-lg text-muted-foreground">
          Join thousands of job seekers who are landing their dream jobs with
          AI-powered assistance.
        </p>
        <div className="mt-8">
          <Link href="/login">
            <Button size="lg" className="gap-2">
              Get Started for Free <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
