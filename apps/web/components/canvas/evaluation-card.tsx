"use client";

import { memo, useState } from "react";
import {
  Target,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Gauge,
  ListChecks,
  TrendingUp,
  DollarSign,
  Wand2,
  MessageSquareQuote,
  ShieldCheck,
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

// ---------------------------------------------------------------------------
// Types – mirror the evaluateJob tool result (EvaluationSummary + job labels)
// ---------------------------------------------------------------------------

export type EvaluationBand =
  | "apply_now"
  | "worth_it"
  | "specific_reason"
  | "not_recommended";

export interface EvaluationDimensionView {
  key: string;
  weight: number;
  score5: number;
  rationale: string;
  source: "deterministic" | "llm";
}

export interface EvaluationView {
  jobId: number;
  jobTitle: string;
  companyName: string | null;
  score: number; // 0–100
  score5: number; // 1–5
  band: EvaluationBand;
  jobFamily: string;
  archetype: string;
  dimensions: EvaluationDimensionView[];
  blocks: {
    roleSummary: string;
    cvMatch: {
      evidence: { requirement: string; cvEvidence: string; met: boolean }[];
      gaps: string[];
    };
    levelStrategy: string;
    compDemand: {
      summary: string;
      budgetFit: "good_fit" | "under_budget" | "over_budget" | "unknown";
    };
    customization: string;
    interviewPlan?: { theme: string; starSeed: string }[];
    // Block G — posting legitimacy (spec #7), orthogonal to the fit score.
    legitimacy?: {
      level: "verified" | "likely" | "uncertain";
      reasons: string[];
      note: string;
    };
  };
  recommendation: string;
}

const LEGITIMACY_META: Record<
  "verified" | "likely" | "uncertain",
  { label: string; pill: string }
> = {
  verified: {
    label: "Verified posting",
    pill: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  },
  likely: {
    label: "Likely legitimate",
    pill: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
  },
  uncertain: {
    label: "Verify before applying",
    pill: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
  },
};

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

const DIMENSION_LABELS: Record<string, string> = {
  north_star: "North Star",
  cv_match: "CV match",
  level: "Level",
  comp: "Comp",
  growth: "Growth",
  remote: "Remote",
  reputation: "Reputation",
  tech: "Tech",
  speed: "Speed",
  culture: "Culture",
};

function dimensionLabel(key: string): string {
  return (
    DIMENSION_LABELS[key] ??
    key
      .split(/[\s_-]+/)
      .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
      .join(" ")
  );
}

const BAND_META: Record<
  EvaluationBand,
  { label: string; pill: string }
> = {
  apply_now: {
    label: "Apply now",
    pill: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  },
  worth_it: {
    label: "Worth it",
    pill: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
  },
  specific_reason: {
    label: "For a specific reason",
    pill: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  },
  not_recommended: {
    label: "Skip — here's why",
    pill: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
  },
};

/** Score colour by the spec's bands: green ≥80, amber 60–79, grey <60. */
function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

function scoreRing(score: number): string {
  if (score >= 80) return "border-emerald-500/40 bg-emerald-500/5";
  if (score >= 60) return "border-amber-500/40 bg-amber-500/5";
  return "border-muted bg-muted/30";
}

const BUDGET_FIT_LABEL: Record<string, string> = {
  good_fit: "Good fit",
  under_budget: "Under budget",
  over_budget: "Above budget",
  unknown: "Unknown",
};

/** Five-dot 1–5 score indicator. */
const ScoreDots = memo(function ScoreDots({ score5 }: { score5: number }) {
  const filled = Math.round(score5);
  return (
    <span className="inline-flex gap-0.5" aria-label={`${score5} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            n <= filled ? "bg-primary" : "bg-muted-foreground/30"
          )}
        />
      ))}
    </span>
  );
});

function Section({
  title,
  icon: Icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t pt-3">
      <button
        type="button"
        className="flex w-full items-center justify-between text-sm font-medium text-foreground hover:text-foreground/80 transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setOpen((p) => !p)}
        aria-expanded={open}
        aria-label={`Toggle ${title} section`}
      >
        <span className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          {title}
        </span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        )}
      </button>
      {open && <div className="mt-3 space-y-3">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface EvaluationCardProps {
  data: EvaluationView;
  className?: string;
}

export const EvaluationCard = memo(function EvaluationCard({
  data,
  className,
}: EvaluationCardProps) {
  const band = BAND_META[data.band];
  const isSkip = data.band === "not_recommended";

  return (
    <Card className={cn("max-w-lg", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4 text-primary" aria-hidden="true" />
          Job Fit: {data.jobTitle}
        </CardTitle>
        <CardDescription>
          {[data.companyName, `${data.jobFamily} · ${data.archetype}`]
            .filter(Boolean)
            .join(" • ")}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Score + band */}
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-2",
              scoreRing(data.score)
            )}
          >
            <span className={cn("text-xl font-bold leading-none", scoreColor(data.score))}>
              {data.score}
            </span>
            <span className="text-[9px] text-muted-foreground">/ 100</span>
          </div>
          <div className="min-w-0 space-y-1">
            <Badge variant="outline" className={cn("text-xs", band.pill)}>
              {band.label}
            </Badge>
            <p
              className={cn(
                "text-sm",
                isSkip ? "text-red-600 dark:text-red-400" : "text-foreground"
              )}
            >
              {data.recommendation}
            </p>
          </div>
        </div>

        {/* Dimension breakdown */}
        <Section title="Score breakdown" icon={Gauge} defaultOpen>
          <div className="space-y-2">
            {data.dimensions.map((dim) => (
              <div key={dim.key} className="space-y-0.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    {dimensionLabel(dim.key)}
                    <span className="text-[10px] text-muted-foreground">
                      {Math.round(dim.weight)}%
                    </span>
                  </span>
                  <ScoreDots score5={dim.score5} />
                </div>
                <p className="text-[11px] text-muted-foreground">{dim.rationale}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Role summary */}
        <Section title="Role summary" icon={ListChecks}>
          <p className="text-xs text-muted-foreground">{data.blocks.roleSummary}</p>
        </Section>

        {/* CV match */}
        <Section title="CV match" icon={CheckCircle2} defaultOpen>
          <div className="space-y-1.5">
            {data.blocks.cvMatch.evidence.map((ev, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs">
                {ev.met ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden="true" />
                ) : (
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" aria-hidden="true" />
                )}
                <span>
                  <span className="font-medium text-foreground">{ev.requirement}</span>
                  {ev.cvEvidence ? (
                    <span className="text-muted-foreground"> — {ev.cvEvidence}</span>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
          {data.blocks.cvMatch.gaps.length > 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
              <p className="mb-1 text-[10px] font-medium uppercase text-amber-600 dark:text-amber-400">
                Gaps
              </p>
              <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
                {data.blocks.cvMatch.gaps.map((gap, i) => (
                  <li key={i}>{gap}</li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        {/* Level & strategy */}
        <Section title="Level & strategy" icon={TrendingUp}>
          <p className="text-xs text-muted-foreground">{data.blocks.levelStrategy}</p>
        </Section>

        {/* Comp & demand */}
        <Section title="Comp & demand" icon={DollarSign}>
          <div className="space-y-1.5">
            <Badge variant="secondary" className="text-[10px]">
              {BUDGET_FIT_LABEL[data.blocks.compDemand.budgetFit] ?? "Unknown"}
            </Badge>
            <p className="text-xs text-muted-foreground">{data.blocks.compDemand.summary}</p>
          </div>
        </Section>

        {/* Customization */}
        <Section title="Customization plan" icon={Wand2}>
          <p className="text-xs text-muted-foreground">{data.blocks.customization}</p>
        </Section>

        {/* Block G — posting legitimacy (orthogonal to fit) */}
        {data.blocks.legitimacy && (
          <Section
            title="Posting legitimacy"
            icon={ShieldCheck}
            defaultOpen={data.blocks.legitimacy.level === "uncertain"}
          >
            <div className="space-y-1.5">
              <Badge
                variant="outline"
                className={cn("text-[10px]", LEGITIMACY_META[data.blocks.legitimacy.level].pill)}
              >
                {LEGITIMACY_META[data.blocks.legitimacy.level].label}
              </Badge>
              {data.blocks.legitimacy.reasons.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
                  {data.blocks.legitimacy.reasons.map((reason, i) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
              )}
              <p className="text-[10px] italic text-muted-foreground/70">
                {data.blocks.legitimacy.note}
              </p>
            </div>
          </Section>
        )}

        {/* Interview plan (opt-in) */}
        {data.blocks.interviewPlan && data.blocks.interviewPlan.length > 0 && (
          <Section title="Interview plan" icon={MessageSquareQuote}>
            <div className="space-y-2">
              {data.blocks.interviewPlan.map((item, i) => (
                <div key={i} className="space-y-0.5">
                  <p className="text-xs font-medium text-foreground">{item.theme}</p>
                  <p className="text-[11px] text-muted-foreground">{item.starSeed}</p>
                </div>
              ))}
            </div>
          </Section>
        )}
      </CardContent>
    </Card>
  );
});
