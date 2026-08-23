/* RoN Maps service worker.
 *
 * Strategy — always run the newest app when online:
 *   - App shell (html/js/css/manifest): NETWORK-FIRST. Fetch fresh on every open,
 *     update the cache, and fall back to cache only when offline.
 *   - Maps + icons: CACHE-FIRST (large, rarely change), with runtime caching.
 *
 * Bump CACHE_VERSION whenever you add/replace maps or want to force-clear old caches. */
const CACHE_VERSION = "ronmaps-v10";

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
  "./assets/maps/SinousTrailGround.png",
  "./assets/maps/SinuousTrailFloor1.png",
  "./assets/maps/SinuousTrailFloor2.png",
  "./assets/maps/GreasedPalmsGround.png",
  "./assets/maps/GreasedPalmsFloor1.png",
  "./assets/maps/RustBeltUnderGround.png",
  "./assets/maps/RustBeltGround.png",
  "./assets/maps/SinsOfTheFatherFloor1.png",
  "./assets/maps/SinsOfTheFatherFloor2.png",
  "./assets/maps/SinsOfTheFatherRoof.png",
];

// App-shell requests get the network-first treatment.
function isShell(url) {
  if (url.pathname.endsWith("/")) return true;
  return /\.(html|js|css|webmanifest|json)$/.test(url.pathname);
}

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

// Allow the page to tell a waiting worker to take over immediately.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for the app shell + navigations → always newest when online.
  // Use cache:"no-store" so we bypass the browser's HTTP cache and truly hit the
  // network (GitHub Pages sets max-age, which would otherwise serve a stale shell).
  if (req.mode === "navigate" || isShell(url)) {
    event.respondWith(
      fetch(url.pathname + url.search, { cache: "no-store", credentials: "same-origin" })
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match("./index.html"))
        )
    );
    return;
  }

  // Cache-first for everything else (maps, icons).
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
