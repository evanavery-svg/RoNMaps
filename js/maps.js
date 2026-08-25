// Mission + map manifest for Ready or Not.
//
// There are 26 missions total. Only the ones you've added maps for are playable in the hub;
// the rest show as "Coming soon" until you fill them in.
//
// ---------------------------------------------------------------------------
// TO ADD A MISSION'S MAPS:
//   1. Drop the image files into assets/maps/  (PNG or JPG)
//   2. Add an entry to MISSION_DATA below, keyed by the mission's number (1-26):
//
//        12: {
//          name: "Mission Name",
//          maps: [
//            { id: "mission-12-ground", name: "Ground", src: "assets/maps/mission-12-ground.png" },
//            { id: "mission-12-floor-1", name: "Floor 1", src: "assets/maps/mission-12-floor-1.png" },
//          ],
//        },
//
//   3. Add the same src paths to CACHE_ASSETS in service-worker.js and bump CACHE_VERSION
//      so they work offline.
//
// Notes:
//   - `id` must be unique (it's the per-map save key for your X marks).
//   - `name` is the floor label shown in the picker; list floors in the order you want.
//   - width/height are optional — if omitted, the app reads the image's natural pixel size.
//     Marks are stored in that pixel space, so keep an image's size stable once you've marked on it.
// ---------------------------------------------------------------------------

const TOTAL_MISSIONS = 26;

const MISSION_DATA = {
  // Mission 7 — Sinuous Trail (the only one uploaded so far).
  7: {
    name: "Sinuous Trail",
    maps: [
      { id: "sinuous-trail-ground",  name: "Ground",  src: "assets/maps/SinousTrailGround.png",  width: 1080, height: 1920 },
      { id: "sinuous-trail-floor-1", name: "Floor 1", src: "assets/maps/SinuousTrailFloor1.png", width: 1920, height: 1080 },
      { id: "sinuous-trail-floor-2", name: "Floor 2", src: "assets/maps/SinuousTrailFloor2.png", width: 1080, height: 1920 },
    ],
  },

  // Mission 9 — Greased Palms.
  9: {
    name: "Greased Palms",
    maps: [
      { id: "greased-palms-ground",  name: "Ground",  src: "assets/maps/GreasedPalmsGround.png", width: 1080, height: 1920 },
      { id: "greased-palms-floor-1", name: "Floor 1", src: "assets/maps/GreasedPalmsFloor1.png", width: 1080, height: 1920 },
    ],
  },

  // Mission 12 — Rust Belt.
  12: {
    name: "Rust Belt",
    maps: [
      { id: "rust-belt-underground", name: "Underground", src: "assets/maps/RustBeltUnderGround.png", width: 1080, height: 1920 },
      { id: "rust-belt-ground",      name: "Ground",      src: "assets/maps/RustBeltGround.png",      width: 1080, height: 1920 },
    ],
  },

  // Mission 13 — Sins of the Father.
  13: {
    name: "Sins of the Father",
    maps: [
      { id: "sins-of-the-father-floor-1", name: "Floor 1", src: "assets/maps/SinsOfTheFatherFloor1.png", width: 1080, height: 1920 },
      { id: "sins-of-the-father-floor-2", name: "Floor 2", src: "assets/maps/SinsOfTheFatherFloor2.png", width: 1080, height: 1920 },
      { id: "sins-of-the-father-roof",    name: "Roof",    src: "assets/maps/SinsOfTheFatherRoof.png",    width: 1080, height: 1920 },
    ],
  },

  // Mission 14 — Neon Tomb.
  14: {
    name: "Neon Tomb",
    maps: [
      { id: "neon-tomb-ground",  name: "Ground",  src: "assets/maps/NeonTombGround.png", width: 1080, height: 1920 },
      { id: "neon-tomb-floor-1", name: "Floor 1", src: "assets/maps/NeonTombFloor1.png", width: 1080, height: 1920 },
    ],
  },

  // Mission 17 — Relapse. (Landscape blueprints, unlike most of the others.)
  17: {
    name: "Relapse",
    maps: [
      { id: "relapse-ground",  name: "Ground",  src: "assets/maps/RelapseGround.png", width: 1920, height: 1080 },
      { id: "relapse-floor-1", name: "Floor 1", src: "assets/maps/RelapseFloor1.png", width: 1920, height: 1080 },
      { id: "relapse-floor-2", name: "Floor 2", src: "assets/maps/RelapseFloor2.png", width: 1920, height: 1080 },
    ],
  },

  // Add more missions here as you upload them, e.g.:
  // 1:  { name: "…", maps: [ … ] },
  //
  // You can also NAME a mission before you have its maps — just give it a name and no maps:
  //   3:  { name: "Twisted Nerve" },
  // It shows in the hub with its real name but stays "Coming soon" (locked) until you add maps.
};

// Build the full list of 26 mission slots. Slots without data show as "Coming soon".
const MISSIONS = [];
for (let n = 1; n <= TOTAL_MISSIONS; n++) {
  const d = MISSION_DATA[n] || {};
  MISSIONS.push({
    number: n,
    id: d.id || ("mission-" + n),
    name: d.name || "",
    maps: (d.maps || []).slice(),
  });
}
