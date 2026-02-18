"use client";

import { useEffect, useRef, useCallback } from "react";
import { getSupabaseClient } from "@repo/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface RealtimeJob {
  id: number;
  external_id: string;
  title: string;
  company_name: string;
  company_logo: string | null;
  job_url: string;
  location_city: string | null;
  location_country: string | null;
  is_remote: boolean;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  skills: string[] | null;
  date_posted: string | null;
  site: string;
}

interface UseRealtimeJobsOptions {
  /** Called when a new job is inserted. */
  onInsert?: (job: RealtimeJob) => void;
  /** Called when a job is updated. */
  onUpdate?: (job: RealtimeJob) => void;
  /** Called when a job is deleted. */
  onDelete?: (id: number) => void;
  /** Enable/disable the subscription (default: true). */
  enabled?: boolean;
}

/**
 * React hook that subscribes to Supabase Realtime changes on the `jobs` table.
 * Automatically cleans up the subscription on unmount.
 *
 * @example
 * ```tsx
 * useRealtimeJobs({
 *   onInsert: (job) => setJobs((prev) => [job, ...prev]),
 *   onUpdate: (job) => setJobs((prev) => prev.map((j) => j.id === job.id ? job : j)),
 * });
 * ```
 */
export function useRealtimeJobs({
  onInsert,
  onUpdate,
  onDelete,
  enabled = true,
}: UseRealtimeJobsOptions = {}) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Use refs for callbacks to avoid re-subscribing on every render
  const onInsertRef = useRef(onInsert);
  const onUpdateRef = useRef(onUpdate);
  const onDeleteRef = useRef(onDelete);
  onInsertRef.current = onInsert;
  onUpdateRef.current = onUpdate;
  onDeleteRef.current = onDelete;

  const unsubscribe = useCallback(() => {
    if (channelRef.current) {
      channelRef.current.unsubscribe();
      channelRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      unsubscribe();
      return;
    }

    let supabase: ReturnType<typeof getSupabaseClient>;
    try {
      supabase = getSupabaseClient();
    } catch {
      // Supabase not configured — skip Realtime
      return;
    }

    const channel = supabase
      .channel("jobs-realtime")
      .on(
        "postgres_changes" as "system",
        {
          event: "*",
          schema: "public",
          table: "jobs",
        } as Record<string, unknown>,
        (payload: Record<string, unknown>) => {
          const eventType = payload.eventType as string;
          const newRecord = payload.new as RealtimeJob | undefined;
          const oldRecord = payload.old as { id: number } | undefined;

          if (eventType === "INSERT" && newRecord && onInsertRef.current) {
            onInsertRef.current(newRecord);
          } else if (eventType === "UPDATE" && newRecord && onUpdateRef.current) {
            onUpdateRef.current(newRecord);
          } else if (eventType === "DELETE" && oldRecord && onDeleteRef.current) {
            onDeleteRef.current(oldRecord.id);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      unsubscribe();
    };
  }, [enabled, unsubscribe]);

  return { unsubscribe };
}
