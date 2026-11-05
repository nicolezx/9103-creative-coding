// ── Rain + puddle (live layer) ────────────────────────────────────────────────
// Drawn every frame on top of the cached scene, following weather.rain and
// weather.moisture (noise.js). Three kinds of object, each a small class with
// update(dt) / draw() / done, kept in module-level arrays like the click rings
// in user-input.js:
//
//   Raindrop  slightly wavering stroke (a bezier with its two inner control
//             points nudged sideways, after deconbatch's "twisted vertex")
//             falling from the top of the screen toward a
//             landing point picked on the ground, fading a little each frame.
//             Drops that fade out first vanish mid-air; drops that land on the
//             lane near enough to see leave a Splash and a WetPatch. Drops
//             landing beside the lane (verges, bushes) leave no mark.
//   Splash    the mark a drop leaves: a flat oblong ripple (the loops in the
//             reference painting)
//   WetPatch  a dark translucent smear on the road. Overlapping patches build
//             up into a puddle; they spread as moisture rises and fade slowly,
//             faster when the ground is drying, so the puddle visibly grows
//             and shrinks with the weather. Part of them collect at the
//             puddle spot, so one deep puddle forms. The spot moves at most
//             once a day, at a random time, and only once the lane has dried.
//
// Ripples and patches are wobbly blobs (blob()), not perfect ellipses.
// Patches are drawn into their own layer (puddleLayer), which is then laid
// over the scene with MULTIPLY: the road's marks and colours show through the
// water, and however many patches overlap, the deepest the puddle can get is
// the ground × the wet colour, never a flat opaque fill.
//
// Randomness uses Math.random, never p5's random(): the cached scene relies on
// p5's random() sequence being untouched between frames (sketch.js sceneSteps).
// [a, b] pairs below are far → near, scaled by the landing point's depth.

const rainSettings = {
  maxDropsPerSecond: 160, // new drops at rain = 1 (scaled by rain) [≥ 0]; try 80–300
  dropLength: [6, 44], // stroke length, px [> 0]; try 4–10 / 25–60
  dropWeight: [0.7, 2.2], // stroke thickness, px [> 0]
  fallSpeed: [500, 1400], // px per second; near drops fall faster (parallax) [> 0]; try 300–2000
  dropTwist: 0.07, // sideways wobble of a stroke's control points, × its length [≥ 0];
  //                  try 0.03–0.15 (0 = straight line)
  dropAlpha: 0.8, // opacity a drop starts with [0–1]
  dropFade: 0.5, // opacity lost per second while falling [≥ 0]; try 0.2–1
  //                (higher → more drops vanish before they reach the ground)
  splashMinScale: 0.12, // drops landing further away than this depth vanish without a mark,
  //                       too small to see [0–1]; try 0.05–0.3

  splashLife: 0.6, // seconds a ripple takes to fade [> 0]; try 0.3–1
  splashWidth: [4, 36], // ripple width, px [> 0]
  splashFlatten: 0.3, // ripple height ÷ width (lies flat on the ground) [> 0]; try 0.2–0.45
  blobPoints: 7, // outline points of a ripple / patch [≥ 4]; try 5–9
  blobWobble: 0.25, // how far each outline point strays from an even oval, × radius
  //                   [0–1, 0 = ellipse]; try 0.15–0.4

  maxPatches: 700, // oldest patches are dropped past this (performance) [≥ 0]; try 300–1200
  patchAlpha: 0.2, // opacity of one patch; overlaps build up into a puddle [0–1]; try 0.1–0.35
  patchSize: [6, 70], // patch width on dry ground, px [> 0]
  patchGrowth: 2.5, // size multiplier at moisture = 1 (patches spread and merge) [≥ 1]; try 1.5–4
  patchFadeDry: 0.02, // opacity lost per second at moisture = 0 (~7 s to vanish); try 0.01–0.05
  patchFadeWet: 0.002, // …at moisture = 1 (~70 s), so a soaked lane keeps its puddle; try 0.001–0.01
  rutPull: 0.6, // how far patches slide toward the nearest tyre rut, where water
  //               pools in the paintings [0 = where they land, 1 = rut centre]; try 0.3–0.8
  wetDarken: 0.42, // brightness the ground keeps under the deepest water (MULTIPLY colour) [0–1];
  //                 try 0.35–0.75 (lower = darker puddle)
  wetTint: 0.6, // how much of the track colour's saturation tints the water [0–1]; try 0.3–1

  // The puddle: a spot in the foreground of the road. A share of road patches
  // land around it instead of where the drop fell, so they stack up into one
  // darker, deeper puddle. Each virtual day, at a random time, the spot is
  // due to move; it moves as soon as the lane is dry (it never jumps while a
  // puddle is visible). If the lane stays wet, it waits.
  puddleShare: 0.5, // fraction of road patches that go to the puddle [0–1]; try 0.3–0.7
  puddleDepth: [0.55, 0.85], // where on screen it can sit, from horizon (0) to bottom edge (1) [0–1]
  puddleAcross: [0.25, 0.75], // …and across the road (0 = left edge, 1 = right)
  puddleSpread: { along: 0.14, across: 0.2 }, // puddle radius in lane() units at moisture = 1
  //   (uncapped; puddleMaxMoisture below keeps it smaller).
  //   `along` stretches it back up the lane (deep, like the reference), `across` sideways;
  //   try along 0.08–0.2, across 0.12–0.3
  puddleMinSpread: 0.35, // radius at moisture = 0, × puddleSpread (grows to 1 as it gets wetter)
  puddleMaxMoisture: 0.6, // the puddle stops getting bigger past this moisture [0–1]; try 0.4–1
  //                         (1 = no cap). Heavier rain still adds patches, so it gets
  //                         deeper and darker instead of flooding the lane
  puddleSizeBoost: 1.6, // puddle patches are this much bigger than stray ones [≥ 1]; try 1–2.5
  puddleEdgeMargin: 0.12, // gap kept between the puddle (whole patches, at their widest) and
  //                         the road edges, as a fraction of road width [0–0.4]; try 0.05–0.25
  puddleDryMoisture: 0.05, // "dry enough" to move the spot: moisture below this, and no rain [0–1]; try 0–0.15
};

let raindrops = [];
let splashes = [];
let wetPatches = [];
let dropsOwed = 0; // fractional drops carried between frames, so light drizzle still spawns

// Rut centres (`across`), matching the tyre-track bands drawRoad() paints
const rutCentres = [0.29, 0.71];

let puddleLayer = null; // p5.Graphics the wet patches are drawn into (see top)
let puddleSpot = null; // { along, across } of the puddle (pickPuddleSpot)
let puddleMoveTime = Math.random(); // today's time to move the spot (day fraction)
let puddleMoveDue = false; // move time passed, waiting for the lane to dry
let lastRainDayFraction = null; // to spot the move time and midnight

// Called from draw() after the scene: spawns, moves and draws everything.
function updateRain() {
  const deltaSeconds = min(deltaTime, 250) / 1000; // capped so a stall doesn't teleport drops

  updatePuddleSpot();

  dropsOwed += weather.rain * rainSettings.maxDropsPerSecond * deltaSeconds;
  while (dropsOwed >= 1) {
    raindrops.push(new Raindrop());
    dropsOwed--;
  }

  // Colours once per frame, from the palette, so rain follows time of day
  const dropColour = colourToHsb(palette.cloud); // pale, sky-tinted
  const [trackHue, trackSat] = colourToHsb(palette.track);
  const wetColour = [trackHue, trackSat * rainSettings.wetTint, rainSettings.wetDarken * 100];

  for (const drop of raindrops) {
    drop.update(deltaSeconds);
    if (drop.landed) land(drop);
  }
  for (const splash of splashes) splash.update(deltaSeconds);
  for (const patch of wetPatches) patch.update(deltaSeconds);
  raindrops = raindrops.filter((drop) => !drop.done);
  splashes = splashes.filter((splash) => !splash.done);
  wetPatches = wetPatches.filter((patch) => !patch.done);
  if (wetPatches.length > rainSettings.maxPatches)
    wetPatches.splice(0, wetPatches.length - rainSettings.maxPatches);

  // ground first (puddle, then ripples), drops on top
  if (!puddleLayer || puddleLayer.width !== width || puddleLayer.height !== height) {
    puddleLayer = createGraphics(width, height);
    puddleLayer.colorMode(HSB, 360, 100, 100, 1);
  }
  puddleLayer.clear();
  puddleLayer.noStroke();
  for (const patch of wetPatches) patch.draw(wetColour, puddleLayer);

  push();
  if (wetPatches.length) {
    blendMode(MULTIPLY);
    image(puddleLayer, 0, 0);
    blendMode(BLEND);
  }
  noFill();
  for (const splash of splashes) splash.draw(dropColour);
  for (const drop of raindrops) drop.draw(dropColour);
  pop();
}

// A drop has hit the ground: ripple + wet patch, if it's on the lane
function land(drop) {
  const ground = drop.ground;
  if (!ground.inLane) return; // verges / bushes: no splash, no patch
  if (ground.scale < rainSettings.splashMinScale) return;
  // the drop's landing point is hidden behind a tree: it hits the leaves instead
  if (getRegion(drop.x, drop.y) === "tree") return;
  splashes.push(new Splash(drop.x, drop.y, ground.scale));
  if (ground.onRoad) wetPatches.push(new WetPatch(ground));
}

// Moves the puddle spot at most once a day: at a random time, or later that
// day (or the next) once the ground is dry, so the puddle never visibly jumps.
function updatePuddleSpot() {
  const dayFraction = getDayFraction();
  if (!puddleSpot) pickPuddleSpot();
  if (lastRainDayFraction !== null) {
    if (dayFraction < lastRainDayFraction) {
      puddleMoveTime = Math.random(); // midnight: a new random time for the new day
    } else if (lastRainDayFraction < puddleMoveTime && dayFraction >= puddleMoveTime) {
      puddleMoveDue = true;
    }
  }
  lastRainDayFraction = dayFraction;

  const dry =
    weather.rain === 0 && weather.moisture < rainSettings.puddleDryMoisture;
  if (puddleMoveDue && dry) {
    pickPuddleSpot();
    puddleMoveDue = false;
  }
}

// A new puddle spot, somewhere in the foreground of the road
function pickPuddleSpot() {
  const [nearDepth, farDepth] = rainSettings.puddleDepth;
  const y = lerp(vanishingPoint.y, height, lerp(nearDepth, farDepth, Math.random()));
  puddleSpot = {
    along: alongAtY(y),
    across: lerp(...rainSettings.puddleAcross, Math.random()),
  };
}

// Screen y below the horizon → lane() `along`, like getRegion() in user-input.js
function alongAtY(y) {
  const depth = (y - vanishingPoint.y) / ((height - vanishingPoint.y) * perspective.zoom);
  return pow(constrain(1 - depth, 0, 1), 1 / perspective.compression);
}

// 0 far → 1 at the bottom edge: the size scale for marks at screen y
function depthAtY(y) {
  return (y - vanishingPoint.y) / (height - vanishingPoint.y);
}

// Random ground point anywhere on screen below the horizon, as
// { x, y, along, across, scale, inLane, onRoad }.
function randomGroundPoint() {
  const x = Math.random() * width;
  const y = lerp(vanishingPoint.y + 2, height, Math.random());
  const along = alongAtY(y);
  const roadLeft = lane(along, leftEdge(along)).x;
  const roadRight = lane(along, rightEdge(along)).x;
  const across = (x - roadLeft) / (roadRight - roadLeft);
  return {
    x,
    y,
    along,
    across,
    scale: depthAtY(y), // 0 far → 1 near
    inLane: across >= 0 && across <= 1, // between the road edges
    onRoad: across > 0.05 && across < 0.95, // wet patches: also clear of trunks at the edge
  };
}

// Random outline radii for blob(), fixed per object so it doesn't morph
function blobRadii() {
  const radii = [];
  for (let i = 0; i < rainSettings.blobPoints; i++)
    radii.push(1 + (Math.random() * 2 - 1) * rainSettings.blobWobble);
  return radii;
}

// Wobbly closed oval through `radii` (one per outline point), w × h across.
// Catmull-Rom curve, so no corners; uses the current fill / stroke of `g`
// (the main canvas, or a p5.Graphics).
function blob(x, y, w, h, radii, g = window) {
  const count = radii.length;
  g.beginShape();
  // the curve needs one extra point before and two after to close smoothly
  for (let i = -1; i <= count + 1; i++) {
    const index = (i + count) % count;
    const angle = (TWO_PI * index) / count;
    g.curveVertex(
      x + Math.cos(angle) * (w / 2) * radii[index],
      y + Math.sin(angle) * (h / 2) * radii[index],
    );
  }
  g.endShape();
}

class Raindrop {
  constructor() {
    this.ground = randomGroundPoint();
    const depth = this.ground.scale;
    this.x = this.ground.x; // rain falls straight down (no wind)
    this.length = lerp(...rainSettings.dropLength, depth);
    this.weight = lerp(...rainSettings.dropWeight, depth);
    this.speed = lerp(...rainSettings.fallSpeed, depth) * (0.85 + Math.random() * 0.3);
    this.y = -Math.random() * this.length; // y = the drop's lower tip
    // bezier control points: where along the stroke (secL, twice that) and
    // how far sideways, fixed per drop so the stroke doesn't wriggle as it falls
    const twist = () => (Math.random() * 2 - 1) * rainSettings.dropTwist * this.length;
    this.bendAt = 0.2 + Math.random() * 0.2;
    this.bendX = [twist(), twist()];
    this.alpha = rainSettings.dropAlpha;
    this.landed = false;
    this.done = false;
  }

  update(dt) {
    this.y += this.speed * dt;
    this.alpha -= rainSettings.dropFade * dt; // fades a little every frame
    if (this.alpha <= 0) this.done = true; // evaporated mid-air
    else if (this.y >= this.ground.y) {
      this.y = this.ground.y;
      this.landed = true;
      this.done = true;
    }
  }

  draw([h, s, b]) {
    stroke(h, s, b, this.alpha);
    strokeWeight(this.weight);
    const top = this.y - this.length;
    bezier(
      this.x, top,
      this.x + this.bendX[0], top + this.length * this.bendAt,
      this.x + this.bendX[1], top + this.length * this.bendAt * 2,
      this.x, this.y,
    );
  }
}

class Splash {
  constructor(x, y, depth) {
    this.x = x;
    this.y = y;
    this.depth = depth;
    this.radii = blobRadii();
    this.age = 0;
    this.done = false;
  }

  update(dt) {
    this.age += dt;
    if (this.age >= rainSettings.splashLife) this.done = true;
  }

  draw([h, s, b]) {
    const progress = this.age / rainSettings.splashLife;
    stroke(h, s, b, (1 - progress) * 0.8);
    strokeWeight(max(0.6, 1.6 * this.depth));
    const w = lerp(...rainSettings.splashWidth, this.depth);
    // oblong ripple spreading out from where the drop hit
    const rippleWidth = w * (0.4 + 0.6 * progress);
    blob(this.x, this.y, rippleWidth, rippleWidth * rainSettings.splashFlatten, this.radii);
  }
}

// Moisture as the puddle's size sees it: capped, so very heavy rain deepens
// the puddle rather than spreading it further (puddleMaxMoisture)
function puddleMoisture() {
  return Math.min(weather.moisture, rainSettings.puddleMaxMoisture);
}

// Patch size multiplier for a moisture level (patches spread as it gets wetter)
function patchGrowthAt(moisture) {
  return lerp(1, rainSettings.patchGrowth, moisture);
}

// Slides a puddle patch (and if it's too big for the road, shrinks it) so
// that even at its widest — capped growth, widest blob radius — it stays
// puddleEdgeMargin inside the road edges. Patches past a limit are mirrored
// back inside it rather than stacked on it, so the puddle's sides stay soft
// instead of forming a dark line. Returns [across, size].
function keepOffEdges(along, across, size, radii) {
  const roadWidth = lane(along, 1).x - lane(along, 0).x; // px per 1 `across`
  const growth = patchGrowthAt(rainSettings.puddleMaxMoisture);
  const halfWidth = (size * growth * Math.max(...radii)) / 2 / roadWidth;
  const left = leftEdge(along) + rainSettings.puddleEdgeMargin;
  const right = rightEdge(along) - rainSettings.puddleEdgeMargin;
  const room = (right - left) / 2;
  if (halfWidth > room) return [(left + right) / 2, (size * room) / halfWidth];
  const lo = left + halfWidth;
  const hi = right - halfWidth;
  if (across < lo) across = lo + (lo - across);
  if (across > hi) across = hi - (across - hi);
  return [constrain(across, lo, hi), size];
}

class WetPatch {
  constructor(ground) {
    let along = ground.along;
    let across;
    let sizeBoost = 1;
    if (Math.random() < rainSettings.puddleShare) {
      // into the puddle. Along the lane, a gently peaked spread (mostly even,
      // so the puddle runs deep back up the road without one dark knot);
      // across, sum of two randoms (−1 to 1, peaked at 0) so the sides taper.
      // The puddle spreads further as the ground gets wetter, up to puddleMaxMoisture.
      const spread = lerp(rainSettings.puddleMinSpread, 1, puddleMoisture());
      const centred = () => Math.random() + Math.random() - 1;
      const even = () => Math.random() * 2 - 1;
      along =
        puddleSpot.along +
        lerp(even(), centred(), 0.4) * rainSettings.puddleSpread.along * spread;
      across = puddleSpot.across + centred() * rainSettings.puddleSpread.across * spread;
      sizeBoost = rainSettings.puddleSizeBoost;
    } else {
      // stray patch: slide toward the nearest rut
      const rut = rutCentres.reduce((a, b) =>
        abs(b - ground.across) < abs(a - ground.across) ? b : a,
      );
      across = lerp(ground.across, rut, rainSettings.rutPull * Math.random());
    }
    // y (and so size) depends only on `along`
    this.radii = blobRadii();
    this.size =
      lerp(...rainSettings.patchSize, depthAtY(lane(along, 0.5).y)) *
      sizeBoost *
      (0.7 + Math.random() * 0.6);
    this.inPuddle = sizeBoost > 1;
    if (this.inPuddle) {
      [across, this.size] = keepOffEdges(along, across, this.size, this.radii);
    }
    // re-project so it sits on the ground
    const point = lane(along, across);
    this.x = point.x;
    this.y = point.y;
    this.alpha = rainSettings.patchAlpha;
    this.done = false;
  }

  update(dt) {
    // dries slowly on soaked ground, quickly once the lane is drying out
    this.alpha -= lerp(rainSettings.patchFadeDry, rainSettings.patchFadeWet, weather.moisture) * dt;
    if (this.alpha <= 0) this.done = true;
  }

  draw([h, s, b], g) {
    g.fill(h, s, b, this.alpha);
    // read at draw time so existing patches spread / shrink with moisture
    const size =
      this.size * patchGrowthAt(this.inPuddle ? puddleMoisture() : weather.moisture);
    blob(this.x, this.y, size, size * 0.3, this.radii, g);
  }
}
