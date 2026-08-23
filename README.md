# RoN Maps — Sinuous Trail

A dead-simple, installable **PWA** for marking cleared rooms on the *Ready or Not*
**Sinuous Trail** mission blueprints. Tap a room to stamp an **X**; each X is a real object
you can select, recolor, and resize. Works with touch (phone/tablet) and mouse (Windows).

> Currently scoped to the **Sinuous Trail** mission and its **black-and-white** blueprints.
> More missions/maps drop in later via one manifest file.

## Features
- **Tap to stamp an X** where you cleared a room (default tool).
- **Select & resize** any X — tap it, then use the size slider or drag the corner handle.
- **Color** picker + quick preset swatches. Changing color also recolors the selected X.
- **Eraser** — tap an X to remove it.
- **Undo** and **Reset** (clear all on the current map).
- **Zoom & pan** — pinch or mouse-wheel to zoom, drag to pan; **Fit** button re-centers.
- **Saved per map** in your browser (localStorage) — marks survive refresh/close.
- **Installable & offline** — "Add to Home Screen"; app shell + maps are cached.

## Add the real maps
The app ships with two labeled **placeholder** floors so it runs immediately. To use the real
black-and-white blueprints:

1. Put each image in `assets/maps/` (PNG, JPG, or SVG).
2. Edit **`js/maps.js`** — one entry per floor:
   ```js
   {
     id: "sinuous-trail-floor-1",   // unique; used as the save key
     mission: "Sinuous Trail",      // groups floors in the picker
     name: "Ground Floor",          // shown in the picker
     src: "assets/maps/ground.png", // path under assets/maps/
     width: 2048, height: 1536      // the image's natural pixel size
   }
   ```
   (If you don't know the pixel size, leave `width`/`height` out — the app reads it from the
   loaded image. Setting them explicitly is best.)
3. Add the same `src` paths to `CACHE_ASSETS` in **`service-worker.js`** and bump
   `CACHE_VERSION` so the new maps cache for offline use.

Adding a whole new mission later = just keep appending entries with a different `mission`.

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
- `S` stamp · `E` eraser · `Ctrl/Cmd+Z` undo · `Delete`/`Backspace` remove selected X.
