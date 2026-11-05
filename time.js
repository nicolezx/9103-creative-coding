// ── Clock state ────────────────────────────────────────────────────────────────
// Set to true to read the system wall clock instead of the virtual 120-second
// cycle. Flip at runtime with the 't' key (sketch.js keyPressed).
let useRealClock = false;

// Pause state, toggled with the 'p' key via togglePause(). While paused the
// day fraction is frozen at pausedFraction (stepHour() moves it by whole
// hours); on resume pausedMs is reset so the virtual clock carries on from
// that moment instead of jumping ahead.
let paused = false;
let pausedFraction = 0; // day fraction captured at the moment of pausing
let pauseStartMs = 0;
let pausedMs = 0; // offset subtracted from millis(): time spent paused, plus any stepHour() jumps

function togglePause() {
  if (!paused) {
    pausedFraction = getDayFraction();
    pauseStartMs = millis();
  } else {
    // resume from the paused moment, which stepHour() may have moved: pick
    // pausedMs so the virtual clock formula lands exactly on pausedFraction
    const sinceStart = (((pausedFraction - clock.startHour / 24) % 1) + 1) % 1;
    // (1 ms extra so float rounding can't land a hair before the hour: 12:59)
    pausedMs = millis() - sinceStart * clock.dayLengthSeconds * 1000 - 1;
  }
  paused = !paused;
}

// Jump to the next (direction = 1) or previous (−1) full hour, pausing the
// clock first so the time stays there; P resumes from it. Bound to the
// right / left arrow keys (sketch.js keyPressed). Wraps at midnight.
function stepHour(direction) {
  if (!paused) togglePause();
  const hour = pausedFraction * 24;
  // the small margin makes a press from exactly 3:00 go to 4:00 / 2:00, and
  // one from 2:59.999 (float drift) go to 4:00, not 3:00
  const target = direction > 0 ? Math.floor(hour + 0.001) + 1 : Math.ceil(hour - 0.001) - 1;
  pausedFraction = (((target % 24) + 24) % 24) / 24;
}

// Raw 0–1 position in the virtual day, continuous and fractional.
// Wraps at midnight. Single source of truth for both the overlay text and the
// palette — change one and both update together.
function getDayFraction() {
  if (paused) return pausedFraction;
  if (useRealClock) {
    const now = new Date();
    return (
      (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400
    );
  }
  // clock.dayLengthSeconds and clock.startHour are defined in sketch.js (loaded after).
  const elapsed = (millis() - pausedMs) / 1000;
  return (elapsed / clock.dayLengthSeconds + clock.startHour / 24) % 1;
}

// Human-readable time string for the on-screen overlay, e.g. "6:30 PM".
// Called by the setInterval in sketch.js setup().
function getTimeOfDay() {
  return formatTime(getDayFraction() * 24);
}

function formatTime(relativeTime) {
  const hours24 = Math.floor(relativeTime);
  const hours = hours24 % 12 || 12;
  const meridian = hours24 < 12 ? "AM" : "PM";
  const mins = Math.floor((relativeTime % 1) * 60);
  return `${hours}:${String(mins).padStart(2, "0")} ${meridian}`;
}

// ── OKLab colour blending ──────────────────────────────────────────────────────
// Self-contained block. Colours come in and go out as [h, s, b] arrays (see
// colors.js); OKLab is only used internally, so blends stay perceptually even
// and never take the long way round the hue circle.
// Reference: https://bottosson.github.io/posts/oklab/

function _srgbToLinear(c) {
  // Gamma expansion: 0–1 sRGB → linear light
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function _linearToSrgb(c) {
  // Gamma compression: linear light → 0–1 sRGB
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

// [h 0–360, s 0–100, b 0–100] → [r, g, b] 0–255. Plain JS (no p5) so it works
// on colors.js data at any time.
function _hsbToRgb([h, s, v]) {
  s /= 100;
  v /= 100;
  const k = (n) => (n + h / 60) % 6;
  const f = (n) => v - v * s * Math.max(0, Math.min(k(n), 4 - k(n), 1));
  return [f(5) * 255, f(3) * 255, f(1) * 255];
}

// [r, g, b] 0–255 → [h 0–360, s 0–100, b 0–100]
function _rgbToHsb([r, g, b]) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return [0, 0, max * 100]; // grey: hue is undefined, use 0
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [(h * 60 + 360) % 360, (d / max) * 100, max * 100];
}

function _rgbToOklab(r, g, b) {
  const rl = _srgbToLinear(r / 255);
  const gl = _srgbToLinear(g / 255);
  const bl = _srgbToLinear(b / 255);
  const l = Math.cbrt(
    0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl,
  );
  const m = Math.cbrt(
    0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl,
  );
  const s = Math.cbrt(
    0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl,
  );
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function _oklabToRgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l3 = l_ * l_ * l_,
    m3 = m_ * m_ * m_,
    s3 = s_ * s_ * s_;
  const r = _linearToSrgb(
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
  );
  const g = _linearToSrgb(
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
  );
  const bl = _linearToSrgb(
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  );
  return [
    Math.round(Math.max(0, Math.min(255, r * 255))),
    Math.round(Math.max(0, Math.min(255, g * 255))),
    Math.round(Math.max(0, Math.min(255, bl * 255))),
  ];
}

function _hsbToOklab(hsb) {
  return _rgbToOklab(..._hsbToRgb(hsb));
}

function _oklabToHsb([L, a, b]) {
  return _rgbToHsb(_oklabToRgb(L, a, b));
}

// Blend two [h, s, b] colours in OKLab; returns [h, s, b].
// Internal workhorse — all per-role blending goes through this.
function _blendHsb(hsbA, hsbB, t) {
  const labA = _hsbToOklab(hsbA);
  const labB = _hsbToOklab(hsbB);
  return _oklabToHsb(labA.map((v, i) => v + (labB[i] - v) * t));
}

// Shift the OKLab L (perceptual lightness) of an [h, s, b] colour by deltaL
// (negative darkens). Used to derive light/dark variants without extra keyframes.
function _adjustL(hsb, deltaL) {
  const [L, a, b] = _hsbToOklab(hsb);
  return _oklabToHsb([Math.max(0, Math.min(1, L + deltaL)), a, b]);
}

// Difference between two [h, s, b] colours as an OKLab [dL, da, db] offset.
// Measured in OKLab rather than HSB so an offset never wraps the hue circle.
function _offsetHsb(fromHsb, toHsb) {
  const from = _hsbToOklab(fromHsb);
  const to = _hsbToOklab(toHsb);
  return to.map((v, i) => v - from[i]);
}

// Add an OKLab offset (from _offsetHsb) to an [h, s, b] colour, scaled by weight
// (0 = unchanged, 1 = full offset). Returns [h, s, b].
function _applyOffset(hsb, offset, weight) {
  const lab = _hsbToOklab(hsb);
  return _oklabToHsb(lab.map((v, i) => v + offset[i] * weight));
}

// [h, s, b] → p5 color. Assumes colorMode(HSB, 360, 100, 100, 1), set in
// sketch.js setup() and restored by mixRGB().
function _toColor(hsb) {
  return color(...hsb);
}

// Standard smoothstep (3t²−2t³): colours linger near keyframes and transition
// briskly in the middle — feels like the light naturally dwelling at each phase.
function smoothstepT(t) {
  return t * t * (3 - 2 * t);
}

// ── Keyframe schedule ──────────────────────────────────────────────────────────
// Maps clock hours to TIME_KEYFRAMES indices (from colors.js):
//   0 = Day, 1 = GoldenHour, 2 = Dusk, 3 = Night
// Six stops; dawn mirrors dusk symmetrically.
// Night zone: 18 → 24 → 6 = 12 clock hours (half the cycle)
// Day zone:    9 → 12 → 15 = 6 clock hours
// To rebalance, move the pre-dawn stop (hour 6) and evening stop (hour 18).
const _STOPS = [
  { hour: 0, idx: 3 }, // Midnight   → Night
  { hour: 6, idx: 2 }, // Pre-dawn   → Dusk colours
  { hour: 9, idx: 1 }, // Morning    → GoldenHour
  { hour: 12, idx: 0 }, // Noon       → Day
  { hour: 15, idx: 1 }, // Afternoon  → GoldenHour
  { hour: 18, idx: 2 }, // Evening    → Dusk
  { hour: 24, idx: 3 }, // (sentinel) → Night, wraps to hour 0
];

// How much daylight each keyframe represents, indexed like TIME_KEYFRAMES.
// Weather offsets are scaled by this: the reference paintings are all daytime,
// so weather shows fully at noon and fades out toward night, where everything
// is dark anyway. GoldenHour/Dusk values are a judgement call — tune by eye.
const _DAYLIGHT = [1, 0.8, 0.4, 0]; // Day, GoldenHour, Dusk, Night

// The two stops bracketing the current hour, plus the eased position t (0–1)
// between them. Shared by getTimeBase() and getDaylight() so they always agree.
function _currentStops() {
  const hour = getDayFraction() * 24;
  let stopA = _STOPS[0],
    stopB = _STOPS[1];
  for (let i = 0; i < _STOPS.length - 1; i++) {
    if (hour >= _STOPS[i].hour && hour < _STOPS[i + 1].hour) {
      stopA = _STOPS[i];
      stopB = _STOPS[i + 1];
      break;
    }
  }
  const t = smoothstepT((hour - stopA.hour) / (stopB.hour - stopA.hour));
  return { stopA, stopB, t };
}

// Time-of-day colour per role: { role: [h, s, b] } blended between keyframes.
function getTimeBase() {
  const { stopA, stopB, t } = _currentStops();
  const base = {};
  for (const role in TIME_KEYFRAMES) {
    const frames = TIME_KEYFRAMES[role];
    base[role] = _blendHsb(frames[stopA.idx], frames[stopB.idx], t);
  }
  return base;
}

// 0 (night) → 1 (noon), eased between keyframes the same way as the colours.
function getDaylight() {
  const { stopA, stopB, t } = _currentStops();
  return (
    _DAYLIGHT[stopA.idx] + (_DAYLIGHT[stopB.idx] - _DAYLIGHT[stopA.idx]) * t
  );
}

// ── Weather offset ─────────────────────────────────────────────────────────────
// Maps `rain` (0–1) to WEATHER_SETS (from colors.js). Linear rather than
// smoothstepped: rain already comes from smooth Perlin noise.
const _WEATHER_STOPS = [
  { rain: 0, set: "dry" },
  { rain: 0.5, set: "overcast" },
  { rain: 1, set: "wet" },
];

// How far the current weather pulls each role away from the dry (daytime
// baseline) palette: { role: OKLab offset }. rain = 0 → all-zero offsets, so
// the time cycle works unchanged with weather switched off.
function getWeatherOffset(rain) {
  rain = Math.max(0, Math.min(1, rain));
  let stopA = _WEATHER_STOPS[0],
    stopB = _WEATHER_STOPS[1];
  for (let i = 0; i < _WEATHER_STOPS.length - 1; i++) {
    if (rain <= _WEATHER_STOPS[i + 1].rain) {
      stopA = _WEATHER_STOPS[i];
      stopB = _WEATHER_STOPS[i + 1];
      break;
    }
  }
  const t = (rain - stopA.rain) / (stopB.rain - stopA.rain);
  const dry = WEATHER_SETS.dry.base;
  const from = WEATHER_SETS[stopA.set].base;
  const to = WEATHER_SETS[stopB.set].base;

  const offset = {};
  for (const role in dry) {
    offset[role] = _offsetHsb(dry[role], _blendHsb(from[role], to[role], t));
  }
  return offset;
}

// ── Resolved palette ───────────────────────────────────────────────────────────
// Combines time and weather into the p5 colours sketch.js draws with. Keys
// match the `palette` names used by the drawing code.
// Call once per frame:
//   Object.assign(palette, resolvePalette(getTimeBase(), getWeatherOffset(rain), getDaylight()))
function resolvePalette(timeBase, weatherOffset, daylight) {
  // Resolved base colour per role: time blend + weather, weather faded by daylight
  const c = {};
  for (const role in timeBase) {
    c[role] = _applyOffset(timeBase[role], weatherOffset[role], daylight);
  }

  // VARIANTS: once WEATHER_SETS have `variants`, add variantColour(role, index)
  // here: the variant swatch + the same time/weather offset as c[role] (i.e.
  // _offsetHsb(dry base, c[role]) applied to the variant). Marks would pick an
  // index once and call it instead of jitter(palette.x, …).

  // Expand 8 roles → all palette keys that sketch.js uses.
  // Light/dark variants come from shifting OKLab L — no extra keyframe entry needed.
  return {
    skyTop: _toColor(c.sky),
    skyLow: _toColor(_adjustL(c.sky, +0.12)), // horizon lighter than zenith
    cloud: _toColor(_adjustL(c.sky, +0.28)), // clouds near-white
    bush: _toColor(c.bush), // undergrowth / hedge
    road: _toColor(c.road),
    track: _toColor(c.rut),
    ridge: _toColor(_adjustL(c.rut, +0.12)),
    grass: _toColor(c.grass),
    grassDark: _toColor(_adjustL(c.grass, -0.12)),
    grassLight: _toColor(_adjustL(c.grass, +0.14)),
    trunk: _toColor(c.trunk),
    leaf: _toColor(c.leaf),
    leafLight: _toColor(_adjustL(c.leaf, +0.18)),
    blossom: _toColor(c.flower),
    blossomLight: _toColor(_adjustL(c.flower, +0.2)),
    // Flower dots brighten/dim with the sky's overall lightness rather than a
    // separate keyframe. Both use the same near-white sky-tinted derivation.
    flowerYellow: _toColor(_adjustL(c.sky, +0.35)),
    flowerWhite: _toColor(_adjustL(c.sky, +0.35)),
  };
}
