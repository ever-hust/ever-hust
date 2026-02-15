const JOB_SOURCES = [
  "LinkedIn",
  "Indeed",
  "Glassdoor",
  "ZipRecruiter",
  "Google Jobs",
  "Upwork",
  "Greenhouse",
  "Lever",
  "Ashby",
  "Workable",
  "SmartRecruiters",
  "Workday",
  "Bayt",
  "Naukri",
];

export function Integrations() {
  return (
    <section className="border-y bg-muted/30 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <p className="mb-8 text-center text-sm font-medium text-muted-foreground">
          SEARCHING ACROSS 25+ JOB BOARDS & ATS PLATFORMS
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
          {JOB_SOURCES.map((source) => (
            <span
              key={source}
              className="text-sm font-semibold text-muted-foreground/70 transition-colors hover:text-foreground"
            >
              {source}
            </span>
          ))}
          <span className="text-sm font-semibold text-primary">+11 more</span>
        </div>
      </div>
    </section>
  );
}
