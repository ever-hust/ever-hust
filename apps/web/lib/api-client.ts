import { toast } from "sonner";

/**
 * Type-safe API fetch helper with built-in error handling.
 *
 * - Automatically parses JSON responses
 * - Shows toast on error (optional)
 * - Returns typed data or null on failure
 * - Handles network errors gracefully
 *
 * @example
 * ```ts
 * const data = await apiFetch<{ jobs: Job[] }>("/api/jobs/search?page=1");
 * if (data) {
 *   setJobs(data.jobs);
 * }
 * ```
 */
export async function apiFetch<T>(
  url: string,
  options?: RequestInit & {
    /** Custom error message for toast (default: auto-generated) */
    errorMessage?: string;
    /** Whether to show a toast on error (default: true) */
    showToast?: boolean;
  },
): Promise<T | null> {
  const { errorMessage, showToast = true, ...fetchOptions } = options ?? {};

  try {
    const res = await fetch(url, fetchOptions);

    if (!res.ok) {
      // Try to extract error message from response body
      let serverMessage: string | undefined;
      try {
        const body = await res.json();
        serverMessage =
          body?.error ?? body?.message ?? `Request failed (${res.status})`;
      } catch {
        serverMessage = `Request failed (${res.status})`;
      }

      if (showToast) {
        toast.error(errorMessage ?? serverMessage);
      }

      return null;
    }

    return (await res.json()) as T;
  } catch (err) {
    // Network error or JSON parse error
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred";

    if (process.env.NODE_ENV === "development") {
      console.warn(`[api-client] ${url} failed:`, message);
    }

    if (showToast) {
      toast.error(
        errorMessage ?? (message.includes("fetch") ? "Network error. Please check your connection." : message),
      );
    }

    return null;
  }
}

/**
 * Mutation helper for POST/PATCH/DELETE with JSON body.
 *
 * @example
 * ```ts
 * const result = await apiMutate<{ favorited: boolean }>("/api/user/favorites", {
 *   body: { jobId: 123 },
 * });
 * ```
 */
export async function apiMutate<T>(
  url: string,
  options: Omit<RequestInit, "body"> & {
    body?: unknown;
    method?: string;
    errorMessage?: string;
    showToast?: boolean;
  },
): Promise<T | null> {
  const { body, method = "POST", headers, ...rest } = options;

  return apiFetch<T>(url, {
    ...rest,
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
