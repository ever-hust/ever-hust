"use client";

import { useState, useCallback, useEffect } from "react";

/**
 * Convert a base64-encoded VAPID public key to a Uint8Array
 * suitable for `applicationServerKey` in PushManager.subscribe().
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type PushNotificationState =
  | "unsupported"
  | "loading"
  | "prompt"
  | "subscribed"
  | "denied"
  | "error";

interface UsePushNotificationsReturn {
  /** Current subscription state */
  state: PushNotificationState;
  /** Whether the browser supports push notifications */
  isSupported: boolean;
  /** Subscribe to push notifications */
  subscribe: () => Promise<void>;
  /** Unsubscribe from push notifications */
  unsubscribe: () => Promise<void>;
  /** Error message if state is "error" */
  error: string | null;
}

/**
 * Hook for managing Web Push notification subscriptions.
 *
 * - Checks browser support for Push API and service workers
 * - Manages subscription lifecycle (subscribe / unsubscribe)
 * - Persists subscriptions to the server via /api/push/subscribe
 * - Uses VAPID public key from NEXT_PUBLIC_VAPID_PUBLIC_KEY env var
 */
export function usePushNotifications(): UsePushNotificationsReturn {
  const [state, setState] = useState<PushNotificationState>("loading");
  const [error, setError] = useState<string | null>(null);

  const isSupported =
    typeof window !== "undefined" &&
    "PushManager" in window &&
    "serviceWorker" in navigator &&
    "Notification" in window;

  // Check initial subscription state on mount
  useEffect(() => {
    if (!isSupported) {
      setState("unsupported");
      return;
    }

    async function checkSubscription() {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();

        if (subscription) {
          setState("subscribed");
        } else if (Notification.permission === "denied") {
          setState("denied");
        } else {
          setState("prompt");
        }
      } catch (err) {
        console.warn(
          "[usePushNotifications] Failed to check subscription:",
          err instanceof Error ? err.message : err,
        );
        setState("error");
        setError("Failed to check notification status");
      }
    }

    checkSubscription();
  }, [isSupported]);

  const subscribe = useCallback(async () => {
    if (!isSupported) return;

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      setState("error");
      setError("Push notifications are not configured");
      return;
    }

    setState("loading");
    setError(null);

    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setState("denied");
        return;
      }
      if (permission !== "granted") {
        setState("prompt");
        return;
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      // Extract keys
      const subscriptionJson = subscription.toJSON();
      const keys = subscriptionJson.keys as
        | { p256dh: string; auth: string }
        | undefined;

      if (!keys?.p256dh || !keys?.auth) {
        // Unsubscribe locally since we can't save without keys
        await subscription.unsubscribe().catch(() => {});
        throw new Error("Push subscription keys are missing");
      }

      // Send to server
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: {
            p256dh: keys.p256dh,
            auth: keys.auth,
          },
        }),
      });

      if (!res.ok) {
        // Unsubscribe locally — server doesn't know about us, so the local
        // subscription would be orphaned (UI shows "subscribed" but no
        // notifications would actually arrive).
        await subscription.unsubscribe().catch(() => {});
        throw new Error("Failed to save subscription on server");
      }

      setState("subscribed");
    } catch (err) {
      console.error(
        "[usePushNotifications] Subscribe failed:",
        err instanceof Error ? err.message : err,
      );
      setState("error");
      setError(
        err instanceof Error ? err.message : "Failed to enable notifications",
      );
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported) return;

    setState("loading");
    setError(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Remove from server first
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });

        // Then unsubscribe locally
        await subscription.unsubscribe();
      }

      setState("prompt");
    } catch (err) {
      console.error(
        "[usePushNotifications] Unsubscribe failed:",
        err instanceof Error ? err.message : err,
      );
      setState("error");
      setError(
        err instanceof Error
          ? err.message
          : "Failed to disable notifications",
      );
    }
  }, [isSupported]);

  return {
    state,
    isSupported,
    subscribe,
    unsubscribe,
    error,
  };
}
