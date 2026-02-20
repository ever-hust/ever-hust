"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { toggleSetMember } from "../lib/hook-utils";

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
    const controller = new AbortController();

    async function load() {
      try {
        const res = await fetch("/api/user/favorites", { signal: controller.signal });
        if (res.ok && !controller.signal.aborted) {
          const data = (await res.json()) as { favoriteJobIds: number[] };
          setFavoritedJobIds(new Set(data.favoriteJobIds));
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.warn(
          "[useFavorites] Failed to load favorites:",
          error instanceof Error ? error.message : error
        );
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    load();
    return () => { controller.abort(); };
  }, []);

  // Track in-flight toggles to prevent race conditions from rapid clicks
  const inFlightRef = useRef<Set<number>>(new Set());

  // Optimistic toggle with API persist
  const toggleFavorite = useCallback(async (jobId: number) => {
    // Prevent concurrent toggles for the same job — avoids out-of-order
    // response reconciliation that would desync UI and server state.
    if (inFlightRef.current.has(jobId)) return;
    inFlightRef.current.add(jobId);

    // Optimistic update
    setFavoritedJobIds((prev) => toggleSetMember(prev, jobId));

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
        setFavoritedJobIds((prev) => toggleSetMember(prev, jobId));
        toast.error("Failed to update favorite");
      }
    } catch (err) {
      // Revert on error
      setFavoritedJobIds((prev) => toggleSetMember(prev, jobId));
      toast.error("Failed to update favorite");
      console.warn(
        "[useFavorites] Failed to toggle favorite:",
        err instanceof Error ? err.message : err
      );
    } finally {
      inFlightRef.current.delete(jobId);
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
