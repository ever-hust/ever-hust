/**
 * Shared date/time formatting utilities.
 *
 * Consolidates the various `timeAgo`, `formatDate`, `formatRelativeTime`, and
 * `formatSessionDate` helpers that were duplicated across components.
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
  if (days === 0) return "Today";
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

  const timeStr = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  if (diffDays === 0) return `Today at ${timeStr}`;
  if (diffDays === 1) return `Yesterday at ${timeStr}`;
  if (diffDays < 7) {
    const dayName = date.toLocaleDateString(undefined, { weekday: "long" });
    return `${dayName} at ${timeStr}`;
  }
  return date.toLocaleDateString(undefined, {
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
