// Bump this string whenever the caching strategy below changes — it names the
// caches, so a bump makes activate() below clean out anything from the old
// version rather than serving stale entries under the new logic forever.
const CACHE_VERSION = "v2";
const STATIC_CACHE = `matrix-static-${CACHE_VERSION}`;
const API_CACHE = `matrix-api-${CACHE_VERSION}`;
const OFFLINE_URL = "/dashboard/offline";

// A small, stable set of shell routes worth having available with zero
// network at all — not an attempt to precache the whole (dynamic, per-user)
// app, just enough that a cold offline load isn't a bare browser error page.
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

// NetworkFirst — the local SQLite DB behind these routes is the live source of
// truth and changes constantly, so always prefer a fresh response; a cached
// copy is a resilience fallback for a dropped connection, never the default.
// Query-string requests are never cached: search endpoints mint an unbounded
// set of distinct URLs (one per keystroke), and the Cache API has no eviction,
// so caching them grows storage forever for entries that are never re-hit.
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
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(req, API_CACHE));
    return;
  }
  if (req.mode === "navigate") {
    event.respondWith(navigationHandler(req));
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "Matrix Dash", body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Matrix Dash", {
      body: data.body || "",
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: data.href || "/dashboard" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard";
  event.waitUntil(self.clients.openWindow(url));
});
