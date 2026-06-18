import { Resend } from "resend";
import type {
  NotificationProviderPlugin,
  NotificationMessage,
  NotificationSendResult,
} from "@ever-hust/plugin";

let client: Resend | null = null;

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!client) client = new Resend(key);
  return client;
}

const FROM = process.env.EMAIL_FROM ?? "alerts@hust.so";

/**
 * Resend email notification provider. Sends a pre-rendered email directly. Use
 * react-email templates upstream and pass the rendered HTML as `message.html`.
 */
export const resendNotificationPlugin: NotificationProviderPlugin = {
  kind: "notification-provider",
  id: "resend",
  label: "Resend (Email)",
  channels: ["email"],
  isConfigured: () => Boolean(process.env.RESEND_API_KEY),
  async send(message: NotificationMessage): Promise<NotificationSendResult> {
    const c = getClient();
    if (!c) return { ok: false, skipped: true, error: "RESEND_API_KEY not configured" };

    const to = message.recipient.email;
    if (!to) return { ok: false, skipped: true, error: "recipient has no email address" };

    try {
      const res = await c.emails.send({
        from: FROM,
        to,
        subject: message.subject ?? "Notification from Hust",
        html: message.html ?? `<p>${message.text ?? ""}</p>`,
        text: message.text ?? undefined,
      });
      return { ok: !res.error, id: res.data?.id ?? null, error: res.error?.message };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};

export default resendNotificationPlugin;
