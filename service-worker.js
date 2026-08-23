/* RoN Maps service worker — offline app shell + cached maps.
 * Bump CACHE_VERSION whenever you change the app shell or add/replace maps. */
const CACHE_VERSION = "ronmaps-v2";

const CACHE_ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/maps.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  // --- map images (keep in sync with js/maps.js) ---
  "./assets/maps/sinuous-trail-ground.png",
  "./assets/maps/sinuous-trail-floor-1.png",
  "./assets/maps/sinuous-trail-floor-2.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      // best-effort: don't fail the whole install if one asset is missing
      Promise.allSettled(CACHE_ASSETS.map((a) => cache.add(a)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Cache-first for same-origin GETs, with runtime caching of newly added maps.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
