import type { QueryClient } from "@tanstack/react-query";

/**
 * React Query key of the signed-in user's usage stats (GET /api/user/usage),
 * read by `useUsageStats` for the sidebar quota bars.
 */
export const USAGE_STATS_QUERY_KEY = ["usage-stats"] as const;

/**
 * Marks the usage stats stale and refetches them while the sidebar quota is
 * on screen. Call it after anything that uses up a free-tier quota: each chat
 * turn uses a message, and its tools can use searches and cover letters.
 */
export function refreshUsageStats(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: USAGE_STATS_QUERY_KEY });
}
