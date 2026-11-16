export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Hust";
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:8443";

/**
 * Most job alerts one user can hold. POST /api/user/alerts and the AI
 * create-alert tool both refuse a new alert once the user has this many.
 */
export const MAX_ALERTS_PER_USER = 20;
