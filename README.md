# RoN Maps — Sinuous Trail

A dead-simple, installable **PWA** for marking cleared rooms on *Ready or Not* mission
blueprints. Start on the **mission hub**, pick a mission, then tap a room to stamp an **X**.
Each X is a real object you can select, recolor, and resize. Works with touch (phone/tablet)
and mouse (Windows).

> The hub has all **26 missions**. Only **Sinuous Trail (Mission 7)** has maps so far —
> the rest show as "Coming soon" until you add them. Everything is driven by one file
> (`js/maps.js`), so adding a mission is just an entry + some image files.

## Features
- **Tap to stamp an X** where you cleared a room (default tool).
- **Select & resize** any X — tap it, then use the size slider or drag the corner handle.
- **Color** picker + quick preset swatches. Changing color also recolors the selected X.
- **Eraser** — tap an X to remove it.
- **Undo** and **Reset** (clear all on the current map).
- **Zoom & pan** — pinch or mouse-wheel to zoom, drag to pan; **Fit** button re-centers.
- **Saved per map** in your browser (localStorage) — marks survive refresh/close.
- **Installable & offline** — "Add to Home Screen"; app shell + maps are cached.

## Swap in the real Sinuous Trail maps
Sinuous Trail ships with three labeled **placeholder** floors so the app runs immediately.
To use the real blueprints, just **overwrite the placeholder files** with your images —
same names, no code changes:

- `assets/maps/sinuous-trail-ground.png`
- `assets/maps/sinuous-trail-floor-1.png`
- `assets/maps/sinuous-trail-floor-2.png`

(If you'd rather keep `.jpg`, drop the `.jpg` in and change that floor's `src` in
`js/maps.js` to match.)

## Add another mission
1. Put its images in `assets/maps/`.
2. In **`js/maps.js`**, add an entry to `MISSION_DATA`, keyed by the mission number (1–26):
   ```js
   12: {
     name: "Mission Name",
     maps: [
       { id: "mission-12-ground",  name: "Ground",  src: "assets/maps/mission-12-ground.png" },
       { id: "mission-12-floor-1", name: "Floor 1", src: "assets/maps/mission-12-floor-1.png" },
     ],
   },
   ```
   - `id` must be unique (it's the per-map save key for your marks).
   - `name` is the floor label; list floors in the order you want.
   - `width`/`height` are optional — omit them and the app uses the image's natural size.
3. Add the same `src` paths to `CACHE_ASSETS` in **`service-worker.js`** and bump
   `CACHE_VERSION` so the new maps cache for offline use.

That mission's card turns from "Coming soon" to playable in the hub automatically.

## Run locally
A service worker needs a real origin, so open it over HTTP, not `file://`:
```bash
cd RoNMaps
python3 -m http.server 8080
# then open http://localhost:8080
```

## Deploy (GitHub Pages)
1. Merge this branch to `main`.
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The included workflow (`.github/workflows/deploy.yml`) publishes the site on every push
   to `main`. Open the Pages URL on your phone and **Add to Home Screen** to install it.

All asset paths are relative, so it works from the `/<repo>/` Pages subpath.

## Keyboard shortcuts (desktop)
- `S` stamp · `E` eraser · `Ctrl/Cmd+Z` undo · `Delete`/`Backspace` remove selected X ·
  `Esc` back to the mission hub.
