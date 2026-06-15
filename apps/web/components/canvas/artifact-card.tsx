"use client";

import { memo, useState } from "react";
import {
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  FileDown,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ever-hust/ui/card";
import { Badge } from "@ever-hust/ui/badge";
import { cn } from "@ever-hust/ui/lib/utils";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

/**
 * Generic structured-artifact card (spec #5 surface). Reflectively renders any of the advisory
 * tools' structured results (cover letter, résumé tailoring, negotiation, company brief, outreach,
 * interview prep, growth plan, application draft) on the canvas — surfacing the machine summary
 * visually instead of chat-only. Shape-agnostic, so new artifact tools render for free.
 */
export interface ArtifactView {
  title: string;
  subtitle?: string;
  data: Record<string, unknown>;
}

// Meta / control keys that shouldn't render as content sections.
const HIDDEN_KEYS = new Set([
  "drafted",
  "tailored",
  "briefed",
  "researched",
  "prepped",
  "advised",
  "evaluated",
  "captured",
  "updated",
  "jobId",
  "grounded",
  "flaggedClaims",
  "needsApproval",
  "gateId",
  "error",
  "jobTitle",
  "companyName",
  "schemaVersion",
  "kind",
  "contactType",
]);

function humanize(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/** Flatten a value to plain text for copy/export. */
function valueToText(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (isStringArray(value)) return value.map((v) => `- ${v}`).join("\n");
  if (Array.isArray(value)) {
    return value
      .map((v) =>
        v && typeof v === "object"
          ? Object.entries(v as Record<string, unknown>)
              .map(([k, val]) => `${humanize(k)}: ${typeof val === "object" ? JSON.stringify(val) : String(val)}`)
              .join("\n")
          : `- ${String(v)}`
      )
      .join("\n\n");
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, val]) => `${humanize(k)}: ${typeof val === "object" ? JSON.stringify(val) : String(val)}`)
      .join("\n");
  }
  return String(value);
}

/** Render the artifact as a copy-paste-ready Markdown-ish document (for export to Docs/Word → PDF). */
function artifactToText(view: ArtifactView): string {
  const lines: string[] = [`# ${view.title}`];
  if (view.subtitle) lines.push(view.subtitle);
  lines.push("");
  for (const [key, value] of Object.entries(view.data)) {
    if (
      HIDDEN_KEYS.has(key) ||
      value == null ||
      value === "" ||
      (Array.isArray(value) && value.length === 0)
    ) {
      continue;
    }
    lines.push(`## ${humanize(key)}`);
    lines.push(valueToText(value));
    lines.push("");
  }
  return lines.join("\n").trim();
}

function KeyValueBlock({ obj }: { obj: Record<string, unknown> }) {
  return (
    <div className="rounded-md border bg-muted/30 p-2 space-y-0.5">
      {Object.entries(obj).map(([k, v]) => (
        <div key={k} className="text-[11px]">
          <span className="font-medium text-foreground">{humanize(k)}:</span>{" "}
          <span className="text-muted-foreground">
            {typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)}
          </span>
        </div>
      ))}
    </div>
  );
}

function Value({ value }: { value: unknown }) {
  if (value == null || value === "") return null;
  if (typeof value === "string" || typeof value === "number") {
    return <p className="whitespace-pre-wrap text-xs text-muted-foreground">{String(value)}</p>;
  }
  if (isStringArray(value)) {
    if (value.length === 0) return null;
    return (
      <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
        {value.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    );
  }
  if (Array.isArray(value)) {
    return (
      <div className="space-y-1.5">
        {value.map((item, i) =>
          item && typeof item === "object" ? (
            <KeyValueBlock key={i} obj={item as Record<string, unknown>} />
          ) : (
            <p key={i} className="text-xs text-muted-foreground">
              {String(item)}
            </p>
          )
        )}
      </div>
    );
  }
  if (typeof value === "object") {
    return <KeyValueBlock obj={value as Record<string, unknown>} />;
  }
  return null;
}

interface ArtifactCardProps {
  artifact: ArtifactView;
  className?: string;
}

export const ArtifactCard = memo(function ArtifactCard({
  artifact,
  className,
}: ArtifactCardProps) {
  const { data } = artifact;
  const grounded = data.grounded as boolean | undefined;
  const flaggedClaims = (data.flaggedClaims as string[] | undefined) ?? [];
  const needsApproval = data.needsApproval as boolean | undefined;
  const { copied, copy } = useCopyToClipboard();
  const [downloading, setDownloading] = useState(false);

  const handleDownloadPdf = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await fetch("/api/documents/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: artifact.title,
          subtitle: artifact.subtitle,
          data: artifact.data,
        }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${artifact.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Network/render failure — leave the Copy fallback available.
    } finally {
      setDownloading(false);
    }
  };

  const sections = Object.entries(data).filter(
    ([key, value]) =>
      !HIDDEN_KEYS.has(key) && value != null && value !== "" &&
      !(Array.isArray(value) && value.length === 0)
  );

  return (
    <Card className={cn("max-w-lg", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            {artifact.title}
          </CardTitle>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => copy(artifactToText(artifact))}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={copied ? "Copied" : "Copy as text"}
            >
              {copied ? (
                <Check className="h-3 w-3 text-green-500" aria-hidden="true" />
              ) : (
                <Copy className="h-3 w-3" aria-hidden="true" />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              aria-label="Download PDF"
            >
              {downloading ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : (
                <FileDown className="h-3 w-3" aria-hidden="true" />
              )}
              PDF
            </button>
          </div>
        </div>
        {artifact.subtitle && <CardDescription>{artifact.subtitle}</CardDescription>}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {needsApproval && (
            <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600 dark:text-amber-400">
              Needs your approval — not sent
            </Badge>
          )}
          {grounded === true && (
            <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="mr-1 h-3 w-3" aria-hidden="true" />
              Grounded
            </Badge>
          )}
          {grounded === false && (
            <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" />
              Review flagged claims
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {sections.map(([key, value]) => (
          <div key={key} className="space-y-1 border-t pt-2 first:border-t-0 first:pt-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <CheckCircle2 className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
              {humanize(key)}
            </p>
            <Value value={value} />
          </div>
        ))}

        {flaggedClaims.length > 0 && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
            <p className="mb-1 text-[10px] font-medium uppercase text-amber-600 dark:text-amber-400">
              Unverified claims — confirm before using
            </p>
            <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
              {flaggedClaims.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
