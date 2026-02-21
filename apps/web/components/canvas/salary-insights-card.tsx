"use client";

import { memo, useState } from "react";
import {
  DollarSign,
  TrendingUp,
  Building2,
  Laptop,
  BarChart3,
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
import { Badge } from "@ever-hust/ui/badge";
import { cn } from "@ever-hust/ui/lib/utils";

// ---------------------------------------------------------------------------
// Types – matches the return shape of the salaryInsightsTool
// ---------------------------------------------------------------------------

interface ByLevelEntry {
  level: string;
  count: number;
  median: number;
  min: number;
  max: number;
}

interface WorkModeStats {
  count: number;
  median: number;
  min: number | null;
  max: number | null;
}

interface TopCompany {
  company: string;
  medianSalary: number;
  jobCount: number;
}

export interface SalaryInsightsData {
  jobTitle: string;
  location: string | null;
  jobLevel: string | null;
  sampleSize: number;
  currency: string;
  overall: {
    median: number;
    average: number;
    min: number;
    max: number;
    p25: number;
    p75: number;
  };
  byLevel: ByLevelEntry[];
  byWorkMode: {
    remote: WorkModeStats;
    onSite: WorkModeStats;
  };
  topCompanies: TopCompany[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a number as a compact currency string (e.g. "$120K") */
function formatSalary(value: number, currency: string): string {
  if (value >= 1_000_000) {
    return `${currencySymbol(currency)}${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${currencySymbol(currency)}${Math.round(value / 1_000)}K`;
  }
  return `${currencySymbol(currency)}${value.toLocaleString()}`;
}

function currencySymbol(currency: string): string {
  switch (currency.toUpperCase()) {
    case "USD":
      return "$";
    case "EUR":
      return "\u20AC";
    case "GBP":
      return "\u00A3";
    case "CAD":
      return "CA$";
    case "AUD":
      return "A$";
    default:
      return `${currency} `;
  }
}

/** Capitalise the first letter of each word */
function titleCase(str: string): string {
  return str
    .split(/[\s_-]+/)
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Horizontal bar representing a salary range with a highlighted median marker */
const RangeBar = memo(function RangeBar({
  min,
  max,
  median,
  globalMin,
  globalMax,
  currency,
  label,
  count,
}: {
  min: number;
  max: number;
  median: number;
  globalMin: number;
  globalMax: number;
  currency: string;
  label: string;
  count: number;
}) {
  const range = globalMax - globalMin || 1;
  const leftPct = ((min - globalMin) / range) * 100;
  const widthPct = ((max - min) / range) * 100;
  const medianPct = ((median - globalMin) / range) * 100;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground">
          {formatSalary(median, currency)} median
          <span className="ml-1.5 text-[10px]">({count} jobs)</span>
        </span>
      </div>
      <div className="relative h-3 w-full rounded-full bg-muted/50">
        {/* Range bar */}
        <div
          className="absolute top-0 h-full rounded-full bg-primary/20"
          style={{
            left: `${Math.max(0, leftPct)}%`,
            width: `${Math.min(widthPct, 100 - leftPct)}%`,
          }}
        />
        {/* Median marker */}
        <div
          className="absolute top-0 h-full w-0.5 bg-primary"
          style={{ left: `${Math.min(medianPct, 100)}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{formatSalary(min, currency)}</span>
        <span>{formatSalary(max, currency)}</span>
      </div>
    </div>
  );
});

/** Simple horizontal bar chart row */
const BarRow = memo(function BarRow({
  label,
  value,
  maxValue,
  subLabel,
  color,
}: {
  label: string;
  value: number;
  maxValue: number;
  subLabel: string;
  color?: string;
}) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground truncate max-w-[60%]">
          {label}
        </span>
        <span className="text-muted-foreground shrink-0">{subLabel}</span>
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

/** Collapsible section */
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
        onClick={() => setOpen((prev) => !prev)}
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

interface SalaryInsightsCardProps {
  data: SalaryInsightsData;
  className?: string;
}

export const SalaryInsightsCard = memo(function SalaryInsightsCard({
  data,
  className,
}: SalaryInsightsCardProps) {
  // If the tool returned an error with no salary data, show a simple message
  if (data.error && data.sampleSize === 0) {
    return (
      <Card className={cn("max-w-lg", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Salary Insights
          </CardTitle>
          <CardDescription>{data.error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { overall, byLevel, byWorkMode, topCompanies, currency, sampleSize } = data;

  // Compute global min/max for range bar scaling across all levels
  const globalMin = overall.min;
  const globalMax = overall.max;

  // Find highest median among companies for bar chart scaling
  const topCompanyMax =
    topCompanies.length > 0
      ? Math.max(...topCompanies.map((c) => c.medianSalary))
      : 0;

  // Build subtitle
  const subtitleParts: string[] = [];
  if (data.location) subtitleParts.push(data.location);
  if (data.jobLevel) subtitleParts.push(`${titleCase(data.jobLevel)} level`);
  subtitleParts.push(`${sampleSize} jobs analysed`);
  const subtitle = subtitleParts.join(" \u2022 ");

  return (
    <Card className={cn("max-w-lg", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />
          Salary Insights: {data.jobTitle}
        </CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Overall stats */}
        <div className="grid grid-cols-2 gap-3">
          <StatBox
            label="Median"
            value={formatSalary(overall.median, currency)}
            icon={<TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />}
            highlight
          />
          <StatBox
            label="Average"
            value={formatSalary(overall.average, currency)}
            icon={<DollarSign className="h-3.5 w-3.5" aria-hidden="true" />}
          />
          <StatBox
            label="25th Percentile"
            value={formatSalary(overall.p25, currency)}
            icon={<ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
          />
          <StatBox
            label="75th Percentile"
            value={formatSalary(overall.p75, currency)}
            icon={<ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />}
          />
        </div>

        {/* Overall range visualisation */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            Overall Range ({currency}/year)
          </p>
          <div className="relative h-4 w-full rounded-full bg-muted/50">
            {/* P25-P75 interquartile range */}
            <div
              className="absolute top-0 h-full rounded-full bg-primary/25"
              style={{
                left: `${((overall.p25 - overall.min) / (overall.max - overall.min || 1)) * 100}%`,
                width: `${((overall.p75 - overall.p25) / (overall.max - overall.min || 1)) * 100}%`,
              }}
            />
            {/* Median marker */}
            <div
              className="absolute top-0 h-full w-1 rounded-full bg-primary"
              style={{
                left: `${((overall.median - overall.min) / (overall.max - overall.min || 1)) * 100}%`,
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{formatSalary(overall.min, currency)}</span>
            <span className="text-primary font-medium">
              {formatSalary(overall.median, currency)}
            </span>
            <span>{formatSalary(overall.max, currency)}</span>
          </div>
        </div>

        {/* By job level */}
        {byLevel.length > 1 && (
          <Section title="By Job Level" icon={Users} defaultOpen>
            {byLevel.map((entry) => (
              <RangeBar
                key={entry.level}
                min={entry.min}
                max={entry.max}
                median={entry.median}
                globalMin={globalMin}
                globalMax={globalMax}
                currency={currency}
                label={titleCase(entry.level)}
                count={entry.count}
              />
            ))}
          </Section>
        )}

        {/* Remote vs On-site */}
        {(byWorkMode.remote.count > 0 && byWorkMode.onSite.count > 0) && (
          <Section title="Remote vs On-Site" icon={Laptop} defaultOpen>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Laptop className="h-3 w-3 text-blue-500" aria-hidden="true" />
                  <span className="text-xs font-medium">Remote</span>
                </div>
                <p className="text-lg font-semibold text-foreground">
                  {formatSalary(byWorkMode.remote.median, currency)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {byWorkMode.remote.count} jobs
                  {byWorkMode.remote.min != null &&
                    byWorkMode.remote.max != null &&
                    ` \u2022 ${formatSalary(byWorkMode.remote.min, currency)}-${formatSalary(byWorkMode.remote.max, currency)}`}
                </p>
              </div>
              <div className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Building2 className="h-3 w-3 text-amber-500" aria-hidden="true" />
                  <span className="text-xs font-medium">On-Site</span>
                </div>
                <p className="text-lg font-semibold text-foreground">
                  {formatSalary(byWorkMode.onSite.median, currency)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {byWorkMode.onSite.count} jobs
                  {byWorkMode.onSite.min != null &&
                    byWorkMode.onSite.max != null &&
                    ` \u2022 ${formatSalary(byWorkMode.onSite.min, currency)}-${formatSalary(byWorkMode.onSite.max, currency)}`}
                </p>
              </div>
            </div>
            {/* Differential badge */}
            {byWorkMode.remote.count > 0 && byWorkMode.onSite.count > 0 && (
              <div className="flex justify-center">
                {(() => {
                  const diff = byWorkMode.remote.median - byWorkMode.onSite.median;
                  const pctDiff = byWorkMode.onSite.median > 0
                    ? Math.round((diff / byWorkMode.onSite.median) * 100)
                    : 0;
                  if (pctDiff === 0) return null;
                  return (
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-2"
                    >
                      Remote pays {pctDiff > 0 ? `${pctDiff}% more` : `${Math.abs(pctDiff)}% less`} than on-site
                    </Badge>
                  );
                })()}
              </div>
            )}
          </Section>
        )}

        {/* Top paying companies */}
        {topCompanies.length > 0 && (
          <Section title="Top Paying Companies" icon={Building2}>
            {topCompanies.slice(0, 7).map((company, idx) => (
              <BarRow
                key={company.company}
                label={company.company}
                value={company.medianSalary}
                maxValue={topCompanyMax}
                subLabel={`${formatSalary(company.medianSalary, currency)} (${company.jobCount})`}
                color={idx === 0 ? "bg-primary" : "bg-primary/50"}
              />
            ))}
          </Section>
        )}

        {/* Sample size caveat */}
        {sampleSize < 10 && (
          <p className="text-[10px] text-muted-foreground/70 text-center pt-1">
            Based on a small sample ({sampleSize} jobs). Results may not be representative.
          </p>
        )}
      </CardContent>
    </Card>
  );
});

// ---------------------------------------------------------------------------
// Stat box helper
// ---------------------------------------------------------------------------

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
    <div
      className={cn(
        "rounded-lg border p-2.5 space-y-0.5",
        highlight && "border-primary/30 bg-primary/5"
      )}
    >
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        {icon}
        {label}
      </div>
      <p
        className={cn(
          "text-lg font-semibold",
          highlight ? "text-primary" : "text-foreground"
        )}
      >
        {value}
      </p>
    </div>
  );
}
