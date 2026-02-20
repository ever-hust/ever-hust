/**
 * Shared formatting utilities for dates, locations, and salaries.
 *
 * Consolidates the various `timeAgo`, `formatDate`, `formatRelativeTime`,
 * `formatSessionDate`, `formatLocation`, and `formatSalary` helpers that
 * were duplicated across components.
 */

// ---------------------------------------------------------------------------
// Relative time — compact ("5m ago", "3d ago")
// ---------------------------------------------------------------------------

/**
 * Compact relative time string.
 *
 * Returns `null` if `dateInput` is falsy so callers can conditionally render.
 *
 * @example
 * timeAgo("2025-01-10T12:00:00Z") // "3d ago"
 * timeAgo(null) // null
 */
export function timeAgo(dateInput: string | Date | null | undefined): string | null {
  if (!dateInput) return null;

  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);

  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;

  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;

  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;

  return formatDate(d);
}

// ---------------------------------------------------------------------------
// Standard locale date — "Jan 15, 2025"
// ---------------------------------------------------------------------------

/**
 * Human-readable locale date string.
 *
 * @example
 * formatDate("2025-01-15") // "Jan 15, 2025"
 */
export function formatDate(dateInput: string | Date): string {
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Short locale date — "Jan 15" (no year, useful for charts)
// ---------------------------------------------------------------------------

/**
 * Abbreviated date string without year, suitable for chart axis labels.
 *
 * @example
 * formatShortDate("2025-01-15") // "Jan 15"
 */
export function formatShortDate(dateInput: string | Date): string {
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Session date — "Today at 3:45 PM" / "Monday at 3:45 PM" / "Jan 15"
// ---------------------------------------------------------------------------

/**
 * Contextual date for chat session display.
 *
 * - Same day → "Today at 3:45 PM"
 * - Yesterday → "Yesterday at 3:45 PM"
 * - This week → "Monday at 3:45 PM"
 * - Older → "Jan 15, 2025" (omits year if same year)
 */
export function formatSessionDate(dateInput: string | Date): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Use a fixed locale to avoid hydration mismatches between server and client
  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  if (diffDays === 0) return `Today at ${timeStr}`;
  if (diffDays === 1) return `Yesterday at ${timeStr}`;
  if (diffDays < 7) {
    const dayName = date.toLocaleDateString("en-US", { weekday: "long" });
    return `${dayName} at ${timeStr}`;
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: now.getFullYear() !== date.getFullYear() ? "numeric" : undefined,
  });
}

// ---------------------------------------------------------------------------
// Location formatting — "San Francisco, CA" / "Remote"
// ---------------------------------------------------------------------------

/**
 * Format a location string from city/state/country parts.
 *
 * @example
 * formatLocation("SF", "CA", null) // "SF, CA"
 * formatLocation(null, null, null, true) // "Remote"
 * formatLocation("SF", "CA", null, true) // "SF, CA (Remote)"
 */
export function formatLocation(
  city: string | null | undefined,
  state: string | null | undefined,
  country?: string | null | undefined,
  isRemote?: boolean | null
): string | null {
  const parts = [city, state, country].filter(Boolean);
  const loc = parts.join(", ");
  if (isRemote) return loc ? `${loc} (Remote)` : "Remote";
  return loc || null;
}

// ---------------------------------------------------------------------------
// Salary formatting — "$80k - $120k/yr" / "$80,000 - $120,000"
// ---------------------------------------------------------------------------

/** Map well-known interval names to compact suffixes. */
const INTERVAL_SUFFIXES: Record<string, string> = {
  yearly: "/yr",
  year: "/yr",
  monthly: "/mo",
  month: "/mo",
  hourly: "/hr",
  hour: "/hr",
};

/**
 * Format a salary range for display.
 *
 * Two display modes:
 * - `"compact"` (default) — abbreviates thousands as "k" (`$80k - $120k/yr`)
 * - `"full"` — uses locale number formatting (`$80,000 - $120,000/year`)
 *
 * @example
 * formatSalary("80000", "120000", "USD", "yearly")           // "$80k - $120k/yr"
 * formatSalary("80000", "120000", "USD", "yearly", "full")   // "$80,000 - $120,000 /year"
 * formatSalary("80000", null, "USD")                         // "$80k+"
 * formatSalary(null, "120000", "EUR")                        // "Up to EUR120k"
 */
export function formatSalary(
  min: string | null | undefined,
  max: string | null | undefined,
  currency?: string | null,
  interval?: string | null,
  mode: "compact" | "full" = "compact"
): string | null {
  if (!min && !max) return null;

  const curr = currency ?? "USD";
  const symbol = curr === "USD" ? "$" : curr;

  const fmt = (v: string): string => {
    const num = Number(v);
    if (Number.isNaN(num)) return v;

    if (mode === "compact" && num >= 1_000) {
      return `${symbol}${Math.round(num / 1_000)}k`;
    }
    return `${symbol}${num.toLocaleString("en-US")}`;
  };

  // Build range portion
  let range: string;
  if (min && max) {
    range = `${fmt(min)} - ${fmt(max)}`;
  } else if (min) {
    range = `${fmt(min)}+`;
  } else {
    range = `Up to ${fmt(max!)}`;
  }

  // Append interval suffix when provided
  if (interval) {
    const suffix =
      mode === "compact"
        ? (INTERVAL_SUFFIXES[interval] ?? `/${interval}`)
        : ` /${interval}`;
    return `${range}${suffix}`;
  }

  return range;
}
