"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  ClipboardList,
  Heart,
  TrendingUp,
  CircleUser,
  Loader2,
} from "lucide-react";
import { Card } from "@ever-hust/ui/card";
import { cn } from "@ever-hust/ui/lib/utils";

interface StatCard {
  label: string;
  count: number | null;
  /** Optional formatted value (e.g. "80%") that overrides the numeric display. */
  display?: string | null;
  icon: typeof Briefcase;
  href: string;
  color: string;
  bgColor: string;
  barColor: string;
}

export function DashboardCanvas() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    jobs: null as number | null,
    applications: null as number | null,
    favorites: null as number | null,
    profile: null as number | null,
  });

  useEffect(() => {
    const controller = new AbortController();

    async function fetchStats() {
      const signal = controller.signal;

      try {
        const [jobsRes, appsRes, favsRes, profileRes] = await Promise.allSettled([
          fetch("/api/jobs/search?page=1&limit=1", { signal }),
          fetch("/api/user/applications?limit=1", { signal }),
          fetch("/api/user/favorites/list", { signal }),
          fetch("/api/user/profile", { signal }),
        ]);

        if (signal.aborted) return;

        let jobsCount = 0;
        let appsCount = 0;
        let favsCount = 0;
        let profileCompleteness = 0;

        if (jobsRes.status === "fulfilled" && jobsRes.value.ok) {
          const data = await jobsRes.value.json();
          jobsCount = data.total ?? 0;
        }
        if (appsRes.status === "fulfilled" && appsRes.value.ok) {
          const data = await appsRes.value.json();
          appsCount = data.applications?.length ?? data.total ?? 0;
        }
        if (favsRes.status === "fulfilled" && favsRes.value.ok) {
          const data = await favsRes.value.json();
          favsCount = data.favorites?.length ?? 0;
        }
        if (profileRes.status === "fulfilled" && profileRes.value.ok) {
          const data = await profileRes.value.json();
          const user = data.user;
          let filled = 0;
          const total = 5;
          if (user?.name) filled++;
          if (user?.headline) filled++;
          if (user?.location) filled++;
          if (user?.skills?.length > 0) filled++;
          if (user?.photoUrl) filled++;
          profileCompleteness = Math.round((filled / total) * 100);
        }

        if (!signal.aborted) {
          setStats({
            jobs: jobsCount,
            applications: appsCount,
            favorites: favsCount,
            profile: profileCompleteness,
          });
        }
      } catch {
        // Silently fail
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    fetchStats();
    return () => controller.abort();
  }, []);

  const cards: StatCard[] = [
    {
      label: "Jobs Matched",
      count: stats.jobs,
      icon: Briefcase,
      href: "/jobs",
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-500/10",
      barColor: "bg-blue-500",
    },
    {
      label: "Saved Jobs",
      count: stats.favorites,
      icon: Heart,
      href: "/favorites",
      color: "text-rose-600 dark:text-rose-400",
      bgColor: "bg-rose-500/10",
      barColor: "bg-rose-500",
    },
    {
      label: "Applications",
      count: stats.applications,
      icon: ClipboardList,
      href: "/applications",
      color: "text-emerald-600 dark:text-emerald-400",
      bgColor: "bg-emerald-500/10",
      barColor: "bg-emerald-500",
    },
    {
      label: "Profile",
      count: stats.profile,
      display: stats.profile === null ? null : `${stats.profile}%`,
      icon: CircleUser,
      href: "/profile",
      color: "text-violet-600 dark:text-violet-400",
      bgColor: "bg-violet-500/10",
      barColor: "bg-violet-500",
    },
  ];

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="h-5 w-5 text-primary" aria-hidden="true" />
          <h1 className="text-xl font-bold">Dashboard</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Your job search at a glance. Click any card to explore.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((card) => (
          <Card
            key={card.label}
            className={cn(
              "group relative cursor-pointer overflow-hidden p-6 transition-all duration-200",
              "hover:shadow-md hover:scale-[1.02] active:scale-[0.98]",
              "border hover:border-primary/20"
            )}
            onClick={() => router.push(card.href)}
            role="link"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                router.push(card.href);
              }
            }}
            aria-label={`${card.label}: ${card.display ?? card.count ?? 0}. Click to view.`}
          >
            {/* Background decoration */}
            <div
              className={cn(
                "absolute -right-4 -top-4 h-24 w-24 rounded-full opacity-20 transition-opacity group-hover:opacity-30",
                card.bgColor
              )}
            />

            <div className="relative flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {card.label}
                </p>
                <div className="mt-2">
                  {loading ? (
                    <Loader2
                      className="h-8 w-8 animate-spin text-muted-foreground/50"
                      aria-hidden="true"
                    />
                  ) : (
                    <span className="text-3xl font-bold tabular-nums">
                      {card.display ?? card.count?.toLocaleString() ?? 0}
                    </span>
                  )}
                </div>
              </div>
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-lg",
                  card.bgColor
                )}
              >
                <card.icon
                  className={cn("h-5 w-5", card.color)}
                  aria-hidden="true"
                />
              </div>
            </div>

            {/* Hover indicator */}
            <div
              className={cn(
                "absolute bottom-0 left-0 h-0.5 w-0 transition-all duration-300 group-hover:w-full",
                card.barColor
              )}
            />
          </Card>
        ))}
      </div>

      {/* Tip */}
      <div className="mt-8 rounded-lg border border-dashed p-4 text-center">
        <p className="text-sm text-muted-foreground">
          💡 Two ways to work: use the <span className="font-medium text-foreground">chat</span> to
          search jobs, generate cover letters, or get salary insights — or use the{" "}
          <span className="font-medium text-foreground">sidebar</span> to browse Jobs, Saved Jobs,
          Applications, and your Profile directly. Use whichever you prefer.
        </p>
      </div>
    </div>
  );
}
