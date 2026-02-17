"use client";

import { useState, useCallback, useRef } from "react";

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

  const executeWithRetry = useCallback(
    async (attempt = 0): Promise<T | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await fnRef.current();
        setIsLoading(false);
        setRetryCount(0);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));

        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 200;
          await new Promise((r) => setTimeout(r, delay));
          setRetryCount(attempt + 1);
          return executeWithRetry(attempt + 1);
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
    setRetryCount(0);
    return executeWithRetry(0);
  }, [executeWithRetry]);

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
    setRetryCount(0);
  }, []);

  return { execute, retry, isLoading, error, retryCount, reset };
}
