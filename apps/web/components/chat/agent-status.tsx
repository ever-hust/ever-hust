"use client";

import {
  Search,
  FileText,
  Heart,
  Bell,
  Briefcase,
  GraduationCap,
  User,
  SlidersHorizontal,
  BookOpen,
  ClipboardCheck,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@repo/ui/lib/utils";

/** Friendly labels and icons for each AI tool */
const TOOL_META: Record<
  string,
  { label: string; icon: React.ElementType; activeLabel: string }
> = {
  searchJobs: {
    label: "Search Jobs",
    icon: Search,
    activeLabel: "Searching jobs...",
  },
  updateFilters: {
    label: "Update Filters",
    icon: SlidersHorizontal,
    activeLabel: "Updating filters...",
  },
  favoriteJob: {
    label: "Favorite Job",
    icon: Heart,
    activeLabel: "Saving to favorites...",
  },
  getJobDetails: {
    label: "Job Details",
    icon: Briefcase,
    activeLabel: "Fetching job details...",
  },
  getUserProfile: {
    label: "Get Profile",
    icon: User,
    activeLabel: "Loading profile...",
  },
  savePreferences: {
    label: "Save Preferences",
    icon: SlidersHorizontal,
    activeLabel: "Saving preferences...",
  },
  generateCoverLetter: {
    label: "Cover Letter",
    icon: FileText,
    activeLabel: "Generating cover letter...",
  },
  createAlert: {
    label: "Create Alert",
    icon: Bell,
    activeLabel: "Setting up job alert...",
  },
  applyJob: {
    label: "Apply to Job",
    icon: Briefcase,
    activeLabel: "Preparing application...",
  },
  interviewPrep: {
    label: "Interview Prep",
    icon: GraduationCap,
    activeLabel: "Preparing interview guide...",
  },
  submitAnswers: {
    label: "Submit Answers",
    icon: ClipboardCheck,
    activeLabel: "Submitting answers...",
  },
};

const DEFAULT_META = {
  label: "Processing",
  icon: BookOpen,
  activeLabel: "Working...",
};

interface AgentStatusProps {
  toolName: string;
  state: "running" | "complete";
  className?: string;
}

export function AgentStatus({ toolName, state, className }: AgentStatusProps) {
  const meta = TOOL_META[toolName] ?? DEFAULT_META;
  const Icon = meta.icon;
  const isRunning = state === "running";

  return (
    <div
      className={cn(
        "my-1 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
        isRunning
          ? "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950"
          : "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950",
        className
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="font-medium">
        {isRunning ? meta.activeLabel : meta.label}
      </span>
      {isRunning ? (
        <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-yellow-600 dark:text-yellow-400" />
      ) : (
        <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-green-600 dark:text-green-400" />
      )}
    </div>
  );
}
