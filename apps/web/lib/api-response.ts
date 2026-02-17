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
    /** Additional headers */
    headers?: Record<string, string>;
  },
) {
  const { status = 200, cacheSeconds, headers: extraHeaders } = options ?? {};

  const headers: Record<string, string> = { ...extraHeaders };

  if (cacheSeconds !== undefined && cacheSeconds > 0) {
    headers["Cache-Control"] = `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 2}`;
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
