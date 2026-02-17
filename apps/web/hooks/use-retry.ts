"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface UseRetryOptions {
  /** Maximum number of automatic retries (default: 3) */
  maxRetries?: number;
  /** Base delay in ms between retries with exponential backoff (default: 1000) */
  baseDelay?: number;
}

interface UseRetryReturn<T> {
  /** Execute the operation with automatic retry */
  execute: () => Promise<T | null>;
  /** Manually retry the last failed operation */
  retry: () => Promise<T | null>;
  /** Whether the operation is currently in progress */
  isLoading: boolean;
  /** The error from the last failed attempt, if any */
  error: Error | null;
  /** Number of retries attempted so far */
  retryCount: number;
  /** Reset state */
  reset: () => void;
}

/**
 * Hook for executing async operations with automatic retry and exponential backoff.
 *
 * @example
 * ```tsx
 * const { execute, isLoading, error, retry } = useRetry(
 *   () => fetch('/api/data').then(r => r.json()),
 *   { maxRetries: 3 }
 * );
 *
 * useEffect(() => { execute(); }, []);
 *
 * if (error) return <ErrorFallback title="Failed to load" onRetry={retry} />;
 * ```
 */
export function useRetry<T>(
  fn: () => Promise<T>,
  options?: UseRetryOptions,
): UseRetryReturn<T> {
  const { maxRetries = 3, baseDelay = 1000 } = options ?? {};

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const mountedRef = useRef(true);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up on unmount to prevent state updates after unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  const executeWithRetry = useCallback(
    async (attempt = 0): Promise<T | null> => {
      if (!mountedRef.current) return null;
      setIsLoading(true);
      setError(null);

      try {
        const result = await fnRef.current();
        if (!mountedRef.current) return null;
        setIsLoading(false);
        setRetryCount(0);
        return result;
      } catch (err) {
        if (!mountedRef.current) return null;
        const error = err instanceof Error ? err : new Error(String(err));

        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 200;
          return new Promise<T | null>((resolve) => {
            retryTimerRef.current = setTimeout(() => {
              retryTimerRef.current = null;
              if (!mountedRef.current) {
                resolve(null);
                return;
              }
              setRetryCount(attempt + 1);
              resolve(executeWithRetry(attempt + 1));
            }, delay);
          });
        }

        setError(error);
        setIsLoading(false);
        setRetryCount(attempt);
        return null;
      }
    },
    [maxRetries, baseDelay],
  );

  const execute = useCallback(() => executeWithRetry(0), [executeWithRetry]);

  const retry = useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    setRetryCount(0);
    return executeWithRetry(0);
  }, [executeWithRetry]);

  const reset = useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    setIsLoading(false);
    setError(null);
    setRetryCount(0);
  }, []);

  return { execute, retry, isLoading, error, retryCount, reset };
}
