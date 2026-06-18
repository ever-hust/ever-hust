import type {
  NotificationProviderPlugin,
  NotificationMessage,
  NotificationSendResult,
} from "@ever-hust/plugin";
import { novuNotificationPlugin } from "@ever-hust/plugin-notify-novu";
import { resendNotificationPlugin } from "@ever-hust/plugin-notify-resend";

export type { NotificationMessage, NotificationSendResult } from "@ever-hust/plugin";

/**
 * Notification provider registry. Adding a provider = drop a package under
 * packages/plugins/notify-* and register it here (workspace rule: "pluggable
 * features = plugins"). Order = preference: Novu first (multi-channel via
 * workflows), then Resend (direct email fallback).
 */
export const NOTIFICATION_PROVIDERS: NotificationProviderPlugin[] = [
  novuNotificationPlugin,
  resendNotificationPlugin,
];

export interface NotifyResult {
  provider: string;
  result: NotificationSendResult;
}

/**
 * Dispatch a notification through the first configured provider that succeeds.
 * Never throws — returns the per-provider attempts so callers can log. Degrades
 * gracefully to a no-op when nothing is configured.
 */
export async function notify(message: NotificationMessage): Promise<NotifyResult[]> {
  const attempts: NotifyResult[] = [];
  for (const provider of NOTIFICATION_PROVIDERS) {
    if (!provider.isConfigured()) continue;
    const result = await provider.send(message);
    attempts.push({ provider: provider.id, result });
    if (result.ok) break; // first successful provider wins
  }
  return attempts;
}

/**
 * Send via Novu specifically (multi-channel workflow). Used by the existing
 * workflow-based notifications so they flow through the Novu plugin rather than
 * a hardcoded client.
 */
export async function notifyNovu(message: NotificationMessage): Promise<NotificationSendResult> {
  if (!novuNotificationPlugin.isConfigured()) {
    return { ok: false, skipped: true, error: "NOVU_API_KEY not configured" };
  }
  return novuNotificationPlugin.send(message);
}
