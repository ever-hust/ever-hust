"use client";

import { useState, memo } from "react";
import { Button } from "@ever-hust/ui/button";
import { Card } from "@ever-hust/ui/card";
import { Badge } from "@ever-hust/ui/badge";
import { Check, X, Briefcase, Loader2 } from "lucide-react";

interface ToolApprovalProps {
  toolName: string;
  args: Record<string, unknown>;
  onApprove: () => void;
  onDeny: () => void;
}

function getToolDisplay(toolName: string, args: Record<string, unknown>) {
  switch (toolName) {
    case "applyJob":
      return {
        title: "Apply to Job",
        description: `The AI wants to initiate an application for job #${args.jobId}.`,
        icon: <Briefcase className="h-5 w-5" aria-hidden="true" />,
        details: args.coverLetter
          ? "A cover letter will be included with your application."
          : null,
      };
    default:
      return {
        title: `Confirm: ${toolName}`,
        description: "The AI wants to perform an action that requires your approval.",
        icon: <Briefcase className="h-5 w-5" aria-hidden="true" />,
        details: null,
      };
  }
}

export const ToolApproval = memo(function ToolApproval({
  toolName,
  args,
  onApprove,
  onDeny,
}: ToolApprovalProps) {
  const [decided, setDecided] = useState<"approved" | "denied" | null>(null);
  const [loading, setLoading] = useState(false);
  const display = getToolDisplay(toolName, args);

  const handleApprove = () => {
    setLoading(true);
    setDecided("approved");
    onApprove();
  };

  const handleDeny = () => {
    setDecided("denied");
    onDeny();
  };

  if (decided) {
    return (
      <Card className="my-2 border-border/50 p-3">
        <div className="flex items-center gap-2 text-sm">
          {display.icon}
          <span className="font-medium">{display.title}</span>
          <Badge
            variant={decided === "approved" ? "default" : "secondary"}
            className="ml-auto"
          >
            {decided === "approved" ? (
              <>
                <Check className="mr-1 h-3 w-3" aria-hidden="true" /> Approved
              </>
            ) : (
              <>
                <X className="mr-1 h-3 w-3" aria-hidden="true" /> Denied
              </>
            )}
          </Badge>
        </div>
      </Card>
    );
  }

  return (
    <Card className="my-2 border-primary/20 bg-primary/5 p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2">{display.icon}</div>
        <div className="flex-1">
          <p className="text-sm font-semibold">{display.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {display.description}
          </p>
          {display.details ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {display.details}
            </p>
          ) : null}
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={handleApprove} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="mr-1.5 h-3 w-3" aria-hidden="true" />
              )}
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDeny}
              disabled={loading}
            >
              <X className="mr-1.5 h-3 w-3" aria-hidden="true" />
              Deny
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
});
