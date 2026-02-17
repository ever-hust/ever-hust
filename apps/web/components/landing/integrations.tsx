import { Badge } from "@repo/ui/badge";
import { Globe } from "lucide-react";

const JOB_SOURCES = [
  { name: "LinkedIn", category: "board" },
  { name: "Indeed", category: "board" },
  { name: "Glassdoor", category: "board" },
  { name: "ZipRecruiter", category: "board" },
  { name: "Google Jobs", category: "board" },
  { name: "Upwork", category: "board" },
  { name: "Greenhouse", category: "ats" },
  { name: "Lever", category: "ats" },
  { name: "Ashby", category: "ats" },
  { name: "Workable", category: "ats" },
  { name: "SmartRecruiters", category: "ats" },
  { name: "Workday", category: "ats" },
  { name: "Bayt", category: "board" },
  { name: "Naukri", category: "board" },
];

export function Integrations() {
  return (
    <section className="border-y bg-muted/30 px-4 py-16 sm:px-6 lg:px-8" aria-label="Supported job platforms">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col items-center gap-3 mb-10">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Globe className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium tracking-wider text-muted-foreground uppercase">
            Searching Across 25+ Job Boards &amp; ATS Platforms
          </p>
        </div>

        {/* Source grid */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          {JOB_SOURCES.map((source) => (
            <Badge
              key={source.name}
              variant="outline"
              className="px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent hover:text-foreground"
            >
              {source.name}
            </Badge>
          ))}
          <Badge
            variant="default"
            className="px-3 py-1.5 text-sm font-medium"
          >
            +11 more
          </Badge>
        </div>

        {/* Category labels */}
        <div className="mt-6 flex items-center justify-center gap-4 text-xs text-muted-foreground/60">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary/50" aria-hidden="true" />
            Job Boards
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary/50" aria-hidden="true" />
            ATS Platforms
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary/50" aria-hidden="true" />
            Company Career Pages
          </span>
        </div>
      </div>
    </section>
  );
}
