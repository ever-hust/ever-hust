/**
 * Escape ILIKE wildcard characters (%, _) in user input to prevent
 * unintended pattern matching. Backslash-escape is the Postgres default.
 *
 * Used across API routes and AI tools whenever user-supplied strings
 * are embedded in ILIKE patterns.
 */
export function escapeIlike(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
