"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { MessageSquare, LayoutGrid } from "lucide-react";
import { cn } from "@repo/ui/lib/utils";

interface SplitScreenProps {
  chatPanel: React.ReactNode;
  canvasPanel: React.ReactNode;
  /** Number of jobs in the canvas (used for mobile tab badge) */
  jobCount?: number;
}

export function SplitScreen({ chatPanel, canvasPanel, jobCount }: SplitScreenProps) {
  const [activePanel, setActivePanel] = useState<"chat" | "canvas">("chat");
  const [hasNewJobs, setHasNewJobs] = useState(false);
  const prevJobCount = useRef(jobCount ?? 0);

  // Show notification dot on Jobs tab when new jobs arrive while viewing chat
  useEffect(() => {
    if (
      jobCount !== undefined &&
      jobCount > prevJobCount.current &&
      activePanel === "chat"
    ) {
      setHasNewJobs(true);
    }
    prevJobCount.current = jobCount ?? 0;
  }, [jobCount, activePanel]);

  const switchToCanvas = useCallback(() => {
    setActivePanel("canvas");
    setHasNewJobs(false);
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Mobile tab bar */}
      <div
        role="tablist"
        aria-label="Panel switcher"
        className="relative flex border-b md:hidden"
      >
        {/* Active tab indicator */}
        <div
          className="absolute bottom-0 h-0.5 bg-primary transition-transform duration-200 ease-out"
          style={{
            width: "50%",
            transform: activePanel === "chat" ? "translateX(0)" : "translateX(100%)",
          }}
        />

        <button
          type="button"
          role="tab"
          aria-selected={activePanel === "chat"}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors",
            activePanel === "chat"
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground/80"
          )}
          onClick={() => setActivePanel("chat")}
        >
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
          Chat
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activePanel === "canvas"}
          className={cn(
            "relative flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors",
            activePanel === "canvas"
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground/80"
          )}
          onClick={switchToCanvas}
        >
          <LayoutGrid className="h-4 w-4" aria-hidden="true" />
          Jobs
          {jobCount !== undefined && jobCount > 0 && (
            <span className="rounded-full bg-muted px-1.5 text-[10px] font-normal tabular-nums">
              {jobCount}
            </span>
          )}
          {hasNewJobs && (
            <span
              className="absolute right-4 top-2 h-2 w-2 animate-pulse rounded-full bg-primary"
              aria-label="New jobs available"
            />
          )}
        </button>
      </div>

      {/* Split panels */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat panel */}
        <div
          className={cn(
            "flex flex-col border-r",
            "md:w-[40%] lg:w-[38%]",
            activePanel === "chat" ? "flex w-full" : "hidden md:flex"
          )}
        >
          {chatPanel}
        </div>

        {/* Canvas panel */}
        <div
          className={cn(
            "flex flex-col",
            "md:flex-1",
            activePanel === "canvas" ? "flex w-full" : "hidden md:flex"
          )}
        >
          {canvasPanel}
        </div>
      </div>
    </div>
  );
}
