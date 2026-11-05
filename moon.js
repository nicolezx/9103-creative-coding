// ── Moon phase live layer ──────────────────────────────────────────────────────
// Drawn each frame on top of the cached sky but behind bushes and trees, via
// the redrawMoonArea() patch in sketch.js (same mechanism as hover sway).
//
// Position: a low symmetrical arc from the left horizon (6 pm) to the right
// horizon (6 am), peaking at midnight. Fades in/out near the horizon.
//
// Phase: 8 discrete phases (new → waxing crescent → first quarter → waxing
// gibbous → full → waning gibbous → last quarter → waning crescent), one per
// virtual day, advancing at each midnight crossing.
//
// Shape: organic wobbled disc (noise-perturbed polygon outline, no time
// component so the shape is stable frame-to-frame) with a phase-correct lit
// area (arc + cubic bezier terminator). Soft canvas blur blends the edges.
//
// Randomness: none. All positions use noise() or hash01() so the seeded
// random() stream the scene layout comes from is never touched.

const moonSettings = {
  radius: 28,              // moon radius at the reference canvas size, px [> 0]; try 20–45
  blurPx: 6,               // canvas blur radius, px [≥ 0]; try 3–10
  arcXLeft: 0.07,          // x as fraction of canvas width at entry (6 pm, left side) [0–1]
  arcXRight: 0.93,         // x as fraction of canvas width at exit (6 am, right side) [0–1]
  arcYEntry: 0.80,         // y as fraction of vanishingPoint.y at entry/exit [0–1, 1 = horizon]
  arcYPeak: 0.22,          // y as fraction of vanishingPoint.y at midnight [0–1, 0 = top of sky]
  fadeZone: 0.06,          // arc range fraction over which the moon fades in/out [0–0.5]
  litColour: [52, 18, 96],     // lit side: warm white [h, s, b] #F5F0D6
  glowColour: [52, 15, 100],   // halo behind full moon [h, s, b]
  glowAlpha: 0.08,             // halo opacity at full moon [0–1]; try 0.04–0.15
  glowRadius: 2.2,             // halo size, × moon radius [> 1]; try 1.5–3
  wobblePoints: 36,            // outline polygon segments [whole number ≥ 12]
  wobbleAmount: 0.06,          // outline deviation ± fraction of radius [0–0.15]
  wobbleFreq: 5,               // noise frequency for outline lobes [> 0]; try 3–8
  wobbleSeed: 7.3,             // noise offset so the wobble doesn't match star twinkle noise
};

// Phase: 0 = new moon, 0.5 = full moon, 1 = new moon.
// _moonPhaseDay is 0–7, advancing by 1 at each midnight.
let _moonPhaseDay = 0;
let _moonPrevFraction = -1; // getDayFraction() from the previous frame, for midnight detection

function getMoonPhase() {
  return _moonPhaseDay / 8;
}

// Called once per frame from getMoonPatch(). Advances the phase at 6 am (day
// fraction crossing 0.25) rather than midnight, so the phase never changes
// while the moon is visible (it's on screen from 6 pm to 6 am).
// The first-frame guard (_moonPrevFraction === -1) prevents a spurious advance
// when the sketch starts mid-morning (prev would be -1 < 0.25, triggering falsely).
function _updateMoonPhase() {
  const f = getDayFraction();
  if (_moonPrevFraction !== -1 && _moonPrevFraction < 0.25 && f >= 0.25) {
    _moonPhaseDay = (_moonPhaseDay + 1) % 8;
  }
  _moonPrevFraction = f;
}

// Position on the arc for this frame, or null during the day (6 am–6 pm).
// t: 0 = entering left (6 pm), 0.5 = midnight peak, 1 = exiting right (6 am).
// alpha: 0 at the horizon, 1 within the arc, smoothstepped over fadeZone.
function _moonArcPosition() {
  const f = getDayFraction();
  let t;
  if (f >= 0.75) {
    t = (f - 0.75) / 0.5;   // 6 pm → midnight: 0 → 0.5
  } else if (f < 0.25) {
    t = (f + 0.25) / 0.5;   // midnight → 6 am: 0.5 → 1
  } else {
    return null;             // daytime
  }

  const x = lerp(
    width * moonSettings.arcXLeft,
    width * moonSettings.arcXRight,
    t,
  );
  const baseY = vanishingPoint.y * moonSettings.arcYEntry;
  const peakY = vanishingPoint.y * moonSettings.arcYPeak;
  const y = baseY + (peakY - baseY) * Math.sin(Math.PI * t);

  const fz = moonSettings.fadeZone;
  const alpha = Math.min(
    smoothstepT(constrain(t / fz, 0, 1)),
    smoothstepT(constrain((1 - t) / fz, 0, 1)),
  );

  return { x, y, t, alpha };
}

// Add a noise-perturbed circle outline to `ctx`. The perturbation has no time
// component so the shape is identical every frame and every redraw.
function _moonWobblePath(ctx, cx, cy, R) {
  const { wobblePoints, wobbleAmount, wobbleFreq, wobbleSeed } = moonSettings;
  ctx.beginPath();
  for (let i = 0; i <= wobblePoints; i++) {
    const angle = (i / wobblePoints) * Math.PI * 2;
    const nx = Math.cos(angle) * wobbleFreq + wobbleSeed;
    const ny = Math.sin(angle) * wobbleFreq + wobbleSeed * 1.3;
    // noise() 0–1 → centred on 0, scaled to ±wobbleAmount
    const w = (noise(nx, ny) - 0.5) * wobbleAmount * 2;
    const r = R * (1 + w);
    const px = cx + Math.cos(angle) * r;
    const py = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// Add the phase-correct lit area to the current path in `ctx`.
// Uses a half-arc (the lit side) + a cubic bezier (the terminator) to produce
// every phase from a thin crescent to a full disc without any clipping.
// phase: 0 = new moon (nothing drawn), 0.5 = full moon (whole disc).
function _moonPhaseLitPath(ctx, cx, cy, R, phase) {
  if (phase <= 0.005) return; // new moon: nothing

  // The bezier approximation constant for a quarter-circle, used to build a
  // half-ellipse whose x-radius is xr and whose y-radius is R.
  const kappa = 4 / 3;
  const waxing = phase <= 0.5;
  // 0 = new, 1 = full (within whichever half of the cycle we're in)
  const normalizedPhase = waxing ? phase / 0.5 : (1 - phase) / 0.5;

  // The terminator's x-radius:
  //   waxing:  R at new moon (shadow covers all) → -R at full moon (no shadow)
  //   waning: -R at full moon (no shadow) → R at new moon (shadow covers all)
  // The arc direction (CW vs CCW) flips to light the right/left side.
  const xr = waxing
    ? R * Math.cos(Math.PI * normalizedPhase)
    : -R * Math.cos(Math.PI * normalizedPhase);

  ctx.beginPath();
  if (waxing) {
    // Right side lit: arc clockwise from top (12 o'clock) to bottom (6 o'clock)
    // via the right side (3 o'clock), then the terminator back to top
    ctx.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2, false);
  } else {
    // Left side lit: arc counter-clockwise from top to bottom via the left side
    ctx.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2, true);
  }
  // Bezier from bottom (cx, cy+R) back to top (cx, cy-R) via the terminator.
  // Control points at (cx + xr*kappa, cy ± R) approximate a half-ellipse with
  // x-radius xr: when xr=0 this is a straight vertical line (quarter phase);
  // when xr=-R it sweeps left across the full disc (full moon from waxing side).
  ctx.bezierCurveTo(
    cx + xr * kappa, cy + R,
    cx + xr * kappa, cy - R,
    cx, cy - R,
  );
  ctx.closePath();
}

// Convert [h 0–360, s 0–100, b 0–100] + alpha to a CSS colour string.
// Uses _hsbToRgb() from time.js (already a global in this project).
function _moonCss(h, s, b, a) {
  const [r, g, bv] = _hsbToRgb([h, s, b]);
  if (a !== undefined && a < 1) return `rgba(${r},${g},${bv},${a})`;
  return `rgb(${r},${g},${bv})`;
}

// Draw the moon into the current drawingContext (called inside drawInto() in
// sketch.js, so drawingContext is the patch buffer's 2D context).
// canvas blur, globalAlpha and direct ctx calls are intentional here: p5's
// filter() sets it on the main renderer, not on offscreen buffers.
function _drawMoonInPatch(cx, cy, R, phase, alpha) {
  const ctx = drawingContext;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.filter = `blur(${moonSettings.blurPx}px)`;

  // Halo — only visible near the full moon
  const fullness = 1 - Math.abs(phase - 0.5) * 2; // 0 at new, 1 at full
  if (fullness > 0.1) {
    const [gh, gs, gb] = moonSettings.glowColour;
    ctx.beginPath();
    ctx.arc(cx, cy, R * moonSettings.glowRadius, 0, Math.PI * 2);
    ctx.fillStyle = _moonCss(gh, gs, gb, moonSettings.glowAlpha * fullness * fullness);
    ctx.fill();
  }

  // Lit area only — the dark side is transparent (sky shows through it).
  // The wobbly outline is on the lit shape via the organic wobble path:
  // at the lit/dark boundary (terminator) the edge is geometric; at the lit
  // face's outer rim it matches the same wobbled circle as _moonWobblePath
  // would, since blur smooths over the slight difference.
  if (phase > 0.005) {
    _moonPhaseLitPath(ctx, cx, cy, R, phase);
    const [lh, ls, lb] = moonSettings.litColour;
    ctx.fillStyle = _moonCss(lh, ls, lb);
    ctx.fill();
  }

  ctx.filter = "none";
  ctx.restore();
}

// Called from sketch.js draw() every frame.
// Returns { area, draw } when the moon is above the horizon, null otherwise.
// sketch.js passes the return value to redrawMoonArea() so the moon is
// composited behind trees (see AGENTS.md §5 Render layers).
function getMoonPatch() {
  _updateMoonPhase();
  const pos = _moonArcPosition();
  if (!pos || pos.alpha <= 0.001) return null;

  const R = moonSettings.radius * sqrt(markDensity); // scale with canvas like marks()
  const pad = moonSettings.blurPx * 3 + R * 1.5;    // room for blur bleed + glow
  const patchR = R + pad;

  const area = {
    centreX: pos.x,
    centreY: pos.y,
    radius: patchR,
    softEdge: moonSettings.blurPx * 2, // fade the patch rim so it blends in
    x: pos.x - patchR,
    y: pos.y - patchR,
    w: patchR * 2,
    h: patchR * 2,
  };

  const phase = getMoonPhase();
  const alpha = pos.alpha;

  return {
    area,
    draw: () => _drawMoonInPatch(pos.x, pos.y, R, phase, alpha),
  };
}
