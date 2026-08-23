// Map manifest for Ready or Not — Sinuous Trail mission.
//
// Only the black-and-white blueprints are listed here. To add the real maps:
//   1. Drop the image file into assets/maps/  (PNG/JPG/SVG all work)
//   2. Add/replace an entry below with its id, floor name, filename, and pixel size
//   3. Add the same path to CACHE_ASSETS in service-worker.js so it works offline
//
// `width`/`height` should match the image's natural pixel dimensions. They define the
// coordinate space that markers are stored in, so marks stay locked to the map on any
// screen. (If you don't know them, the app falls back to the image's loaded size.)
//
// To add a whole new mission later, just keep adding entries — the `mission` field groups
// them in the map picker.

const MAPS = [
  {
    id: "sinuous-trail-floor-1",
    mission: "Sinuous Trail",
    name: "Floor 1",
    src: "assets/maps/placeholder-floor-1.svg",
    width: 1600,
    height: 1200,
  },
  {
    id: "sinuous-trail-floor-2",
    mission: "Sinuous Trail",
    name: "Floor 2",
    src: "assets/maps/placeholder-floor-2.svg",
    width: 1600,
    height: 1200,
  },
];
