/**
 * Jest stand-in for better-auth/api, mapped in jest.config.ts for the auth
 * project. better-auth ships ESM only and this Jest setup runs CJS, so every
 * test that loads index.ts (which imports the guest self-delete guard) would
 * otherwise fail with "Must use import to load ES Module". APIError has the
 * fields the guard and its tests read; createAuthMiddleware hands the handler
 * back unchanged.
 */
const STATUS_CODES: Record<string, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
};

export class APIError extends Error {
  status: string;
  statusCode: number;
  body: { message?: string; code?: string } | undefined;

  constructor(status: string, body?: { message?: string; code?: string }) {
    super(body?.message);
    this.name = "APIError";
    this.status = status;
    this.statusCode = STATUS_CODES[status] ?? 500;
    this.body = body;
  }
}

export function createAuthMiddleware<T>(handler: T): T {
  return handler;
}
