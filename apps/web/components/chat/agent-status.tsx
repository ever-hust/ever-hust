"use client";

import { cn } from "@repo/ui/lib/utils";
import {
  Search,
  FileText,
  Heart,
  Briefcase,
  User,
  Settings,
  Bell,
  BookOpen,
  ClipboardCheck,
  Loader2,
  CheckCircle2,
} from "lucide-react";

/** Maps AI tool names to user-friendly labels and icons. */
const TOOL_META: Record<
  string,
  { label: string; icon: React.ElementType }
> = {
  searchJobs: { label: "Searching jobs", icon: Search },
  updateFilters: { label: "Updating filters", icon: Settings },
  favoriteJob: { label: "Updating favorites", icon: Heart },
  getJobDetails: { label: "Loading job details", icon: FileText },
  getUserProfile: { label: "Loading your profile", icon: User },
  savePreferences: { label: "Saving preferences", icon: Settings },
  generateCoverLetter: { label: "Writing cover letter", icon: FileText },
  createAlert: { label: "Creating job alert", icon: Bell },
  applyJob: { label: "Starting application", icon: Briefcase },
  submitAnswers: { label: "Submitting answers", icon: ClipboardCheck },
  interviewPrep: { label: "Preparing interview tips", icon: BookOpen },
};

export type AgentState = "idle" | "thinking" | "tool-running" | "done";

interface AgentStatusProps {
  /** Current agent state. */
  state: AgentState;
  /** Name of the tool currently executing (only when state === "tool-running"). */
  activeToolName?: string;
  /** Additional CSS classes. */
  className?: string;
}

/**
 * Compact status indicator that shows what the AI agent is currently doing.
 * Renders inline within the chat, typically above the input area.
 */
export function AgentStatus({
  state,
  activeToolName,
  className,
}: AgentStatusProps) {
  if (state === "idle") return null;

  const meta = activeToolName ? TOOL_META[activeToolName] : undefined;
  const Icon = meta?.icon ?? Loader2;
  const label =
    state === "tool-running"
      ? meta?.label ?? `Running ${activeToolName}`
      : state === "thinking"
        ? "Thinking…"
        : "Done";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-2 px-4 py-1.5 text-xs text-muted-foreground",
        className
      )}
    >
      {state === "done" ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" aria-hidden="true" />
      ) : (
        <Icon className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      )}
      <span>{label}</span>
      {state === "tool-running" && (
        <span className="ml-auto flex gap-0.5">
          <span className="h-1 w-1 animate-pulse rounded-full bg-muted-foreground/50" />
          <span className="h-1 w-1 animate-pulse rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
          <span className="h-1 w-1 animate-pulse rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
        </span>
      )}
    </div>
  );
}
