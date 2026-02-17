"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@repo/ui/button";
import { Badge } from "@repo/ui/badge";
import {
  ArrowRight,
  Sparkles,
  Search,
  FileText,
  MessageSquare,
  Bot,
} from "lucide-react";

const CHAT_LINES = [
  { role: "user" as const, text: "Find me senior React jobs in San Francisco" },
  {
    role: "assistant" as const,
    text: "Found 23 matching positions. Here are the top 3:",
  },
  { role: "user" as const, text: "Write a cover letter for the Stripe role" },
  {
    role: "assistant" as const,
    text: "Here's a personalized cover letter highlighting your experience…",
  },
];

const STATS = [
  { label: "Job Boards", value: "50+" },
  { label: "Jobs Indexed", value: "2M+" },
  { label: "Cover Letters", value: "100K+" },
];

/** Delay before the first chat line appears (ms). */
const INITIAL_LINE_DELAY_MS = 800;
/** Delay between subsequent chat lines (ms). */
const SUBSEQUENT_LINE_DELAY_MS = 1_200;

export function Hero() {
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    if (visibleLines >= CHAT_LINES.length) return;
    const timer = setTimeout(
      () => setVisibleLines((v) => v + 1),
      visibleLines === 0 ? INITIAL_LINE_DELAY_MS : SUBSEQUENT_LINE_DELAY_MS
    );
    return () => clearTimeout(timer);
  }, [visibleLines]);

  return (
    <section className="relative overflow-hidden px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-32">
      {/* Background gradients */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/4 h-[300px] w-[90vw] max-w-[800px] rounded-full bg-primary/10 blur-3xl sm:h-[600px]" />
        <div className="absolute right-0 top-1/2 -translate-y-1/2 h-[200px] w-[60vw] max-w-[400px] rounded-full bg-primary/5 blur-3xl sm:h-[400px]" />
      </div>

      <div className="mx-auto max-w-7xl">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left column: Text content */}
          <div className="text-center lg:text-left">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-background px-4 py-1.5 text-sm font-medium text-muted-foreground shadow-sm">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
              <span>AI-Powered Job Search</span>
            </div>

            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Your AI-Powered{" "}
              <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                Job Search Assistant
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl lg:mx-0">
              Chat with AI to find jobs across 50+ boards, generate personalized
              cover letters, and get interview prep — all through natural
              conversation.
            </p>

            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center lg:justify-start">
              <Link href="/login">
                <Button size="lg" className="gap-2 shadow-md">
                  Start Free <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </Link>
              <Link href="#how-it-works">
                <Button variant="outline" size="lg">
                  See How It Works
                </Button>
              </Link>
            </div>

            <p className="mt-4 text-sm text-muted-foreground">
              Free to start. No credit card required.
            </p>

            {/* Stats row */}
            <div className="mt-10 flex items-center justify-center gap-8 lg:justify-start">
              {STATS.map((stat) => (
                <div key={stat.label} className="text-center">
                  <p className="text-2xl font-bold tracking-tight sm:text-3xl">
                    {stat.value}
                  </p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right column: Mock chat preview */}
          <div className="mx-auto w-full max-w-md lg:mx-0 lg:max-w-none">
            <div className="relative rounded-xl border bg-background/80 shadow-2xl backdrop-blur-sm">
              {/* Chat header */}
              <div className="flex items-center gap-3 border-b px-5 py-3.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-4 w-4 text-primary" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Ever Jobs AI</p>
                  <p className="text-[11px] text-muted-foreground">
                    Your personal job search assistant
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-green-500" aria-hidden="true" />
                  <span className="text-[11px] text-muted-foreground">
                    Online
                  </span>
                </div>
              </div>

              {/* Chat messages */}
              <div className="space-y-3 p-4 sm:p-5" style={{ minHeight: 220 }}>
                {CHAT_LINES.slice(0, visibleLines).map((line, i) => (
                  <div
                    key={i}
                    className={`flex transition-all duration-300 ${line.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                        line.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      {line.text}
                    </div>
                  </div>
                ))}

                {/* Typing indicator */}
                {visibleLines < CHAT_LINES.length && visibleLines > 0 && (
                  <div className="flex justify-start">
                    <div className="flex gap-1.5 rounded-xl bg-muted px-4 py-3">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:0ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:150ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:300ms]" />
                    </div>
                  </div>
                )}
              </div>

              {/* Mock input */}
              <div className="border-t px-4 py-3">
                <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                  <span className="flex-1 text-sm text-muted-foreground/60">
                    Ask about jobs, cover letters, interviews...
                  </span>
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
                    <ArrowRight className="h-3.5 w-3.5 text-primary-foreground" aria-hidden="true" />
                  </div>
                </div>
              </div>
            </div>

            {/* Feature pills below the chat */}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <Badge variant="secondary" className="gap-1.5 px-3 py-1">
                <Search className="h-3 w-3" aria-hidden="true" />
                Job Search
              </Badge>
              <Badge variant="secondary" className="gap-1.5 px-3 py-1">
                <FileText className="h-3 w-3" aria-hidden="true" />
                Cover Letters
              </Badge>
              <Badge variant="secondary" className="gap-1.5 px-3 py-1">
                <MessageSquare className="h-3 w-3" aria-hidden="true" />
                Interview Prep
              </Badge>
            </div>
          </div>
        </div>
      </div>

    </section>
  );
}
