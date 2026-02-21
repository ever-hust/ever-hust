"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@repo/ui/card";
import { Badge } from "@repo/ui/badge";
import { Separator } from "@repo/ui/separator";
import { Check, Loader2, Shield, Zap, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { safeExternalUrl } from "@/lib/safe-url";

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

const FAQ_ITEMS = [
  {
    q: "Can I cancel anytime?",
    a: "Yes, you can cancel your subscription at any time. You'll continue to have access until the end of your billing period.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes! All paid plans come with a 7-day free trial. No credit card required to start.",
  },
  {
    q: "What happens when I hit the free plan limits?",
    a: "You'll see a friendly upgrade prompt. Your data and saved jobs are never lost — just upgrade to continue where you left off.",
  },
  {
    q: "Can I bring my own API key?",
    a: "Absolutely. Pro users can bring their own Anthropic, OpenAI, or Google AI keys in Settings to use their preferred models.",
  },
  {
    q: "Do you store my data securely?",
    a: "Yes. All data is encrypted at rest and in transit. API keys are encrypted with AES-256. We never sell your data.",
  },
];

function FAQItem({ q, a, id }: { q: string; a: string; id: string }) {
  const [open, setOpen] = useState(false);
  const answerId = `faq-answer-${id}`;

  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        id={`faq-q-${id}`}
        className="flex w-full items-center justify-between rounded-md py-4 text-left text-sm font-medium transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={answerId}
      >
        {q}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      <p
        id={answerId}
        role="region"
        aria-labelledby={`faq-q-${id}`}
        hidden={!open}
        className="pb-4 text-sm text-muted-foreground leading-relaxed"
      >
        {a}
      </p>
    </div>
  );
}

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
        const safeUrl = safeExternalUrl(data.url);
        if (safeUrl) {
          window.location.href = safeUrl;
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
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="outline" className="mb-4">
            <Zap className="mr-1 h-3 w-3" aria-hidden="true" />
            Simple Pricing
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Simple, transparent pricing
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Start free, upgrade when you need more power. No hidden fees.
          </p>
        </div>

        {/* Pricing cards */}
        <div className="mx-auto mt-16 grid max-w-5xl gap-6 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              className={`transition-all duration-200 hover:shadow-md ${
                plan.popular
                  ? "relative border-primary shadow-lg scale-[1.02]"
                  : "border-border/50"
              }`}
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
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
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
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    {plan.cta}
                  </Button>
                ) : (
                  <Button variant={plan.variant} className="block w-full" asChild>
                    <Link href="/login">
                      {plan.cta}
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Trust badges */}
        <div className="mx-auto mt-12 flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Shield className="h-4 w-4 text-primary" aria-hidden="true" />
            7-day free trial
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-4 w-4 text-primary" aria-hidden="true" />
            Cancel anytime
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Shield className="h-4 w-4 text-primary" aria-hidden="true" />
            Secure payments via Stripe
          </span>
        </div>

        {/* FAQ Section */}
        <div className="mx-auto mt-24 max-w-2xl">
          <h3 className="text-center text-2xl font-bold tracking-tight">
            Frequently Asked Questions
          </h3>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Everything you need to know about our pricing and plans.
          </p>

          <Separator className="my-8" />

          <div>
            {FAQ_ITEMS.map((item, index) => (
              <FAQItem key={item.q} q={item.q} a={item.a} id={String(index)} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
