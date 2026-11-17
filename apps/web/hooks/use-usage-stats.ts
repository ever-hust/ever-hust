"use client";

import { useQuery } from "@tanstack/react-query";
import { USAGE_STATS_QUERY_KEY } from "@/lib/usage-stats-query";

interface UsageCategory {
  used: number;
  remaining: number;
  limit: number;
  period: "day" | "week";
}

interface UsageData {
  messages: UsageCategory;
  searches: UsageCategory;
  coverLetters: UsageCategory;
}

interface UsageStats {
  plan: "free" | "pro";
  unlimited: boolean;
  usage: UsageData | null;
}

interface UseUsageStatsReturn {
  /** The usage stats data, null while loading or on error */
  data: UsageStats | null;
  /** Whether the initial fetch is in progress */
  isLoading: boolean;
  /** Error message if the fetch failed */
  error: string | null;
  /** Manually refetch usage stats (e.g. after consuming a resource) */
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch the current user's usage statistics.
 *
 * - Free users get remaining counts for messages, searches, and cover letters.
 * - Pro users get `unlimited: true` with null usage.
 * - Auto-fetches on mount and exposes a `refetch` for manual refresh.
 * - The chat panel refreshes it after each turn via `refreshUsageStats`.
 */
export function useUsageStats(): UseUsageStatsReturn {
  const { data, isLoading, error, refetch } = useQuery<UsageStats>({
    queryKey: USAGE_STATS_QUERY_KEY,
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/user/usage", { signal });
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Not authenticated");
        }
        throw new Error(`Failed to fetch usage stats (${res.status})`);
      }
      return res.json() as Promise<UsageStats>;
    },
  });

  return {
    data: data ?? null,
    isLoading,
    error: error?.message ?? null,
    refetch: async () => { await refetch(); },
  };
}
