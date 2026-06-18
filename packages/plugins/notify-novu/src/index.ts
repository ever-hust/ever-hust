import { Novu } from "@novu/api";
import type {
  NotificationProviderPlugin,
  NotificationMessage,
  NotificationSendResult,
} from "@ever-hust/plugin";

let client: Novu | null = null;

function getClient(): Novu | null {
  const key = process.env.NOVU_API_KEY;
  if (!key) return null;
  if (!client) client = new Novu({ secretKey: key });
  return client;
}

/**
 * Novu notification provider — multi-channel (email, push, in-app) via Novu
 * workflows. `message.event` maps to a Novu workflow id; `payload` is
 * interpolated into the workflow's templates.
 */
export const novuNotificationPlugin: NotificationProviderPlugin = {
  kind: "notification-provider",
  id: "novu",
  label: "Novu (Email · Push · In-app)",
  channels: ["email", "push", "in_app"],
  isConfigured: () => Boolean(process.env.NOVU_API_KEY),
  async send(message: NotificationMessage): Promise<NotificationSendResult> {
    const c = getClient();
    if (!c) return { ok: false, skipped: true, error: "NOVU_API_KEY not configured" };

    try {
      const result = await c.trigger({
        workflowId: message.event,
        to: { subscriberId: message.recipient.subscriberId },
        payload: message.payload ?? {},
        ...(message.overrides ? { overrides: message.overrides } : {}),
      });
      const id =
        (result as { transactionId?: string; result?: { transactionId?: string } })
          ?.transactionId ??
        (result as { result?: { transactionId?: string } })?.result?.transactionId ??
        null;
      return { ok: true, id };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};

export default novuNotificationPlugin;
