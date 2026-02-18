import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";

/** Shape of a job row as broadcast by Supabase Realtime */
export interface RealtimeJobPayload {
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

export type RealtimeEventType = "INSERT" | "UPDATE" | "DELETE";

export interface RealtimeJobEvent {
  eventType: RealtimeEventType;
  new: RealtimeJobPayload | null;
  old: { id: number } | null;
}

/**
 * Subscribe to changes on the `jobs` table via Supabase Realtime.
 *
 * Returns a `RealtimeChannel` that the caller must unsubscribe from on cleanup.
 *
 * @example
 * ```ts
 * const channel = subscribeToJobs(supabase, (event) => {
 *   if (event.eventType === "INSERT") {
 *     addJobToCanvas(event.new);
 *   }
 * });
 *
 * // Cleanup
 * channel.unsubscribe();
 * ```
 */
export function subscribeToJobs(
  client: SupabaseClient,
  onEvent: (event: RealtimeJobEvent) => void
): RealtimeChannel {
  const channel = client
    .channel("jobs-changes")
    .on(
      "postgres_changes" as "system",
      {
        event: "*",
        schema: "public",
        table: "jobs",
      } as Record<string, unknown>,
      (payload: Record<string, unknown>) => {
        onEvent({
          eventType: payload.eventType as RealtimeEventType,
          new: (payload.new as RealtimeJobPayload) ?? null,
          old: (payload.old as { id: number }) ?? null,
        });
      }
    )
    .subscribe();

  return channel;
}
