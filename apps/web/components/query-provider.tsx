"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data considered fresh for 60 seconds — prevents refetch storms
        staleTime: 60 * 1000,
        // Keep unused cache entries for 5 minutes
        gcTime: 5 * 60 * 1000,
        // Retry failed requests once with exponential backoff
        retry: 1,
        // Refetch on window focus for freshness
        refetchOnWindowFocus: true,
      },
    },
  });
}

/**
 * React Query provider for the entire app.
 *
 * Creates a stable QueryClient via `useState` (recommended Next.js App Router
 * pattern to avoid sharing state between requests on the server).
 *
 * Renders `ReactQueryDevtools` in development mode (bottom-right toggle).
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
