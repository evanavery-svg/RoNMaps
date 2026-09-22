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

const TOTAL_MISSIONS = 29;

const MISSION_DATA = {
  // Mission 1 — Thank You, Come Again. (Single sheet; white-background blueprint.)
  1: {
    name: "Thank You, Come Again",
    maps: [
      { id: "thank-you-come-again-ground", name: "Ground", src: "assets/maps/ThankYouComeAgain.png", width: 3840, height: 2160 },
    ],
  },

  // Mission 2 — 23 Megabytes a Second.
  2: {
    name: "23 Megabytes a Second",
    maps: [
      { id: "23-megabytes-ground",  name: "Ground",  src: "assets/maps/23MegabytesGround.png", width: 2160, height: 3840 },
      { id: "23-megabytes-floor-1", name: "Floor 1", src: "assets/maps/23MegabytesFloor1.png", width: 2160, height: 3840 },
      { id: "23-megabytes-floor-2", name: "Floor 2", src: "assets/maps/23MegabytesFloor2.png", width: 2160, height: 3840 },
    ],
  },

  // Mission 3 — Twisted Nerve.
  3: {
    name: "Twisted Nerve",
    maps: [
      { id: "twisted-nerve-underground", name: "Underground", src: "assets/maps/TwistedNerveUnderground.png", width: 2160, height: 3840 },
      { id: "twisted-nerve-ground",      name: "Ground",      src: "assets/maps/TwistedNerveGround.png",      width: 2160, height: 3840 },
      { id: "twisted-nerve-floor-1",     name: "Floor 1",     src: "assets/maps/TwistedNerveFloor1.png",     width: 2160, height: 3840 },
      { id: "twisted-nerve-floor-2",     name: "Floor 2",     src: "assets/maps/TwistedNerveFloor2.png",     width: 2160, height: 3840 },
    ],
  },

  // Mission 4 — The Spider.
  4: {
    name: "The Spider",
    maps: [
      { id: "the-spider-ground",  name: "Ground",  src: "assets/maps/TheSpiderGround.png", width: 2160, height: 3840 },
      { id: "the-spider-floor-1", name: "Floor 1", src: "assets/maps/TheSpiderFloor1.png", width: 2160, height: 3840 },
    ],
  },

  // Mission 5 — A Lethal Obsession.
  5: {
    name: "A Lethal Obsession",
    maps: [
      { id: "a-lethal-obsession-ground",  name: "Ground",  src: "assets/maps/ALethalObsessionGround.png", width: 1080, height: 1920 },
      { id: "a-lethal-obsession-floor-1", name: "Floor 1", src: "assets/maps/ALethalObsessionFloor1.png", width: 1080, height: 1920 },
      { id: "a-lethal-obsession-floor-2", name: "Floor 2", src: "assets/maps/ALethalObsessionFloor2.png", width: 1080, height: 1920 },
    ],
  },

  // Mission 6 — Ides of March. (Single sheet.)
  6: {
    name: "Ides of March",
    maps: [
      { id: "ides-of-march-ground", name: "Ground", src: "assets/maps/IdesOfMarch.png", width: 1080, height: 1920 },
    ],
  },

  // Mission 7 — Sinuous Trail (the only one uploaded so far).
  7: {
    name: "Sinuous Trail",
    maps: [
      { id: "sinuous-trail-ground",  name: "Ground",  src: "assets/maps/SinousTrailGround.png",  width: 1080, height: 1920 },
      { id: "sinuous-trail-floor-1", name: "Floor 1", src: "assets/maps/SinuousTrailFloor1.png", width: 1920, height: 1080 },
      { id: "sinuous-trail-floor-2", name: "Floor 2", src: "assets/maps/SinuousTrailFloor2.png", width: 1080, height: 1920 },
    ],
  },

  // Mission 8 — Ends of the Earth.
  8: {
    name: "Ends of the Earth",
    maps: [
      { id: "ends-of-the-earth-ground",  name: "Ground",  src: "assets/maps/EndsOfTheEarthGround.png", width: 1080, height: 1920 },
      { id: "ends-of-the-earth-floor-1", name: "Floor 1", src: "assets/maps/EndsOfTheEarthFloor1.png", width: 1080, height: 1920 },
      { id: "ends-of-the-earth-floor-2", name: "Floor 2", src: "assets/maps/EndsOfTheEarthFloor2.png", width: 1080, height: 1920 },
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

  // Mission 10 — Valley of the Dolls.
  10: {
    name: "Valley of the Dolls",
    maps: [
      { id: "valley-of-the-dolls-underground", name: "Underground", src: "assets/maps/ValleyOfTheDollsUnderground.png", width: 1080, height: 1920 },
      { id: "valley-of-the-dolls-ground",      name: "Ground",      src: "assets/maps/ValleyOfTheDollsGround.png",      width: 1080, height: 1920 },
      { id: "valley-of-the-dolls-floor-1",     name: "Floor 1",     src: "assets/maps/ValleyOfTheDollsFloor1.png",     width: 1080, height: 1920 },
      { id: "valley-of-the-dolls-floor-2",     name: "Floor 2",     src: "assets/maps/ValleyOfTheDollsFloor2.png",     width: 1080, height: 1920 },
    ],
  },

  // Mission 11 — Elephant.
  11: {
    name: "Elephant",
    maps: [
      { id: "elephant-ground",  name: "Ground",  src: "assets/maps/ElephantGround.png", width: 1080, height: 1920 },
      { id: "elephant-floor-1", name: "Floor 1", src: "assets/maps/ElephantFloor1.png", width: 1080, height: 1920 },
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

  // Mission 15 — Buy Cheap, Buy Twice.
  15: {
    name: "Buy Cheap, Buy Twice",
    maps: [
      { id: "buy-cheap-buy-twice-ground",  name: "Ground",  src: "assets/maps/BuyCheapBuyTwiceGround.png", width: 1920, height: 1080 },
      { id: "buy-cheap-buy-twice-floor-1", name: "Floor 1", src: "assets/maps/BuyCheapBuyTwiceFloor1.png", width: 1920, height: 1080 },
    ],
  },

  // Mission 16 — Carriers of the Vine.
  16: {
    name: "Carriers of the Vine",
    maps: [
      { id: "carriers-of-the-vine-underground", name: "Underground", src: "assets/maps/CarriersOfTheVineUnderground.png", width: 1080, height: 1920 },
      { id: "carriers-of-the-vine-ground",      name: "Ground",      src: "assets/maps/CarriersOfTheVineGround.png",      width: 1080, height: 1920 },
      { id: "carriers-of-the-vine-floor-1",     name: "Floor 1",     src: "assets/maps/CarriersOfTheVineFloor1.png",     width: 1080, height: 1920 },
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

  // Mission 18 — Hide and Seek.
  18: {
    name: "Hide and Seek",
    maps: [
      { id: "hide-and-seek-ground",  name: "Ground",  src: "assets/maps/HideAndSeekGround.png", width: 1080, height: 1920 },
      { id: "hide-and-seek-floor-1", name: "Floor 1", src: "assets/maps/HideAndSeekFloor1.png", width: 1080, height: 1920 },
      { id: "hide-and-seek-floor-2", name: "Floor 2", src: "assets/maps/HideAndSeekFloor2.png", width: 1080, height: 1920 },
    ],
  },

  // Mission 19 — Dorms.
  19: {
    name: "Dorms",
    maps: [
      { id: "dorms-ground",  name: "Ground",  src: "assets/maps/DormsGround.png",  width: 3840, height: 2715 },
      { id: "dorms-floor-1", name: "Floor 1", src: "assets/maps/DormsFloor1.png",  width: 3840, height: 2715 },
    ],
  },

  // Mission 20 — Narcos.
  20: {
    name: "Narcos",
    maps: [
      { id: "narcos-ground", name: "Ground", src: "assets/maps/NarcosGround.png", width: 3840, height: 2715 },
    ],
  },

  // Mission 21 — Lawmaker.
  21: {
    name: "Lawmaker",
    maps: [
      { id: "lawmaker-ground",  name: "Ground",  src: "assets/maps/LawmakerGround.png",  width: 3840, height: 2715 },
      { id: "lawmaker-floor-1", name: "Floor 1", src: "assets/maps/LawmakerFloor1.png",  width: 3840, height: 2715 },
      { id: "lawmaker-floor-2", name: "Floor 2", src: "assets/maps/LawmakerFloor2.png",  width: 3840, height: 2715 },
    ],
  },

  // Mission 22 — Mirage at Sea.
  22: {
    name: "Mirage at Sea",
    maps: [
      { id: "mirage-at-sea-engine",  name: "Engine",  src: "assets/maps/MirageAtSeaEngine.png",  width: 3840, height: 2715 },
      { id: "mirage-at-sea-floor-1", name: "Floor 1", src: "assets/maps/MirageAtSeaFloor1.png",  width: 3840, height: 2715 },
      { id: "mirage-at-sea-floor-2", name: "Floor 2", src: "assets/maps/MirageAtSeaFloor2.png",  width: 3840, height: 2715 },
      { id: "mirage-at-sea-floor-3", name: "Floor 3", src: "assets/maps/MirageAtSeaFloor3.png",  width: 3840, height: 2715 },
      { id: "mirage-at-sea-floor-4", name: "Floor 4", src: "assets/maps/MirageAtSeaFloor4.png",  width: 3840, height: 2715 },
    ],
  },

  // Mission 23 — Leviathan.
  23: {
    name: "Leviathan",
    maps: [
      { id: "leviathan-ground",  name: "Ground",  src: "assets/maps/LeviathanGround.png",  width: 3840, height: 2715 },
      { id: "leviathan-floor-1", name: "Floor 1", src: "assets/maps/LeviathanFloor1.png",  width: 3840, height: 2715 },
      { id: "leviathan-floor-2", name: "Floor 2", src: "assets/maps/LeviathanFloor2.png",  width: 3840, height: 2715 },
      { id: "leviathan-floor-3", name: "Floor 3", src: "assets/maps/LeviathanFloor3.png",  width: 3840, height: 2715 },
    ],
  },

  // Mission 24 — 3 Letter Triad.
  24: {
    name: "3 Letter Triad",
    maps: [
      { id: "3-letter-triad-ground",  name: "Ground",  src: "assets/maps/3LetterTriadGround.png",  width: 3840, height: 2715 },
      { id: "3-letter-triad-floor-1", name: "Floor 1", src: "assets/maps/3LetterTriadFloor1.png",  width: 3840, height: 2715 },
    ],
  },

  // Mission 25 — Hunger Strike.
  25: {
    name: "Hunger Strike",
    maps: [
      { id: "hunger-strike-ground",  name: "Ground",  src: "assets/maps/HungerStrikeGround.png",  width: 491, height: 571 },
      { id: "hunger-strike-floor-1", name: "Floor 1", src: "assets/maps/HungerStrikeFloor1.png",  width: 431, height: 587 },
    ],
  },

  // Mission 26 — Stolen Valor.
  26: {
    name: "Stolen Valor",
    maps: [
      { id: "stolen-valor-basement", name: "Basement", src: "assets/maps/StolenValorBasement.png", width: 455, height: 400 },
      { id: "stolen-valor-ground",   name: "Ground",   src: "assets/maps/StolenValorGround.png",   width: 582, height: 495 },
      { id: "stolen-valor-floor-1",  name: "Floor 1",  src: "assets/maps/StolenValorFloor1.png",   width: 382, height: 387 },
    ],
  },
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
