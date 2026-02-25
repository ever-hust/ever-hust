"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ClipboardList,
  Heart,
  Briefcase,
  TrendingUp,
  Loader2,
} from "lucide-react";
import { cn } from "@ever-hust/ui/lib/utils";

interface DashboardStat {
  label: string;
  value: number | string;
  href: string;
  icon: typeof Briefcase;
  color: string;
}

/**
 * Compact horizontal stats bar shown at the top of the dashboard.
 * Fetches counts for applications, favorites, and active alerts.
 */
export function DashboardStats() {
  const [stats, setStats] = useState<DashboardStat[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchStats() {
      try {
        const [profileRes, appsRes, favsRes] = await Promise.all([
          fetch("/api/user/profile").catch(() => null),
          fetch("/api/user/applications").catch(() => null),
          fetch("/api/user/favorites").catch(() => null),
        ]);

        if (cancelled) return;

        let applicationsCount = 0;
        let favoritesCount = 0;
        let profileCompleteness = 0;

        if (profileRes?.ok) {
          const data = await profileRes.json();
          const user = data.user;
          // Calculate profile completeness
          let filled = 0;
          const total = 5;
          if (user?.name) filled++;
          if (user?.headline) filled++;
          if (user?.location) filled++;
          if (user?.skills?.length > 0) filled++;
          if (user?.photoUrl) filled++;
          profileCompleteness = Math.round((filled / total) * 100);
        }

        if (appsRes?.ok) {
          const data = await appsRes.json();
          applicationsCount = Array.isArray(data.applications)
            ? data.applications.length
            : 0;
        }

        if (favsRes?.ok) {
          const data = await favsRes.json();
          favoritesCount = Array.isArray(data.favorites)
            ? data.favorites.length
            : 0;
        }

        if (!cancelled) {
          setStats([
            {
              label: "Applications",
              value: applicationsCount,
              href: "/applications",
              icon: ClipboardList,
              color: "text-blue-500",
            },
            {
              label: "Saved Jobs",
              value: favoritesCount,
              href: "/favorites",
              icon: Heart,
              color: "text-pink-500",
            },
            {
              label: "Profile",
              value: `${profileCompleteness}%`,
              href: "/profile",
              icon: TrendingUp,
              color: "text-emerald-500",
            },
          ]);
        }
      } catch {
        /* non-blocking — just don't show stats */
      }
    }

    fetchStats();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!stats) {
    return (
      <div className="flex items-center gap-3 px-1 py-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Loading stats…</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {stats.map((stat) => (
        <Link
          key={stat.label}
          href={stat.href}
          className="group flex items-center gap-2.5 rounded-lg border bg-card p-2.5 sm:p-3 transition-colors hover:bg-accent/50"
        >
          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted",
              stat.color,
            )}
          >
            <stat.icon className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-bold leading-tight">{stat.value}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {stat.label}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
