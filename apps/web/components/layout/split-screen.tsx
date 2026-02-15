"use client";

import { useState } from "react";
import { MessageSquare, LayoutGrid } from "lucide-react";
import { Button } from "@repo/ui/button";
import { cn } from "@repo/ui/lib/utils";

interface SplitScreenProps {
  chatPanel: React.ReactNode;
  canvasPanel: React.ReactNode;
}

export function SplitScreen({ chatPanel, canvasPanel }: SplitScreenProps) {
  const [activePanel, setActivePanel] = useState<"chat" | "canvas">("chat");

  return (
    <div className="flex h-full flex-col">
      {/* Mobile toggle */}
      <div role="tablist" aria-label="Panel switcher" className="flex border-b p-1 md:hidden">
        <Button
          role="tab"
          aria-selected={activePanel === "chat"}
          variant={activePanel === "chat" ? "secondary" : "ghost"}
          size="sm"
          className="flex-1 gap-2"
          onClick={() => setActivePanel("chat")}
        >
          <MessageSquare className="h-4 w-4" />
          Chat
        </Button>
        <Button
          role="tab"
          aria-selected={activePanel === "canvas"}
          variant={activePanel === "canvas" ? "secondary" : "ghost"}
          size="sm"
          className="flex-1 gap-2"
          onClick={() => setActivePanel("canvas")}
        >
          <LayoutGrid className="h-4 w-4" />
          Jobs
        </Button>
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
