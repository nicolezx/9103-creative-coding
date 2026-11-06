// Shared helpers for the Woldgate scene: perspective, placement, mark
// primitives, number helpers (hash, easing, falloff), shape tests and
// screen ↔ scene conversion. Nothing here draws a whole scene object on its own.
// Relies on globals set up in sketch.js (perspective, vanishingPoint,
// markDensity, canvasWidth/canvasHeight), read at call time.

// Scale a mark count by markDensity so density holds at any canvas size
function marks(count) {
  return round(count * markDensity);
}

// ---------------------------------------------------------------------------
// Perspective helper
// along:  0 = at the viewer's feet, 1 = at the vanishing point
// across: 0 = left road edge, 1 = right road edge (outside 0–1 = verges)
// Returns screen x, y and a scale (1 near, 0 far) for sizing marks.
// ---------------------------------------------------------------------------
function lane(along, across) {
  const scale = 1 - pow(along, perspective.compression);
  const y = lerp(vanishingPoint.y, height, scale);
  const halfWidth = lerp(
    perspective.farHalfWidth,
    width * perspective.roadHalfWidth,
    scale,
  );
  const bend = perspective.curve * width * pow(1 - scale, 1.8);
  const x = vanishingPoint.x + bend + (across - 0.5) * 2 * halfWidth;
  // Zoom = scale everything about the vanishing point, so the composition
  // tightens without re-placing anything by hand
  const zoom = perspective.zoom;
  return {
    x: vanishingPoint.x + (x - vanishingPoint.x) * zoom,
    y: vanishingPoint.y + (y - vanishingPoint.y) * zoom,
    scale: scale * zoom, // marks and tree heights grow with the zoom
  };
}

// Wobbly road edges (in `across` units)
function leftEdge(along) {
  return (noise(along * 4, 1) - 0.5) * 0.14;
}
function rightEdge(along) {
  return 1 + (noise(along * 4, 9) - 0.5) * 0.14;
}

// Random point on the verges (outside the road)
function vergePoint() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const along = pow(random(), 1.3);
    const laneCentre = lane(along, 0.5);
    const x = random(-10, width + 10);
    const roadLeftX = lane(along, leftEdge(along)).x;
    const roadRightX = lane(along, rightEdge(along)).x;
    if (x < roadLeftX - 1 || x > roadRightX + 1)
      return { x, y: laneCentre.y, scale: laneCentre.scale };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Mark helpers
// ---------------------------------------------------------------------------

// Jitter a colour slightly in hue/saturation/brightness (variegated strokes)
function jitter(
  colour,
  hueRange = 6,
  saturationRange = 8,
  brightnessRange = 8,
  alpha = 1,
) {
  return color(
    (hue(colour) + random(-hueRange, hueRange) + 360) % 360,
    constrain(
      saturation(colour) + random(-saturationRange, saturationRange),
      0,
      100,
    ),
    constrain(
      brightness(colour) + random(-brightnessRange, brightnessRange),
      0,
      100,
    ),
    alpha,
  );
}

// Blend in RGB so gradients don't swing through other hues
function mixRGB(fromColour, toColour, amount) {
  colorMode(RGB, 255);
  const mixed = lerpColor(fromColour, toColour, amount);
  colorMode(HSB, 360, 100, 100, 1); // back to the sketch-wide mode set in setup()
  return mixed;
}

// A p5 colour as a plain [h, s, b] array (for storing, or for adding alpha later)
function colourToHsb(colour) {
  return [hue(colour), saturation(colour), brightness(colour)];
}

// Straight dash centred on (x, y)
function dash(x, y, angle, length, weight, colour) {
  stroke(colour);
  strokeWeight(weight);
  const offsetX = (cos(angle) * length) / 2;
  const offsetY = (sin(angle) * length) / 2;
  line(x - offsetX, y - offsetY, x + offsetX, y + offsetY);
}


// Tapered blade: thick lower half, thin upper half with a slight bend
function blade(x, y, angle, length, weight, colour) {
  stroke(colour);
  const midX = x + cos(angle) * length * 0.55;
  const midY = y + sin(angle) * length * 0.55;
  const tipAngle = angle + random(-0.15, 0.15);
  strokeWeight(weight);
  line(x, y, midX, midY);
  strokeWeight(weight * 0.45);
  line(midX, midY, x + cos(tipAngle) * length, y + sin(tipAngle) * length);
}

// Organic blobby leaf dab — for leaf clusters and foliage accents.
// Four control points are arranged loosely in a diamond, then connected with
// Catmull-Rom splines (curveVertex) so there are no straight edges or sharp
// corners. `bend` widens one side of the blob and narrows the other; large
// per-vertex nudges give every mark a unique, irregular silhouette.
//
// `bend` (-1 → +1): asymmetric side widths — like a leaf pressed by the wind.
// `weight`: drives the thin stroke outline (×0.4), adding a painterly soft edge.
//
// `shapeSeed` (0–1) fixes the outline. The nudges come from hash01() of this
// seed, not p5's random(): marks are redrawn piecemeal (hover patch,
// background repaint in sketch.js), so each must keep the same shape every
// time it's drawn, and drawing must not use up the seeded random() stream the
// layout comes from. Pass the seed from a mark's *resting* place so it keeps
// its shape while the hover moves it; by default it's made from where it's drawn.
function dab(x, y, angle, size, weight, colour, bend = 0, shapeSeed = hash01(x, y, angle)) {
  fill(colour);
  stroke(colour);
  strokeWeight(max(0.5, weight * 0.4)); // thin outline gives a painterly edge
  const alongX = cos(angle),  alongY = sin(angle);
  const perpX  = -sin(angle), perpY  = cos(angle);
  const halfLen = size / 2;
  const halfWid = size * 0.42; // wider relative to length → rounder, more blobby
  const bendAmt = bend * size * 0.4;
  const nudge   = size * 0.18; // large nudge → noticeably irregular outline
  let nudgeIndex = 0;
  // stable stand-in for random(-nudge, nudge): same seed → same outline
  const wobble = () => (hash01(shapeSeed, nudgeIndex++) * 2 - 1) * nudge;
  // four control points in a loose diamond arrangement
  const p0 = [x + alongX * halfLen               + wobble(), y + alongY * halfLen               + wobble()]; // leading tip
  const p1 = [x + perpX * (halfWid + bendAmt)    + wobble(), y + perpY * (halfWid + bendAmt)    + wobble()]; // right side (widened by bend)
  const p2 = [x - alongX * halfLen               + wobble(), y - alongY * halfLen               + wobble()]; // trailing tip
  const p3 = [x - perpX * (halfWid - bendAmt)    + wobble(), y - perpY * (halfWid - bendAmt)    + wobble()]; // left side (narrowed by bend)
  // Catmull-Rom curve p0 → p1 → p2 → p3 (p3 and p0 repeated as the curve's
  // lead-in / lead-out points), written as bezier segments straight onto the
  // canvas: exactly what p5's beginShape + 6 × curveVertex drew, without its
  // per-call overhead (this runs for every leaf: ~90k marks a repaint, and
  // every frame in the hover patch). As with p5, the side p3 → p0 isn't
  // curved: the fill closes it, the outline leaves it open.
  // fill() / stroke() / strokeWeight() above have already set the canvas's
  // colours and line width.
  const points = [p3, p0, p1, p2, p3, p0];
  const context = drawingContext;
  context.beginPath();
  context.moveTo(p0[0], p0[1]);
  for (let i = 1; i <= 3; i++) {
    const before = points[i - 1];
    const from = points[i];
    const to = points[i + 1];
    const after = points[i + 2];
    context.bezierCurveTo(
      from[0] + (to[0] - before[0]) / 6, from[1] + (to[1] - before[1]) / 6,
      to[0] + (from[0] - after[0]) / 6, to[1] + (from[1] - after[1]) / 6, // same arithmetic order as p5
      to[0], to[1],
    );
  }
  context.fill();
  context.stroke();
}

// ---------------------------------------------------------------------------
// Number helpers (randomness without p5's random(), easing, falloff)
// ---------------------------------------------------------------------------

// Repeatable "random-looking" number 0–1 from up to four numbers: the same
// inputs always give the same result. Used where p5's random() can't be:
// anything drawn more than once must look the same each time, and must not
// use up the seeded random() stream the scene layout comes from.
function hash01(a, b = 0, c = 0, d = 0) {
  const wave = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719 + d * 4.581) * 43758.5453;
  return wave - Math.floor(wave); // keep only the fractional part
}

// Unseeded random number between min and max, for input effects (bursts).
// Uses Math.random so it never touches p5's seeded random() stream: the
// scene repaints in the background across several frames, and any p5
// random() call in between would change its layout.
function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

// Ease 0 → 1 with a gentle start and a gentle stop
function easeInOutSine(progress) {
  return (1 - Math.cos(Math.PI * progress)) / 2;
}

// 1 at distance 0, fading smoothly to 0 at `radius` (no hard edge)
function smoothFalloff(distance, radius) {
  if (distance >= radius) return 0;
  const closeness = 1 - distance / radius;
  return closeness * closeness * (3 - 2 * closeness); // smoothstep
}

// Move `current` toward `target`, closing most (~63%) of the gap every
// `seconds`. Frame-rate independent, and it slows down as it arrives, so the
// motion always looks eased. `deltaSeconds` = time since the last frame.
function approach(current, target, seconds, deltaSeconds) {
  if (seconds <= 0) return target;
  return target + (current - target) * Math.exp(-deltaSeconds / seconds);
}

// ---------------------------------------------------------------------------
// Shape tests (rects are { x, y, w, h }, ellipses { x, y, rx, ry })
// ---------------------------------------------------------------------------

// Is the point inside `rect`, grown by `padding` on every side?
function pointInRect(x, y, rect, padding = 0) {
  return (
    x > rect.x - padding &&
    x < rect.x + rect.w + padding &&
    y > rect.y - padding &&
    y < rect.y + rect.h + padding
  );
}

function rectsOverlap(rectA, rectB) {
  return (
    rectA.x < rectB.x + rectB.w &&
    rectA.x + rectA.w > rectB.x &&
    rectA.y < rectB.y + rectB.h &&
    rectA.y + rectA.h > rectB.y
  );
}

function pointInEllipse(x, y, ellipseArea) {
  const offsetX = (x - ellipseArea.x) / ellipseArea.rx;
  const offsetY = (y - ellipseArea.y) / ellipseArea.ry;
  return offsetX * offsetX + offsetY * offsetY <= 1;
}

// Is (x, y) inside the closed outline `points` ([{ x, y }, …])? Counts how
// many outline edges a ray going right from the point crosses: odd = inside.
function pointInPolygon(x, y, points) {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const a = points[index];
    const b = points[previous];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------------------
// Screen ↔ scene helpers
// ---------------------------------------------------------------------------

// Window (client) px → scene px, or null when off the canvas. The canvas is
// CSS-scaled with `object-fit: cover` (style.css), which crops one side; p5's
// own mouseX doesn't account for that crop.
function windowToScene(clientX, clientY) {
  const canvasElement = document.querySelector("canvas");
  if (!canvasElement) return null;
  const bounds = canvasElement.getBoundingClientRect();
  const coverScale = max(bounds.width / width, bounds.height / height);
  const cropX = (bounds.width - width * coverScale) / 2; // overflow, split evenly
  const cropY = (bounds.height - height * coverScale) / 2;
  const sceneX = (clientX - bounds.left - cropX) / coverScale;
  const sceneY = (clientY - bounds.top - cropY) / coverScale;
  if (sceneX < 0 || sceneX > width || sceneY < 0 || sceneY > height) return null;
  return { x: sceneX, y: sceneY };
}

// Lane scale at screen height y: 0 at the horizon, ~1 near the viewer (the
// `scale` lane() returns, worked backwards from y). For sizing effects by depth.
function laneScaleAt(y) {
  if (!vanishingPoint || y <= vanishingPoint.y) return 0.2;
  return (y - vanishingPoint.y) / (height - vanishingPoint.y);
}

// ---------------------------------------------------------------------------
// Resizing helper
// ---------------------------------------------------------------------------
// Backing pixels per design pixel so the canvas is crisp once it covers the
// window (scaled by whichever axis needs to stretch more), capped at
// cacheSettings.maxPixelDensity: every buffer, repaint, blur and copy costs
// density² — uncapped, a large Retina screen reached ~4.5 (20× the pixels of
// the design size) for marks that already look sharp at 2.
function sharpDensity() {
  const coverScale = max(
    windowWidth / canvasWidth,
    windowHeight / canvasHeight,
  );
  return min(coverScale * window.devicePixelRatio, cacheSettings.maxPixelDensity);
}
