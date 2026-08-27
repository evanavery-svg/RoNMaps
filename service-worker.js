/* RoN Maps service worker.
 *
 * Two caches, on purpose:
 *   - SHELL_CACHE  (versioned): html/js/css/manifest/icons. NETWORK-FIRST, so the app is
 *     always the newest build when online, falling back to cache offline. Bumping its
 *     version is cheap — only a few hundred KB.
 *   - MAPS_CACHE   (stable, unversioned): the blueprints. CACHE-FIRST. Deliberately NOT
 *     tied to the shell version: the maps are ~10 MB and growing toward ~20 MB at all 26
 *     missions, and wiping them on every code change would re-download the lot each time.
 *     Maps are content-addressed by filename, so a changed map means a new filename.
 *
 * Bump SHELL_VERSION for any app change. Bump MAPS_VERSION only if a map file is REPLACED
 * in place under the same name (rare) and you need clients to re-fetch it. */
const SHELL_VERSION = "v26";
const MAPS_VERSION = "v1";
const SHELL_CACHE = "ronmaps-shell-" + SHELL_VERSION;
const MAPS_CACHE = "ronmaps-maps-" + MAPS_VERSION;

const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/maps.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

// --- map images (keep in sync with js/maps.js) ---
const MAP_ASSETS = [
  "./assets/maps/ThankYouComeAgain.png",
  "./assets/maps/23MegabytesGround.png",
  "./assets/maps/23MegabytesFloor1.png",
  "./assets/maps/23MegabytesFloor2.png",
  "./assets/maps/TwistedNerveUnderground.png",
  "./assets/maps/TwistedNerveGround.png",
  "./assets/maps/TwistedNerveFloor1.png",
  "./assets/maps/TwistedNerveFloor2.png",
  "./assets/maps/TheSpiderGround.png",
  "./assets/maps/TheSpiderFloor1.png",
  "./assets/maps/ALethalObsessionGround.png",
  "./assets/maps/ALethalObsessionFloor1.png",
  "./assets/maps/ALethalObsessionFloor2.png",
  "./assets/maps/IdesOfMarch.png",
  "./assets/maps/SinousTrailGround.png",
  "./assets/maps/SinuousTrailFloor1.png",
  "./assets/maps/SinuousTrailFloor2.png",
  "./assets/maps/EndsOfTheEarthGround.png",
  "./assets/maps/EndsOfTheEarthFloor1.png",
  "./assets/maps/EndsOfTheEarthFloor2.png",
  "./assets/maps/GreasedPalmsGround.png",
  "./assets/maps/GreasedPalmsFloor1.png",
  "./assets/maps/RustBeltUnderGround.png",
  "./assets/maps/RustBeltGround.png",
  "./assets/maps/SinsOfTheFatherFloor1.png",
  "./assets/maps/SinsOfTheFatherFloor2.png",
  "./assets/maps/SinsOfTheFatherRoof.png",
  "./assets/maps/NeonTombGround.png",
  "./assets/maps/NeonTombFloor1.png",
  "./assets/maps/BuyCheapBuyTwiceGround.png",
  "./assets/maps/BuyCheapBuyTwiceFloor1.png",
  "./assets/maps/RelapseGround.png",
  "./assets/maps/RelapseFloor1.png",
  "./assets/maps/RelapseFloor2.png",
  "./assets/maps/ValleyOfTheDollsUnderground.png",
  "./assets/maps/ValleyOfTheDollsGround.png",
  "./assets/maps/ValleyOfTheDollsFloor1.png",
  "./assets/maps/ValleyOfTheDollsFloor2.png",
  "./assets/maps/ElephantGround.png",
  "./assets/maps/ElephantFloor1.png",
  "./assets/maps/CarriersOfTheVineUnderground.png",
  "./assets/maps/CarriersOfTheVineGround.png",
  "./assets/maps/CarriersOfTheVineFloor1.png",
  "./assets/maps/HideAndSeekGround.png",
  "./assets/maps/HideAndSeekFloor1.png",
  "./assets/maps/HideAndSeekFloor2.png",
];

// App-shell requests get the network-first treatment.
function isShell(url) {
  if (url.pathname.endsWith("/")) return true;
  return /\.(html|js|css|webmanifest|json)$/.test(url.pathname);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      // best-effort: don't fail the whole install if one asset is missing
      caches.open(SHELL_CACHE).then((c) => Promise.allSettled(SHELL_ASSETS.map((a) => c.add(a)))),
      caches.open(MAPS_CACHE).then((c) =>
        // only fetch maps we don't already have, so an app update doesn't re-download them
        Promise.allSettled(MAP_ASSETS.map((a) =>
          c.match(a).then((hit) => (hit ? null : c.add(a)))
        ))
      ),
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          // drop stale SHELL caches only — the maps cache is intentionally preserved
          .filter((k) => k.startsWith("ronmaps-") && k !== SHELL_CACHE && k !== MAPS_CACHE)
          .map((k) => caches.delete(k))
      )
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
            caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match("./index.html"))
        )
    );
    return;
  }

  // Cache-first for everything else (maps, icons) — checks both caches via caches.match.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          const target = /\/assets\/maps\//.test(url.pathname) ? MAPS_CACHE : SHELL_CACHE;
          caches.open(target).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
