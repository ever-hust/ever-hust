import { Linkedin, MessageCircle, Briefcase, ArrowRight } from "lucide-react";
import { Card } from "@repo/ui/card";

const steps = [
  {
    step: "1",
    title: "Sign in with LinkedIn",
    description:
      "One-click login with your LinkedIn account. We automatically extract your profile, skills, and experience.",
    icon: Linkedin,
  },
  {
    step: "2",
    title: "Chat with your AI assistant",
    description:
      "Tell the AI what you're looking for. It learns your preferences and searches across 25+ job boards in seconds.",
    icon: MessageCircle,
  },
  {
    step: "3",
    title: "Apply with confidence",
    description:
      "Review matching jobs, generate tailored cover letters, set up alerts, and let AI help you through the application process.",
    icon: Briefcase,
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="border-y bg-muted/30 px-4 py-24 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            How it works
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Three simple steps to transform your job search.
          </p>
        </div>

        <div className="mt-16 grid gap-8 sm:grid-cols-3 sm:gap-4">
          {steps.map((item, index) => (
            <div key={item.step} className="relative flex items-stretch">
              <Card className="flex w-full flex-col items-center p-6 text-center transition-shadow hover:shadow-md">
                {/* Step number circle */}
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground shadow-sm">
                  {item.step}
                </div>

                {/* Icon */}
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <item.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                </div>

                <h3 className="mb-2 text-lg font-semibold">{item.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              </Card>

              {/* Arrow connector between steps (desktop only) */}
              {index < steps.length - 1 && (
                <div
                  className="pointer-events-none absolute -right-4 top-1/2 z-10 hidden -translate-y-1/2 sm:block"
                  aria-hidden="true"
                >
                  <ArrowRight className="h-5 w-5 text-muted-foreground/40" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
