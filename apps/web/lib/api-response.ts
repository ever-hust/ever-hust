import { NextResponse } from "next/server";

/**
 * Standardized API response helpers.
 *
 * Provides consistent response shapes, cache headers, and error formatting
 * across all API routes.
 */

/** Standard success response with optional cache headers */
export function apiSuccess<T>(
  data: T,
  options?: {
    status?: number;
    /** Cache-Control max-age in seconds (0 = no-cache) */
    cacheSeconds?: number;
    /**
     * Whether the response contains user-specific data.
     * When true, uses `private` Cache-Control to prevent CDN from
     * serving one user's data to another. Defaults to false (public).
     */
    isPrivate?: boolean;
    /** Additional headers */
    headers?: Record<string, string>;
  },
) {
  const { status = 200, cacheSeconds, isPrivate = false, headers: extraHeaders } = options ?? {};

  const headers: Record<string, string> = { ...extraHeaders };

  if (cacheSeconds !== undefined && cacheSeconds > 0) {
    const scope = isPrivate ? "private" : "public";
    headers["Cache-Control"] = `${scope}, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 2}`;
  } else if (cacheSeconds === 0) {
    headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
  }

  return NextResponse.json(data, { status, headers });
}

/** Standard error response */
export function apiError(
  message: string,
  status = 500,
  details?: unknown,
) {
  return NextResponse.json(
    {
      error: message,
      ...(details !== undefined ? { details } : {}),
    },
    { status },
  );
}

/** 400 Bad Request */
export function apiBadRequest(message = "Invalid request", details?: unknown) {
  return apiError(message, 400, details);
}

/** 401 Unauthorized */
export function apiUnauthorized(message = "Authentication required") {
  return apiError(message, 401);
}

/** 403 Forbidden */
export function apiForbidden(message = "Insufficient permissions") {
  return apiError(message, 403);
}

/** 404 Not Found */
export function apiNotFound(message = "Resource not found") {
  return apiError(message, 404);
}

/**
 * Safely parse JSON from a request body.
 * Returns the parsed body or a 400 response if parsing fails.
 */
export async function safeJsonParse(
  req: Request,
): Promise<{ ok: true; data: unknown } | { ok: false; response: NextResponse }> {
  try {
    const data: unknown = await req.json();
    return { ok: true, data };
  } catch {
    return { ok: false, response: apiBadRequest("Invalid or missing JSON body") };
  }
}

/** 429 Too Many Requests */
export function apiRateLimited(retryAfterSeconds: number) {
  return NextResponse.json(
    {
      error: "Too many requests. Please try again later.",
      retryAfter: retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}
