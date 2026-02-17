import Link from "next/link";
import { Button } from "@repo/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";

export function CTA() {
  return (
    <section className="relative overflow-hidden px-4 py-24 sm:px-6 lg:px-8">
      {/* Background gradient */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1/4 h-[400px] w-[600px] rounded-full bg-primary/8 blur-3xl" />
      </div>

      <div className="mx-auto max-w-3xl text-center">
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Sparkles className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>

        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Ready to transform your job search?
        </h2>
        <p className="mt-4 text-lg text-muted-foreground">
          Join thousands of job seekers who are landing their dream jobs with
          AI-powered assistance.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link href="/login">
            <Button size="lg" className="gap-2 shadow-md">
              Get Started for Free <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </Link>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          No credit card required. Start finding jobs in under 60 seconds.
        </p>
      </div>
    </section>
  );
}
