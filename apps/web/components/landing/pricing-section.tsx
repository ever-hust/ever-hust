"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@repo/ui/card";
import { Badge } from "@repo/ui/badge";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Try Ever Jobs with basic features",
    features: [
      "10 AI messages per day",
      "5 job searches per day",
      "1 cover letter per week",
      "Basic job browsing",
    ],
    cta: "Get Started",
    variant: "outline" as const,
    planId: null,
  },
  {
    name: "Quarterly",
    price: "$12",
    period: "/mo",
    billed: "Billed $36 every 3 months",
    description: "Best value for active job seekers",
    features: [
      "Unlimited AI conversations",
      "Unlimited job searches",
      "Unlimited cover letters",
      "Job alerts (daily, weekly)",
      "Application agent",
      "Interview prep agent",
      "40% savings vs monthly",
    ],
    cta: "Start Free Trial",
    variant: "default" as const,
    popular: true,
    planId: "quarterly",
  },
  {
    name: "Annual",
    price: "$7",
    period: "/mo",
    billed: "Billed $84 per year",
    description: "Maximum savings for committed seekers",
    features: [
      "Everything in Quarterly",
      "65% savings vs monthly",
      "Early access to new features",
      "Priority support",
    ],
    cta: "Start Free Trial",
    variant: "outline" as const,
    planId: "annual",
  },
];

export function PricingSection() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  async function handleSubscribe(planId: string) {
    setLoadingPlan(planId);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      if (res.ok) {
        const data = (await res.json()) as { url: string };
        if (data.url) {
          window.location.href = data.url;
          return;
        }
      }
      toast.error("Failed to start checkout. Please try again.");
    } catch {
      toast.error("Failed to start checkout. Please try again.");
    }
    setLoadingPlan(null);
  }

  return (
    <section id="pricing" className="px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Simple, transparent pricing
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Start free, upgrade when you need more power.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-5xl gap-6 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              className={
                plan.popular
                  ? "relative border-primary shadow-lg"
                  : "border-border/50"
              }
            >
              {plan.popular ? (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge>Most Popular</Badge>
                </div>
              ) : null}
              <CardHeader className="pt-8">
                <CardTitle className="text-lg">{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground">{plan.period}</span>
                </div>
                {plan.billed ? (
                  <p className="text-xs text-muted-foreground">{plan.billed}</p>
                ) : null}
              </CardHeader>
              <CardContent>
                <ul className="mb-6 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
                {plan.planId ? (
                  <Button
                    variant={plan.variant}
                    className="w-full"
                    disabled={loadingPlan === plan.planId}
                    onClick={() => handleSubscribe(plan.planId!)}
                  >
                    {loadingPlan === plan.planId ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : null}
                    {plan.cta}
                  </Button>
                ) : (
                  <Link href="/login" className="block">
                    <Button variant={plan.variant} className="w-full">
                      {plan.cta}
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
