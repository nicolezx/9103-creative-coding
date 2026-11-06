// ── PALETTE DATA ───────────────────────────────────────────────────────────────
//
// Every colour is [hue 0–360, saturation 0–100, brightness 0–100] (HSB), kept as
// plain numbers so channels can be read/shifted before p5's color() is called.
// Blending happens in OKLab inside time.js; these arrays are storage only.
//
// Roles (same keys in every structure below):
//   sky, skyLow, bush, trunk, road, rut, grass, leaf, flower
//   (sky = top of the sky, skyLow = at the horizon; drawn as a gradient)
//
// How the two structures combine (see time.js):
//   1. TIME_KEYFRAMES are blended by time of day.
//   2. The selected weather set's difference from `dry` is added on top,
//      faded out at night because the reference paintings are all daytime.
//   No palette is stored per weather × time combination (AGENTS.md §4).
//
// TODO: migrate to config.js once that file exists (see AGENTS.md §6).
// ──────────────────────────────────────────────────────────────────────────────

// One base palette per weather condition, each sampled from a single painting
// so its colours stay a coherent set (never mix roles across paintings).
// `rain` 0 → 1 runs dry → overcast → wet (stops in time.js).
const WEATHER_SETS = {
  dry: {
    source: "31-may-no-2", // painting title/date sampled from
    base: {
      sky: [201.1, 35.3, 97.6], // #A1DAF9
      skyLow: [195, 22.9, 96.1], // #BDE7F5
      bush: [90, 69.4, 75.7], // #7EC13B
      trunk: [2.6, 45.1, 80], // #CC7470
      road: [321.6, 10.1, 96.9], // #F7DEEE
      rut: [319.4, 43.4, 86.7], // #DD7DBE
      grass: [98.9, 64.3, 78], // #74C747
      leaf: [143.3, 89.1, 64.7], // #12A54B
      flower: [61.1, 21.5, 98.4], // #FAFBC5
    },
  },
  overcast: {
    source: "17-april",
    base: {
      sky: [210, 13.7, 97.3], // #D6E7F8
      skyLow: [242.7, 9.5, 90.6], // #D2D1E7
      bush: [151, 91, 39.2], // #096438
      trunk: [58.5, 29.5, 54.5], // #8B8A62
      road: [56, 7.2, 81.2], // #CFCEC0
      rut: [58.5, 20.3, 75.3], // #C0BF99
      grass: [133.2, 79.2, 71.8], // #26B746
      leaf: [72.2, 98.6, 85.9], // #AFDB03
      flower: [60, 16.9, 92.9], // #EDEDC5
    },
  },
  wet: {
    source: "18-december",
    base: {
      sky: [200, 2.5, 95.3], // #EDF1F3
      skyLow: [12, 2.2, 89.8], // #E5E1E0
      bush: [108, 20.5, 28.6], // #3D493A
      trunk: [19.7, 59.3, 46.3], // #764730
      road: [19, 36.6, 43.9], // #705447
      rut: [24.3, 39.4, 36.9], // #5E4839
      grass: [126.9, 47.3, 50.6], // #44814B
      leaf: [117, 43.5, 54.1], // #518A4E
      flower: [61.4, 18.9, 91.4], // #E8E9BD
    },
  },
  // VARIANTS (later): add `variants: { role: [[h, s, b], ...] }` beside `base`
  // in each set. Use the same count per role in every set, sorted light → dark,
  // so a mark's chosen index means the same thing in every condition.
};

// Array order for every role: [Day, GoldenHour, Dusk, Night]
//   Day        = 12:00 noon (taken from the dry painting, the daytime baseline)
//   GoldenHour = 09:00 morning / 15:00 afternoon
//   Dusk       = 06:00 pre-dawn / 18:00 evening
//   Night      = 00:00 midnight
// Only Day has reference colours; the other three are invented.
const _dry = WEATHER_SETS.dry.base; // short alias for the Day column below
const TIME_KEYFRAMES = {
  sky: [
    _dry.sky, // #A1DAF9 Day
    [45, 27.6, 91], // #87b3e0 GoldenHour
    [322, 22.1, 87.1], // #595f9b Dusk
    [234, 62.5, 31.4], // #1E2350 Night
  ],
  // Horizon colours. GoldenHour/Dusk/Night start as the matching sky above,
  // lightened (+0.12 OKLab L, the old derived horizon), so they look as before
  // until tuned.
  skyLow: [
    _dry.skyLow, // #BDE7F5 Day
    [60, 19.6, 100], // #dc885f GoldenHour
    [315, 17.3, 100], // #de9bcd Dusk
    [231.4, 48.7, 45.1], // #3B4373 Night
  ],
  bush: [
    _dry.bush, // #7EC13B Day
    [81.7, 47.4, 59.6], // #7E9850 GoldenHour
    [78.8, 39.3, 47.8], // #6B7A4A Dusk
    [180, 46.6, 22.7], // #1f2d3a Night
  ],
  trunk: [
    _dry.trunk, // #CC7470 Day
    [20.3, 56.4, 43.1], // #6E4530 GoldenHour
    [16.6, 64.4, 35.3], // #5A3020 Dusk
    [285, 34.8, 18], // #2A1E2E Night
  ],
  road: [
    _dry.road, // #F7DEEE Day
    [30, 32.1, 87.8], // #E0BC98 GoldenHour
    [24, 48.4, 85.1], // #D99A70 Dusk
    [251.1, 28.1, 37.6], // #4A4560 Night
  ],
  rut: [
    _dry.rut, // #DD7DBE Day
    [20.8, 61.2, 62.7], // #A0603E GoldenHour
    [17.3, 65.2, 54.1], // #8A4A30 Dusk
    [256.4, 34.4, 25.1], // #302A40 Night
  ],
  grass: [
    _dry.grass, // #74C747 Day
    [75, 64, 78.4], // #A8C848 GoldenHour
    [63.8, 60, 62.7], // #9AA040 Dusk
    [140, 53.3, 35.3], // #2a445a Night
  ],
  leaf: [
    _dry.leaf, // #12A54B Day
    [123.8, 50.5, 74.5], // #6fca56 GoldenHour
    [96.9, 58.8, 46.7], // #4C7731 Dusk
    [140, 53.3, 35.3], // #2a485a Night
  ],
  flower: [
    _dry.flower, // #FAFBC5 Day
    [45.1, 50, 98], // #FADB7D GoldenHour
    [270, 30, 81.2], // #B091CF Dusk
    [236.5, 63.8, 62.7], // #5a5d8e Night
  ],
};
