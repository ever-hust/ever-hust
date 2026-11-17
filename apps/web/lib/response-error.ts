/**
 * The message to show when a fetch() answer is not OK.
 *
 * API routes answer errors as `{ error: string, details? }` (see `apiError`
 * in api-response.ts), so the `error` text is the server's reason, for example
 * why DELETE /api/user/account was refused. Returns `fallback` when there is
 * no body, it is not JSON, or it has no non-empty `error` string.
 */
export async function responseErrorMessage(
  res: Response,
  fallback: string,
): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && "error" in body) {
      const { error } = body as { error: unknown };
      if (typeof error === "string" && error.trim()) return error;
    }
  } catch {
    // No body, or a body that is not JSON: use the fallback.
  }
  return fallback;
}
