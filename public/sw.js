// Bump this string whenever the caching strategy below changes — it names the
// caches, so a bump makes activate() below clean out anything from the old
// version rather than serving stale entries under the new logic forever.
const CACHE_VERSION = "v3";
const STATIC_CACHE = `matrix-static-${CACHE_VERSION}`;
const API_CACHE = `matrix-api-${CACHE_VERSION}`;
const OFFLINE_URL = "/dashboard/offline";

// Shell routes worth having available with zero network — enough that a cold
// offline load isn't a bare browser error page. The dashboard HTML and key
// static chunks are added to this cache on first visit (see fetch listener below).
const PRECACHE_URLS = [OFFLINE_URL, "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== STATIC_CACHE && k !== API_CACHE).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icon") ||
    url.pathname === "/manifest.webmanifest" ||
    /\.(?:png|jpg|jpeg|svg|webp|woff2?|css|ico)$/.test(url.pathname)
  );
}

// CacheFirst — static build assets are content-hashed by Next.js, so a cached
// copy is never stale; only hit the network the first time it's requested.
async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) {
    const cache = await caches.open(cacheName);
    cache.put(req, res.clone());
  }
  return res;
}

// StaleWhileRevalidate — return cached copy instantly, then refresh in
// background. Best for API data that should feel instant but stay fresh.
async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);

  const fetchPromise = fetch(req)
    .then(async (res) => {
      if (res.ok && !new URL(req.url).search) {
        cache.put(req, res.clone());
      }
      return res;
    })
    .catch(() => cached);

  // Return cached immediately if available, otherwise wait for network.
  return cached || fetchPromise;
}

// NetworkFirst — always prefer fresh data; cache is a resilience fallback.
// Query-string requests are never cached: search endpoints mint an unbounded
// set of distinct URLs (one per keystroke), and the Cache API has no eviction.
async function networkFirst(req, cacheName) {
  try {
    const res = await fetch(req);
    if (res.ok && !new URL(req.url).search) {
      const cache = await caches.open(cacheName);
      cache.put(req, res.clone());
    }
    return res;
  } catch (err) {
    const cached = await caches.match(req);
    if (cached) return cached;
    throw err;
  }
}

async function navigationHandler(req) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    const cached = await caches.match(req);
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
    return Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Never intercept cross-origin or non-GET requests — mutations must always
  // reach the network live, and other origins aren't ours to cache.
  if (url.origin !== self.location.origin || req.method !== "GET") return;

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // Dashboard shell HTML — also pre-cache so offline loads feel instant.
  if (url.pathname === "/dashboard" || url.pathname === "/dashboard/") {
    event.respondWith(staleWhileRevalidate(req, STATIC_CACHE));
    return;
  }

  // API routes: StaleWhileRevalidate for read endpoints (instant loads),
  // except for real-time / keystroke-dependent paths that still use NetworkFirst.
  if (url.pathname.startsWith("/api/")) {
    // Real-time / query-heavy endpoints: always network-first.
    if (
      url.pathname.startsWith("/api/sessions/") ||
      url.pathname.startsWith("/api/ai/") ||
      url.pathname.includes("/search")
    ) {
      event.respondWith(networkFirst(req, API_CACHE));
      return;
    }
    // Read-heavy list endpoints: stale-while-revalidate for speed.
    event.respondWith(staleWhileRevalidate(req, API_CACHE));
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(navigationHandler(req));
  }
});

// ── Push notifications ──────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "Matrix Dash", body: event.data.text() };
  }
  event.waitUntil(
    (async () => {
      // Update app badge if supported (shows unread count on the Home Screen icon).
      if (self.registration.setAppBadge) {
        try {
          const count = data.unreadCount || (data.body ? 1 : 0);
          if (count > 0) await self.registration.setAppBadge(count);
        } catch {
          /* Badge API not available in this browser — harmless. */
        }
      }

      return self.registration.showNotification(data.title || "Matrix Dash", {
        body: data.body || "",
        icon: "/icon.svg",
        badge: "/icon.svg",
        data: { url: data.href || "/dashboard" },
        tag: data.tag || "matrix-dash", // collapses duplicate notifications
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // Clear the app badge when the user taps a notification.
  if (self.registration.clearAppBadge) {
    event.waitUntil(self.registration.clearAppBadge());
  }

  const url = event.notification.data?.url || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      // Focus an existing window if one is already open.
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.focus();
          return client.navigate(url);
        }
      }
      // Otherwise, open a new one.
      return self.clients.openWindow(url);
    })
  );
});
