// ── Clock state ────────────────────────────────────────────────────────────────
// Set to true to read the system wall clock instead of the virtual 120-second
// cycle. Flip at runtime with the 't' key (sketch.js keyPressed).
let useRealClock = false;

// Raw 0–1 position in the virtual day, continuous and fractional.
// Wraps at midnight. Single source of truth for both the overlay text and the
// palette — change one and both update together.
function getDayFraction() {
  if (useRealClock) {
    const now = new Date();
    return (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400;
  }
  // clock.dayLengthSeconds and clock.startHour are defined in sketch.js (loaded after).
  const elapsed = millis() / 1000;
  return (elapsed / clock.dayLengthSeconds + clock.startHour / 24) % 1;
}

// Human-readable time string for the on-screen overlay, e.g. "6:30 PM".
// Called by the setInterval in sketch.js setup().
function getTimeOfDay() {
  return formatTime(getDayFraction() * 24);
}

function formatTime(relativeTime) {
  const hours24 = Math.floor(relativeTime);
  const hours   = hours24 % 12 || 12;
  const meridian = hours24 < 12 ? 'AM' : 'PM';
  const mins     = Math.floor((relativeTime % 1) * 60);
  return `${hours}:${String(mins).padStart(2, '0')} ${meridian}`;
}

// ── OKLab colour blending ──────────────────────────────────────────────────────
// Self-contained block. To swap for RGB blending replace lerpOklab() only —
// every helper below it (_prefix) is an implementation detail of this block.
// Reference: https://bottosson.github.io/posts/oklab/

function _srgbToLinear(c) {
  // Gamma expansion: 0–1 sRGB → linear light
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function _linearToSrgb(c) {
  // Gamma compression: linear light → 0–1 sRGB
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

// '#RRGGBB' → [r, g, b] integers 0–255
function _parseHex(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function _rgbToOklab(r, g, b) {
  const rl = _srgbToLinear(r / 255);
  const gl = _srgbToLinear(g / 255);
  const bl = _srgbToLinear(b / 255);
  const l = Math.cbrt(0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl);
  const m = Math.cbrt(0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl);
  const s = Math.cbrt(0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.4072767516 * m - 0.4327607230 * s,
  ];
}

function _oklabToRgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l3 = l_ * l_ * l_, m3 = m_ * m_ * m_, s3 = s_ * s_ * s_;
  const r  = _linearToSrgb( 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3);
  const g  = _linearToSrgb(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3);
  const bl = _linearToSrgb(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3);
  return [
    Math.round(Math.max(0, Math.min(255, r  * 255))),
    Math.round(Math.max(0, Math.min(255, g  * 255))),
    Math.round(Math.max(0, Math.min(255, bl * 255))),
  ];
}

// Blend two hex strings in OKLab; return the result as a hex string.
// Internal workhorse — all per-role blending goes through this.
function _blendHex(hexA, hexB, t) {
  const [rA, gA, bA] = _parseHex(hexA);
  const [rB, gB, bB] = _parseHex(hexB);
  const labA = _rgbToOklab(rA, gA, bA);
  const labB = _rgbToOklab(rB, gB, bB);
  const [r, g, b] = _oklabToRgb(
    labA[0] + (labB[0] - labA[0]) * t,
    labA[1] + (labB[1] - labA[1]) * t,
    labA[2] + (labB[2] - labA[2]) * t,
  );
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

// Shift the L (lightness) channel of a hex colour by deltaL (negative darkens).
// Returns a hex string. Used to derive light/dark variants without extra keyframes.
function _adjustL(hex, deltaL) {
  const [r, g, b] = _parseHex(hex);
  const [L, a, bCh] = _rgbToOklab(r, g, b);
  const [rOut, gOut, bOut] = _oklabToRgb(Math.max(0, Math.min(1, L + deltaL)), a, bCh);
  return '#' + [rOut, gOut, bOut].map(c => c.toString(16).padStart(2, '0')).join('');
}

// Convert a hex string to a p5 color object.
// p5 always interprets hex strings as RGB regardless of the current colorMode,
// so no colorMode switch is needed here.
function _hexToColor(hex) {
  return color(hex);
}

// Public blend: two hex strings → p5 color at interpolated position t (0–1).
// To swap for RGB blending, replace this body with:
//   colorMode(RGB,255); const c=lerpColor(color(hexA),color(hexB),t); colorMode(HSL); return c;
function lerpOklab(hexA, hexB, t) {
  return _hexToColor(_blendHex(hexA, hexB, t));
}

// Standard smoothstep (3t²−2t³): colours linger near keyframes and transition
// briskly in the middle — feels like the light naturally dwelling at each phase.
function smoothstepT(t) {
  return t * t * (3 - 2 * t);
}

// ── Keyframe schedule ──────────────────────────────────────────────────────────
// Maps clock hours to PALETTE_KEYFRAMES indices (from colors.js):
//   0 = Day, 1 = GoldenHour, 2 = Dusk, 3 = Night
// Six stops at equal 4-hour intervals; dawn mirrors dusk symmetrically.
// Night zone: 19 → 24 → 5 = 10 clock hours (~25 s of the 60-second cycle)
// Day zone:    9 → 12 → 15 = 6 clock hours (~15 s of the 60-second cycle)
// To rebalance, move the pre-dawn stop (hour 5) and evening stop (hour 19)
// back toward 4 and 20 respectively.
const _STOPS = [
  { hour:  0, idx: 3 }, // Midnight   → Night
  { hour:  6, idx: 2 }, // Pre-dawn   → Dusk colours
  { hour:  9, idx: 1 }, // Morning    → GoldenHour
  { hour: 12, idx: 0 }, // Noon       → Day
  { hour: 15, idx: 1 }, // Afternoon  → GoldenHour
  { hour: 18, idx: 2 }, // Evening    → Dusk
  { hour: 24, idx: 3 }, // (sentinel) → Night, wraps to hour 0
];

// Returns a palette object whose keys match paletteHsb in sketch.js, with p5
// color values blended for the current moment in the day-night cycle.
// Call once per frame and assign via: Object.assign(palette, getTimePalette())
//
// Weather mechanic hook: receive the returned object, apply your tint to it,
// then assign to palette. Neither mechanic overwrites the other that way.
function getTimePalette() {
  const hour = getDayFraction() * 24;

  // Find the two stops that bracket the current hour
  let stopA = _STOPS[0], stopB = _STOPS[1];
  for (let i = 0; i < _STOPS.length - 1; i++) {
    if (hour >= _STOPS[i].hour && hour < _STOPS[i + 1].hour) {
      stopA = _STOPS[i];
      stopB = _STOPS[i + 1];
      break;
    }
  }

  const t  = smoothstepT((hour - stopA.hour) / (stopB.hour - stopA.hour));
  const kf = PALETTE_KEYFRAMES; // global from colors.js

  // Blend each role between stops; keep result as hex so _adjustL can derive
  // lighter/darker variants without an extra p5 round-trip.
  const skyH   = _blendHex(kf.sky[stopA.idx],     kf.sky[stopB.idx],     t);
  const hillsH = _blendHex(kf.hills[stopA.idx],   kf.hills[stopB.idx],   t);
  const trunkH = _blendHex(kf.trunks[stopA.idx],  kf.trunks[stopB.idx],  t);
  const roadH  = _blendHex(kf.road[stopA.idx],    kf.road[stopB.idx],    t);
  const rutsH  = _blendHex(kf.ruts[stopA.idx],    kf.ruts[stopB.idx],    t);
  const grassH = _blendHex(kf.grass[stopA.idx],   kf.grass[stopB.idx],   t);
  const florH  = _blendHex(kf.flowers[stopA.idx], kf.flowers[stopB.idx], t);

  // Expand 7 keyframe roles → all paletteHsb keys that sketch.js uses.
  // Light/dark variants come from shifting OKLab L — no extra keyframe entry needed.
  return {
    skyTop:       _hexToColor(skyH),
    skyLow:       _hexToColor(_adjustL(skyH,    +0.12)), // horizon lighter than zenith
    cloud:        _hexToColor(_adjustL(skyH,    +0.28)), // clouds near-white
    bush:         _hexToColor(hillsH),                   // undergrowth / hedge
    road:         _hexToColor(roadH),
    track:        _hexToColor(rutsH),
    ridge:        _hexToColor(_adjustL(rutsH,   +0.12)),
    grass:        _hexToColor(grassH),
    grassDark:    _hexToColor(_adjustL(grassH,  -0.12)),
    grassLight:   _hexToColor(_adjustL(grassH,  +0.14)),
    trunk:        _hexToColor(trunkH),
    leaf:         _hexToColor(grassH),
    leafLight:    _hexToColor(_adjustL(grassH,  +0.18)),
    blossom:      _hexToColor(florH),
    blossomLight: _hexToColor(_adjustL(florH,   +0.20)),
    // Flower dots brighten/dim with the sky's overall lightness rather than a
    // separate keyframe. Both use the same near-white sky-tinted derivation.
    flowerYellow: _hexToColor(_adjustL(skyH,    +0.35)),
    flowerWhite:  _hexToColor(_adjustL(skyH,    +0.35)),
  };
}
