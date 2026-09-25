/** Longest error text the sync logs or returns per failure. */
export const MAX_ERROR_TEXT = 500;

/**
 * A short, useful message for an error the sync logs or reports. Drizzle wraps every driver error
 * as `Failed query: <sql>\nparams: <every parameter>`: for a batch statement that is the whole
 * batch (250 rows of descriptions, megabytes), and the driver's own message ("canceling statement
 * due to statement timeout", a constraint name…) sits in `cause`. So the cause's message is used
 * for those, and every message is capped at {@link MAX_ERROR_TEXT} characters.
 */
export function errorText(err: unknown): string {
  let message: string;
  if (err instanceof Error) {
    const cause = (err as { cause?: unknown }).cause;
    message = err.message.startsWith("Failed query:") && cause instanceof Error ? cause.message : err.message;
  } else {
    message = String(err);
  }
  return message.length > MAX_ERROR_TEXT ? `${message.slice(0, MAX_ERROR_TEXT)}…` : message;
}
