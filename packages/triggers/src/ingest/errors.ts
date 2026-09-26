/** Longest error text the sync logs or returns per failure. */
export const MAX_ERROR_TEXT = 500;

/** Where Drizzle's `Failed query:` wrapper starts listing every parameter of the statement. */
const PARAMS_MARKER = "\nparams:";

/**
 * A short, useful message for an error the sync logs or reports. Drizzle wraps every driver error
 * as `Failed query: <sql>\nparams: <every parameter>`: for a batch statement that is the whole
 * batch (250 rows of descriptions, megabytes), and the driver's own message ("canceling statement
 * due to statement timeout", a constraint name…) sits in `cause`. So the cause's message is used
 * for those; without a cause, the parameter list is cut off (the statement text stays); and every
 * message is capped at {@link MAX_ERROR_TEXT} characters.
 */
export function errorText(err: unknown): string {
  let message: string;
  if (err instanceof Error) {
    const cause = (err as { cause?: unknown }).cause;
    const wrapped = err.message.startsWith("Failed query:");
    if (wrapped && cause instanceof Error) {
      message = cause.message;
    } else {
      const params = wrapped ? err.message.indexOf(PARAMS_MARKER) : -1;
      message = params >= 0 ? err.message.slice(0, params) : err.message;
    }
  } else {
    message = String(err);
  }
  return message.length > MAX_ERROR_TEXT ? `${message.slice(0, MAX_ERROR_TEXT)}…` : message;
}
