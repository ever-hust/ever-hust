"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * Hook to manage hidden jobs for the current user.
 * Fetches hidden job IDs from the server and provides toggle functionality.
 */
export function useHiddenJobs() {
  const [hiddenJobIds, setHiddenJobIds] = useState<Set<number>>(new Set());

  // Fetch hidden jobs on mount
  useEffect(() => {
    async function fetchHiddenJobs() {
      try {
        const res = await fetch("/api/user/hidden-jobs");
        if (res.ok) {
          const data = await res.json();
          if (data.data?.hiddenJobIds) {
            setHiddenJobIds(new Set(data.data.hiddenJobIds));
          }
        }
      } catch {
        // Silent fail — hidden jobs are a nice-to-have
      }
    }
    fetchHiddenJobs();
  }, []);

  const hideJob = useCallback(async (jobId: number) => {
    try {
      setHiddenJobIds((prev) => new Set([...prev, jobId]));

      const res = await fetch("/api/user/hidden-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });

      if (!res.ok) {
        // Revert optimistic update
        setHiddenJobIds((prev) => {
          const next = new Set(prev);
          next.delete(jobId);
          return next;
        });
        toast.error("Failed to hide job");
      } else {
        toast.success("Job hidden");
      }
    } catch {
      setHiddenJobIds((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
      toast.error("Failed to hide job");
    }
  }, []);

  const unhideJob = useCallback(async (jobId: number) => {
    try {
      setHiddenJobIds((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });

      const res = await fetch(`/api/user/hidden-jobs?jobId=${jobId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        setHiddenJobIds((prev) => new Set([...prev, jobId]));
        toast.error("Failed to unhide job");
      }
    } catch {
      setHiddenJobIds((prev) => new Set([...prev, jobId]));
      toast.error("Failed to unhide job");
    }
  }, []);

  const isHidden = useCallback(
    (jobId: number) => hiddenJobIds.has(jobId),
    [hiddenJobIds]
  );

  return { hiddenJobIds, hideJob, unhideJob, isHidden };
}
