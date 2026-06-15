"use client";

import { memo, useState } from "react";
import {
  BarChart3,
  TrendingUp,
  Laptop,
  Building2,
  MapPin,
  Sparkles,
  Users,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ever-hust/ui/card";
import { cn } from "@ever-hust/ui/lib/utils";

// ---------------------------------------------------------------------------
// Types – matches the return shape of the marketInsights tool (spec #1)
// ---------------------------------------------------------------------------

export interface MarketInsightsData {
  role: string;
  location: string | null;
  demandCount: number;
  remotePct: number | null;
  salary: { median: number; p25: number; p75: number; sampleSize: number } | null;
  topSkills: { skill: string; count: number }[];
  topLocations: { location: string; count: number }[];
  topCompanies: { company: string; count: number }[];
  levelMix: { level: string; count: number }[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value.toLocaleString()}`;
}

function titleCase(str: string): string {
  return str
    .split(/[\s_-]+/)
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

const BarRow = memo(function BarRow({
  label,
  value,
  maxValue,
  color,
}: {
  label: string;
  value: number;
  maxValue: number;
  color?: string;
}) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-xs">
        <span className="max-w-[70%] truncate font-medium text-foreground">{label}</span>
        <span className="shrink-0 text-muted-foreground">{value}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted/50">
        <div
          className={cn("h-full rounded-full transition-all", color ?? "bg-primary/60")}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
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
        className="flex w-full items-center justify-between rounded text-sm font-medium text-foreground transition-colors hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
      {open && <div className="mt-3 space-y-2">{children}</div>}
    </div>
  );
}

function StatBox({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={cn("space-y-0.5 rounded-lg border p-2.5", highlight && "border-primary/30 bg-primary/5")}>
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className={cn("text-lg font-semibold", highlight ? "text-primary" : "text-foreground")}>{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface MarketInsightsCardProps {
  data: MarketInsightsData;
  className?: string;
}

export const MarketInsightsCard = memo(function MarketInsightsCard({
  data,
  className,
}: MarketInsightsCardProps) {
  if (data.error && data.demandCount === 0) {
    return (
      <Card className={cn("max-w-lg", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Market Insights
          </CardTitle>
          <CardDescription>{data.error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const subtitleParts = [data.location, `${data.demandCount} openings analysed`].filter(
    (x): x is string => typeof x === "string",
  );

  const skillMax = data.topSkills.length > 0 ? data.topSkills[0]!.count : 0;
  const locMax = data.topLocations.length > 0 ? data.topLocations[0]!.count : 0;
  const companyMax = data.topCompanies.length > 0 ? data.topCompanies[0]!.count : 0;
  const levelMax = data.levelMix.length > 0 ? Math.max(...data.levelMix.map((l) => l.count)) : 0;

  return (
    <Card className={cn("max-w-lg", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />
          Market Insights: {titleCase(data.role)}
        </CardTitle>
        <CardDescription>{subtitleParts.join(" • ")}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Headline stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatBox
            label="Openings"
            value={String(data.demandCount)}
            icon={<TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />}
            highlight
          />
          <StatBox
            label="Remote"
            value={data.remotePct != null ? `${data.remotePct}%` : "—"}
            icon={<Laptop className="h-3.5 w-3.5" aria-hidden="true" />}
          />
          <StatBox
            label="Median pay"
            value={data.salary ? formatUsd(data.salary.median) : "—"}
            icon={<BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />}
          />
        </div>

        {/* Salary spread */}
        {data.salary && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              Pay spread ({data.salary.sampleSize} with salary)
            </p>
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>{formatUsd(data.salary.p25)}</span>
              <span className="font-medium text-primary">{formatUsd(data.salary.median)}</span>
              <span>{formatUsd(data.salary.p75)}</span>
            </div>
          </div>
        )}

        {/* In-demand skills */}
        {data.topSkills.length > 0 && (
          <Section title="In-demand skills" icon={Sparkles} defaultOpen>
            {data.topSkills.slice(0, 8).map((s, idx) => (
              <BarRow
                key={s.skill}
                label={s.skill}
                value={s.count}
                maxValue={skillMax}
                color={idx === 0 ? "bg-primary" : "bg-primary/50"}
              />
            ))}
          </Section>
        )}

        {/* Top locations */}
        {data.topLocations.length > 0 && (
          <Section title="Top locations" icon={MapPin}>
            {data.topLocations.slice(0, 6).map((l) => (
              <BarRow key={l.location} label={l.location} value={l.count} maxValue={locMax} />
            ))}
          </Section>
        )}

        {/* Top hiring companies */}
        {data.topCompanies.length > 0 && (
          <Section title="Top hiring companies" icon={Building2}>
            {data.topCompanies.slice(0, 6).map((c) => (
              <BarRow key={c.company} label={c.company} value={c.count} maxValue={companyMax} />
            ))}
          </Section>
        )}

        {/* Level mix */}
        {data.levelMix.length > 0 && (
          <Section title="Seniority mix" icon={Users}>
            {data.levelMix.map((l) => (
              <BarRow key={l.level} label={titleCase(l.level)} value={l.count} maxValue={levelMax} />
            ))}
          </Section>
        )}

        {data.demandCount < 10 && (
          <p className="pt-1 text-center text-[10px] text-muted-foreground/70">
            Small sample ({data.demandCount} openings) — directional only.
          </p>
        )}
      </CardContent>
    </Card>
  );
});
