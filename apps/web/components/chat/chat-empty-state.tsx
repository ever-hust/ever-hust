"use client";

import { memo } from "react";
import {
  Search,
  FileText,
  MessageSquare,
  Sparkles,
  MapPin,
  Briefcase,
  TrendingUp,
  GraduationCap,
} from "lucide-react";

interface ChatEmptyStateProps {
  onSuggestionClick: (text: string) => void;
}

interface SuggestionCategory {
  icon: React.ReactNode;
  title: string;
  color: string;
  suggestions: string[];
}

const CATEGORIES: SuggestionCategory[] = [
  {
    icon: <Search className="h-4 w-4" aria-hidden="true" />,
    title: "Job Search",
    color: "text-blue-500 bg-blue-500/10",
    suggestions: [
      "Find me remote React developer jobs",
      "Show me senior engineering roles in NYC",
      "Search for product manager positions paying over $150k",
    ],
  },
  {
    icon: <FileText className="h-4 w-4" aria-hidden="true" />,
    title: "Cover Letters",
    color: "text-emerald-500 bg-emerald-500/10",
    suggestions: [
      "Write a cover letter for a frontend developer role",
      "Help me tailor my cover letter for a startup",
      "Generate a cover letter highlighting my AI experience",
    ],
  },
  {
    icon: <TrendingUp className="h-4 w-4" aria-hidden="true" />,
    title: "Career Advice",
    color: "text-amber-500 bg-amber-500/10",
    suggestions: [
      "What skills are most in-demand for software engineers?",
      "How should I prepare for a system design interview?",
      "Review my resume and suggest improvements",
    ],
  },
  {
    icon: <GraduationCap className="h-4 w-4" aria-hidden="true" />,
    title: "Interview Prep",
    color: "text-purple-500 bg-purple-500/10",
    suggestions: [
      "Help me prepare for a React technical interview",
      "What behavioral questions should I expect?",
      "Practice common data structures questions with me",
    ],
  },
];

const QUICK_PROMPTS = [
  { icon: <MapPin className="h-3.5 w-3.5" aria-hidden="true" />, text: "Remote jobs in my field" },
  { icon: <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />, text: "Jobs matching my profile" },
  { icon: <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />, text: "AI/ML job opportunities" },
  { icon: <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />, text: "Help me with my job search" },
];

function ChatEmptyStateInner({ onSuggestionClick }: ChatEmptyStateProps) {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-6">
        {/* Greeting */}
        <div className="text-center">
          <h2 className="text-2xl font-bold">
            Welcome to Ever Jobs{" "}
            <span role="img" aria-label="wave">
              👋
            </span>
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your AI-powered job search assistant. Ask me anything about finding jobs,
            writing cover letters, or preparing for interviews.
          </p>
        </div>

        {/* Quick prompts row */}
        <div className="flex flex-wrap justify-center gap-2">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt.text}
              type="button"
              className="flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs transition-colors hover:bg-accent hover:border-accent-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onSuggestionClick(prompt.text)}
            >
              {prompt.icon}
              {prompt.text}
            </button>
          ))}
        </div>

        {/* Category cards - 2x2 grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CATEGORIES.map((category) => (
            <div
              key={category.title}
              className="rounded-lg border bg-card p-3 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-md ${category.color}`}
                >
                  {category.icon}
                </div>
                <h3 className="text-xs font-semibold">{category.title}</h3>
              </div>
              <div className="space-y-1">
                {category.suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onSuggestionClick(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Keyboard shortcut hint */}
        <p className="text-center text-[10px] text-muted-foreground/60">
          Press{" "}
          <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">
            /
          </kbd>{" "}
          to focus the input &middot; Type your question and press Enter
        </p>
      </div>
    </div>
  );
}

export const ChatEmptyState = memo(ChatEmptyStateInner);
