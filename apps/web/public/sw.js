// Ever Jobs - Service Worker for PWA Support
// This provides basic offline caching and fast loading

const CACHE_NAME = "ever-jobs-v1";
const OFFLINE_URL = "/offline";

// Assets to cache immediately on install
const PRECACHE_ASSETS = ["/manifest.json"];

// Install: cache critical assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch: Network-first strategy for API calls,
// Cache-first for static assets
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // Skip API calls and auth routes — always go to network
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.includes("_next/data")
  ) {
    return;
  }

  // For navigation requests (HTML pages): network-first
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL))
      )
    );
    return;
  }

  // For static assets (_next/static, images, fonts): cache-first
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp|woff2?|ttf|eot)$/)
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            // Only cache successful responses
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
            }
            return response;
          })
      )
    );
    return;
  }
});

// Push: handle incoming push notifications
self.addEventListener("push", (event) => {
  let payload = {};

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      // Fallback: treat the payload as plain text
      payload = { title: "Ever Jobs", body: event.data.text() };
    }
  }

  const title = payload.title || "Ever Jobs";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icons/icon-192x192.png",
    badge: payload.badge || "/icons/icon-192x192.png",
    tag: payload.tag || "ever-jobs-notification",
    data: {
      url: (payload.data && payload.data.url) || payload.url || "/",
    },
  };

  event.waitUntil(
    self.registration.showNotification(title, options).catch((err) => {
      console.warn("[sw] showNotification failed:", err);
    })
  );
});

// Notification click: open or focus the relevant page
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // Validate URL to prevent open-redirect via malicious push payloads
  let targetUrl = "/";
  const rawUrl = (event.notification.data && event.notification.data.url) || "/";
  if (rawUrl.startsWith("/") && !rawUrl.startsWith("//")) {
    targetUrl = rawUrl;
  } else {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.origin === self.location.origin) {
        targetUrl = parsed.pathname + parsed.search;
      }
    } catch {
      // Invalid URL — fall back to root
    }
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // If an existing window matches the target URL, focus it
        for (const client of clientList) {
          const clientUrl = new URL(client.url);
          const clientPath = clientUrl.pathname + clientUrl.search;
          if (clientPath === targetUrl && "focus" in client) {
            return client.focus();
          }
        }
        // Otherwise open a new window
        return self.clients.openWindow(targetUrl);
      })
  );
});
