"use client";

import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";

/**
 * Hook for managing the user's favorited jobs.
 *
 * - Loads favorites on mount from `/api/user/favorites`
 * - Provides an optimistic `toggleFavorite(jobId)` that persists via POST
 * - Exposes a `Set<number>` of favorited job IDs for O(1) lookup
 */
export function useFavorites() {
  const [favoritedJobIds, setFavoritedJobIds] = useState<Set<number>>(
    new Set()
  );
  const [isLoading, setIsLoading] = useState(true);

  // Load favorites on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/user/favorites");
        if (res.ok && !cancelled) {
          const data = (await res.json()) as { favoriteJobIds: number[] };
          setFavoritedJobIds(new Set(data.favoriteJobIds));
        }
      } catch (error) {
        console.warn(
          "[useFavorites] Failed to load favorites:",
          error instanceof Error ? error.message : error
        );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Optimistic toggle with API persist
  const toggleFavorite = useCallback(async (jobId: number) => {
    // Optimistic update
    setFavoritedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });

    try {
      const res = await fetch("/api/user/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          jobId: number;
          favorited: boolean;
        };
        // Reconcile with server truth
        setFavoritedJobIds((prev) => {
          const next = new Set(prev);
          if (data.favorited) {
            next.add(data.jobId);
          } else {
            next.delete(data.jobId);
          }
          return next;
        });
        toast.success(
          data.favorited
            ? "Job added to favorites"
            : "Job removed from favorites"
        );
      } else {
        // Revert on failure
        setFavoritedJobIds((prev) => {
          const next = new Set(prev);
          if (next.has(jobId)) {
            next.delete(jobId);
          } else {
            next.add(jobId);
          }
          return next;
        });
        toast.error("Failed to update favorite");
      }
    } catch {
      // Revert on error
      setFavoritedJobIds((prev) => {
        const next = new Set(prev);
        if (next.has(jobId)) {
          next.delete(jobId);
        } else {
          next.add(jobId);
        }
        return next;
      });
      toast.error("Failed to update favorite");
    }
  }, []);

  const isFavorited = useCallback(
    (jobId: number) => favoritedJobIds.has(jobId),
    [favoritedJobIds]
  );

  return {
    favoritedJobIds,
    isLoading,
    toggleFavorite,
    isFavorited,
    setFavoritedJobIds,
  };
}
