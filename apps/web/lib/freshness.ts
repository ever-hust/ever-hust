/**
 * Job freshness / liveness signal (spec #4).
 *
 * Hust derives a freshness signal from the `datePosted` / `expiresAt` it already stores, and is
 * forward-compatible with an explicit `liveness` signal from the Ever Jobs API (active/expired/
 * uncertain) when present. Pure + deterministic (`now` is injectable).
 *
 * IMPORTANT (spec #4 invariant): this only *labels* freshness. `uncertain` jobs are surfaced as
 * "Unverified", never hidden — the user decides.
 */
export type FreshnessState = "fresh" | "active" | "stale" | "expired" | "uncertain";

export type LivenessSignal = "active" | "expired" | "uncertain";

export interface Freshness {
  state: FreshnessState;
  ageDays: number | null;
  label: string;
}

/** States that warrant a visible caution badge (the others are "fine, no badge"). */
export const CAUTION_STATES: readonly FreshnessState[] = ["stale", "expired", "uncertain"];

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const FRESH_MAX_DAYS = 14;
const ACTIVE_MAX_DAYS = 45;

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function computeFreshness(input: {
  datePosted?: string | Date | null;
  expiresAt?: string | Date | null;
  liveness?: LivenessSignal | null;
  now?: Date;
}): Freshness {
  const now = input.now ?? new Date();
  const posted = toDate(input.datePosted);
  const ageDays =
    posted != null ? Math.floor((now.getTime() - posted.getTime()) / MS_PER_DAY) : null;

  // An explicit Ever Jobs liveness signal wins over date heuristics.
  if (input.liveness === "expired") return { state: "expired", ageDays, label: "Expired" };
  if (input.liveness === "uncertain") {
    return { state: "uncertain", ageDays, label: "Unverified" };
  }

  const expiresAt = toDate(input.expiresAt);
  if (expiresAt != null && expiresAt.getTime() < now.getTime()) {
    return { state: "expired", ageDays, label: "Expired" };
  }

  if (posted == null || ageDays == null) {
    return { state: "uncertain", ageDays: null, label: "Date unknown" };
  }
  if (ageDays <= FRESH_MAX_DAYS) return { state: "fresh", ageDays, label: "Fresh" };
  if (ageDays <= ACTIVE_MAX_DAYS) return { state: "active", ageDays, label: "Active" };
  return { state: "stale", ageDays, label: "Stale" };
}

export function isCaution(state: FreshnessState): boolean {
  return CAUTION_STATES.includes(state);
}
