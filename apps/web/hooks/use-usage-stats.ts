"use client";

import { useState, useEffect, useCallback, useRef } from "react";

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
 */
export function useUsageStats(): UseUsageStatsReturn {
  const [data, setData] = useState<UsageStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchUsage = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setError(null);
      const res = await fetch("/api/user/usage", { signal: controller.signal });

      if (!res.ok) {
        if (res.status === 401) {
          // Not authenticated — probably redirect happening
          return;
        }
        throw new Error(`Failed to fetch usage stats (${res.status})`);
      }

      const json = (await res.json()) as UsageStats;
      if (!controller.signal.aborted) {
        setData(json);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to fetch usage stats");
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchUsage();
    return () => { abortRef.current?.abort(); };
  }, [fetchUsage]);

  return { data, isLoading, error, refetch: fetchUsage };
}
