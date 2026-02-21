"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Copy, Download, RefreshCw, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@ever-hust/ui/dialog";
import { Button } from "@ever-hust/ui/button";

/** Duration to show the "Copied!" feedback (ms). */
const COPY_FEEDBACK_MS = 2_000;

interface CoverLetterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coverLetter: string;
  jobTitle?: string;
  companyName?: string;
  onRegenerate?: (tone: string) => void;
}

export function CoverLetterModal({
  open,
  onOpenChange,
  coverLetter,
  jobTitle,
  companyName,
  onRegenerate,
}: CoverLetterModalProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up the feedback timer on unmount to prevent state-update-after-unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(coverLetter);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch {
      // clipboard API not available — fail silently
    }
  }, [coverLetter]);

  const handleDownload = () => {
    const blob = new Blob([coverLetter], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName = companyName?.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-") || "job";
    a.download = `cover-letter-${safeName}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Defer revocation so Safari can complete the async download before the
    // blob URL is invalidated (synchronous revocation produces empty files).
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Cover Letter</DialogTitle>
          <DialogDescription>
            {jobTitle && companyName
              ? `For ${jobTitle} at ${companyName}`
              : "Generated cover letter"}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-y-auto rounded-md border bg-muted/30 p-4">
          <div className="whitespace-pre-wrap text-sm leading-relaxed">
            {coverLetter}
          </div>
        </div>

        <DialogFooter className="flex-row gap-2 sm:gap-2">
          <Button variant="outline" size="sm" onClick={handleCopy}>
            {copied ? (
              <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Download
          </Button>
          {onRegenerate && (
            <div className="flex gap-1">
              {(
                [
                  "professional",
                  "conversational",
                  "enthusiastic",
                  "concise",
                ] as const
              ).map((tone) => (
                <Button
                  key={tone}
                  variant="ghost"
                  size="sm"
                  className="text-xs capitalize"
                  onClick={() => onRegenerate(tone)}
                >
                  <RefreshCw className="mr-1 h-3 w-3" aria-hidden="true" />
                  {tone}
                </Button>
              ))}
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
