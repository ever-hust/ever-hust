"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

interface UseFetchOptions<T> {
  /** Initial data before the first fetch completes */
  initialData?: T;
  /** Whether to fetch immediately on mount (default: true) */
  immediate?: boolean;
  /** Dependencies that trigger a re-fetch when changed */
  deps?: unknown[];
  /** Transform the raw JSON response into the desired shape */
  transform?: (data: unknown) => T;
}

interface UseFetchReturn<T> {
  data: T | null;
  error: string | null;
  isLoading: boolean;
  /** Re-fetch the data */
  refetch: () => Promise<void>;
  /** Manually set the data */
  setData: (data: T | null) => void;
}

/**
 * Declarative data fetching hook with built-in error handling and loading states.
 *
 * Consolidates the pattern used across dashboard pages where we fetch from an API
 * endpoint and manage loading/error/data states.
 *
 * @example
 * ```tsx
 * const { data: favorites, isLoading, error, refetch } = useFetch<FavoriteJob[]>(
 *   "/api/user/favorites/list",
 *   { transform: (d) => (d as { favorites: FavoriteJob[] }).favorites }
 * );
 * ```
 */
export function useFetch<T>(
  url: string,
  options: UseFetchOptions<T> = {}
): UseFetchReturn<T> {
  const {
    initialData = null,
    immediate = true,
    deps = [],
    transform,
  } = options;

  // Serialize deps to a stable string so callers can pass inline arrays
  // (e.g. `{ deps: [userId] }`) without triggering infinite refetch loops
  // due to new array references on every render.
  const depsKey = useMemo(() => JSON.stringify(deps), deps);

  // Keep transform in a ref to avoid stale closures without re-creating
  // fetchData on every render (transform is typically an inline arrow).
  const transformRef = useRef(transform);
  useEffect(() => {
    transformRef.current = transform;
  });

  const [data, setData] = useState<T | null>(initialData ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(immediate);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    // Abort any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(url, { signal: controller.signal });

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Please sign in to access this resource.");
        }
        throw new Error(`Request failed (${res.status})`);
      }

      const json = await res.json();
      const result = transformRef.current ? transformRef.current(json) : (json as T);
      setData(result);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return; // Ignore aborted requests
      }
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, depsKey]);

  useEffect(() => {
    if (immediate) {
      fetchData();
    }
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchData, immediate]);

  return { data, error, isLoading, refetch: fetchData, setData };
}
