import { Novu } from "@novu/api";

let novuClient: Novu | null = null;

/**
 * Get or create a singleton Novu client.
 * Returns null if the NOVU_API_KEY is not configured — all notification
 * calls degrade gracefully.
 */
export function getNovuClient(): Novu | null {
  const apiKey = process.env.NOVU_API_KEY;
  if (!apiKey) return null;

  if (!novuClient) {
    novuClient = new Novu({ secretKey: apiKey });
  }
  return novuClient;
}

/**
 * Send a notification via Novu's trigger API.
 *
 * @param workflowId — The Novu workflow / notification template ID
 * @param subscriberId — Unique identifier for the recipient
 * @param payload — Data to interpolate into the notification template
 */
export async function triggerNotification(
  workflowId: string,
  subscriberId: string,
  payload: Record<string, unknown>,
  overrides?: Record<string, unknown>
) {
  const client = getNovuClient();
  if (!client) {
    console.warn("[novu] NOVU_API_KEY not configured — skipping notification");
    return null;
  }

  try {
    const result = await client.trigger({
      workflowId,
      to: { subscriberId },
      payload,
      ...(overrides ? { overrides } : {}),
    });
    return result;
  } catch (err) {
    console.error(
      "[novu] Failed to trigger notification:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/**
 * Create or update a Novu subscriber (e.g., on user signup / profile update).
 */
export async function upsertSubscriber(
  subscriberId: string,
  data: {
    email?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    avatar?: string;
  }
) {
  const client = getNovuClient();
  if (!client) return null;

  try {
    const result = await client.subscribers.create({
      subscriberId,
      ...data,
    });
    return result;
  } catch (err) {
    console.error(
      "[novu] Failed to upsert subscriber:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/**
 * Standard workflow IDs used in the application.
 * Configure these in your Novu dashboard.
 */
export const NOVU_WORKFLOWS = {
  JOB_ALERT: "job-alert-notification",
  APPLICATION_STATUS: "application-status-update",
  WELCOME: "welcome-notification",
  SUBSCRIPTION_CONFIRMED: "subscription-confirmed",
} as const;
