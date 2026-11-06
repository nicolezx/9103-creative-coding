// Woldgate base scene — rough draft.
// Static scene: sky, hedge, road, grass verges, trees. Drawn once per seed.
// Keys: R = new random layout, S = save PNG.

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
// Fixed design size (16:9): the scene is always drawn in these coordinates, and
// CSS scales the canvas to cover the window, cropping whichever side overflows.
const canvasWidth = 1138;
const canvasHeight = 640;

// Mark counts were tuned on a 480 × 640 canvas; scale them by area so the
// marks stay just as dense at any design size.
const markDensity = (canvasWidth * canvasHeight) / (480 * 640);
let seed = 11;

// Debug overlays (D toggles)
const debug = {
  treeLabels: false, // label each tree's trunk base with its side + `along` value
};

// Perspective
// Ranges: [hard limits] are what the code can handle; "try" is what looks good.
const perspective = {
  horizon: 0.55, // horizon height as a fraction of canvas height [0–1, 0 = top]; try 0.4–0.7
  vanishingPointX: 0.8, // vanishing point x as a fraction of canvas width; pans the whole scene left/right
  //                        (lower = see more of the right verge, higher = more of the left) [0–1]; try 0.3–0.7
  roadHalfWidth: 0.35, // half the road width at the bottom edge, fraction of width [> 0]; try 0.15–0.5
  farHalfWidth: 8, // half the road width at the vanishing point, px [≥ 0, 0 = sharp point]; try 0–30
  compression: 0.8, // how quickly things shrink toward the horizon [> 0, 1 = even]; try 0.5–1.5
  //                   (< 1 = shrink sooner, > 1 = stay large longer then bunch at the horizon)
  curve: -0.2, // sideways bend of the far lane, moves the vanishing point [any, 0 = straight]; try -0.4–0.4
  zoom: 2, // crop scaled out from the vanishing point [> 0, 1 = none]; try 1–2
  //            (< 1 leaves a gap below the road's near end)
};

// Undergrowth clumps (bushes.js)
const treeSettings = {
  sizeFactor: [1.45, 2], // [min, max] tree height as a fraction of canvas height at lane scale 1 [> 0, min ≤ max]; try 0.8–2.5
  leavesPerBranch: [20, 30], // leaves scattered along each outer branch (all three passes combined) [whole number ≥ 0]; try 6–30
  leafDistance: 0.3, // LEAF DISTANCE/SPREAD how far leaves stray perpendicular to the branch, as a fraction of branch length [> 0]; try 0.05–0.4
  leafMarkLength: 0.1, // LEAF SIZE leaf dab length as a fraction of branch length [> 0]; try 0.05–0.25
};

const bushSettings = {
  baseAcross: 0.1, // nearest clump feet, in `across` units beyond each road edge [≥ 0, < 0 = on the road]; try 0–0.5
  acrossSpread: 0.45, // how much further out from there clumps can sit [≥ 0]; try 0–1
  spacing: 0.05, // gap between rows of clumps, in `along` units [> 0, smaller = more clumps, slower]; try 0.02–0.15
  clumpsPerRow: 1, // overlapping clumps at each step, so the verge fills up [whole number ≥ 1]; try 1–4
  farAlong: 0.95, // how far toward the vanishing point clumps reach [0–1, 1 = all the way]
  sizeFactor: [0.5, 0.8], // [min, max] clump height as a fraction of canvas height up close [> 0, min ≤ max]; try 0.2–1.2
  lumpFrequency: 1.4, // how many lobes the outline wobbles into [> 0, higher = more, smaller lobes]; try 0.5–3
  lumpDepth: 0.22, // how far the lobes push in/out [0–1, 0 = clean ellipse]; try 0–0.4
  marksPerClump: 1000, // dashes per clump, spread over the whole blob [whole number ≥ 0, 0 = none, higher = denser but slower]; try 80–300
  markLength: 0.07, // dash length as a fraction of clump size [> 0]; try 0.03–0.12
  curvedShare: 0.4, // fraction of dashes drawn curved [0–1, 0 = all straight]; try 0.2–0.6
  markBend: 0.15, // max bow of a curved dash, as a fraction of its length [≥ 0]; try 0.05–0.3
  // per-mark colour variation around palette.bush, as ± [hue°, saturation, brightness].
  // Hue kept tight so marks read as one plant; brightness carries the texture.
  markJitter: [0, 8, 6], // [each ≥ 0, 0 = flat colour]; try hue 0–5, saturation 3–10, brightness 5–12
  markWeight: 0.025, // dash thickness as a fraction of clump size (min 1px) [> 0]; try 0.01–0.04
  blurAmount: 0.01, // blur radius as a fraction of clump size (soft edges) [≥ 0, 0 = sharp]; try 0–0.05
};

// Road surface dashes (drawRoad).
const roadSettings = {
  markWeight: [1, 7.5], // [far, near] dash thickness, px: blended by lane() scale, so marks thin out
  //                       toward the vanishing point [> 0, far ≤ near]; try [0.6–1.5, 4–9] (was [0.6, 4.5])
};

// Night stars: small crosses in the upper sky (buildStars / drawStars). Their strength rides
// on palette.star's alpha, so paletteDrifted() repaints the cached scene as they fade.
const starSettings = {
  count: 20, // stars at the reference canvas size (scaled by marks()) [whole number ≥ 0]; try 40–250
  colour: [52, 12, 100], // warm white #FFFCE0, HSB [h 0–360, s/b 0–100]
  // when they show follows the time-of-day keyframes: _STARS in time.js
  rainDim: 0.5, // how much full rain dims them: visibility × (1 − rain × this) [0–1, 0 = rain has no effect,
  //               1 = heavy rain hides them]; try 0.3–0.7. Below 1 so a night shower (the seeded weather
  //               has one right at the first midnight) only dims the stars instead of wiping them out
  scatter: 0.7, // how far each star may wander inside its own grid cell [0–1, 0 = a rigid grid, 1 = anywhere
  //              in the cell, so neighbours can touch at cell edges]; try 0.5–0.8
  skyReach: 0.7, // lowest star, as a fraction of the way down to the horizon [0–1]; try 0.5–0.9
  size: [2.5, 6], // [min, max] arm length of a cross, px at the reference canvas size [> 0, min ≤ max]; try 2–9
  weight: [0.8, 1.4], // [min, max] line thickness, px [> 0, min ≤ max]; try 0.6–2
  brightness: [0.35, 1], // [min, max] per-star opacity before the night fade [0–1]; try 0.2–1
  tilt: 0.25, // max random turn of a star, radians [≥ 0, 0 = all upright]; try 0–0.8
  diagonalLength: 0.55, // the two diagonal strokes, as a fraction of the main arm [0–1, 0 = plain cross];
  //                        try 0.4–0.8 (shorter than the arms, so it reads as a sparkle, not an asterisk)
  twinkleRange: [0.5, 1.4], // [min, max] multiplier on each star's opacity as it twinkles [≥ 0, min ≤ max];
  //                            try [0.2–0.7, 1–1.6] (below 1 dims, above 1 glows brighter; capped at fully opaque)
  twinkleSpeed: 0.5, // how fast each star's glow wanders, noise steps per second [> 0]; try 0.2–1.5
};

// Filled every frame by resolvePalette() (time.js) from colors.js data.
const palette = {};

// Scene cache (AGENTS.md §5 "Render layers"). Drawing the whole scene takes
// ~250 ms (trees ~130, grass ~50, bushes ~45: ~90k marks), far too slow to
// repeat every frame. It's seeded and identical from frame to frame apart from
// the slowly drifting palette, so it's painted into an offscreen buffer and
// that picture is copied to the canvas each frame. Only the hovered patch is
// redrawn live (redrawArea). When the palette drifts, a fresh picture is
// painted in the background a few ms per frame (sceneSteps), then cross-faded in.
const cacheSettings = {
  colourThreshold: 6, // repaint once any palette colour has drifted this far (0–255 per RGB channel) [> 0];
  //                     try 3–12 (lower = smoother time-of-day changes, more background work)
  frameBudgetMs: 12, // ms per frame spent on a background repaint [> 0]; try 6–20
  //                    (higher = colours catch up sooner, but frames get slower while repainting)
  fadeFrames: 8, // frames to cross-fade a finished repaint in [whole number ≥ 1]; try 4–16
  maxPixelDensity: 2, // cap on backing pixels per design pixel (sharpDensity in utils.js) [> 0];
  //                     try 1.5–3 (higher = crisper on big Retina screens, but cost grows with its square)
  paintedOverThreshold: 4, // summed RGB difference (0–765) above which a pixel counts as covered by a bush/tree,
  //                          for clicks (isPaintedOverBase) [≥ 0]; try 2–10 (just above anti-aliasing noise)
};

// Total virtual days from bare winter trees to full spring density.
const seasonDays = 0.2; // [> 0]; try 10–40

// Leaf growth over the season: trees start bare (day 0) and reach full density at seasonDays.
const leafGrowthSettings = {
  growthDays: seasonDays,
  // leaves each tree adds in one go as the season advances; each group is
  // painted straight onto the saved picture (growLeaves), no repaint needed.
  // 1 = leaves appear one by one [whole number ≥ 1]; try 1–20
  leavesAtOnce: 1,
};
// Two sets of buffers: `current` is on screen, `pending` is being repainted
let buffers = null; // { current: { scene, base }, pending: { scene, base } } (p5.Graphics; base = under bushes/trees)
let rebuild = null; // background repaint in progress (sceneSteps generator)
let rebuildPalette = null; // palette snapshot the pending repaint started with
let cachedPaletteLevels = null; // palette snapshot the current picture was painted with
let fadeFrom = null; // previous picture, fading out over the new one
let fadeStart = 0; // frameCount when the fade began
let sceneDirty = true; // repaint immediately, in one go (first frame, seed / debug / resize changes)
let sceneBushes = []; // Bush objects in draw order, kept for partial redraws
let sceneTrees = []; // Tree objects in draw order

// Season: how far through spring leaf growth we are (0 = bare, 1 = full density).
// Advances with virtual time; never resets (the season moves forward only).
let seasonProgress = 0;
let totalVirtualDays = 0; // accumulated virtual days elapsed (paused time excluded)
let _lastSeasonFraction = -1; // getDayFraction() last frame, for the day-delta accumulator
let sceneStars = []; // star marks (buildStars), kept for twinkling and partial redraws
let treePlacements = []; // for the debug labels

// Range the HUD temperature meter spans, in °C [min < max]; spring in
// Yorkshire, roughly 0 at night to 20 on a warm afternoon.
const temperatureRange = { min: 0, max: 20 };
let vanishingPoint;

// ---------------------------------------------------------------------------
// internal clock
// ---------------------------------------------------------------------------

const hoursPerDay = 24;
const secsPerMin = 60;
const minsPerDay = 2; // real minutes for one virtual day (1 × 60 = 60 s)
const FRAME_RATE = 24; // frames per second. Cheap now the scene is cached (see cacheSettings); try 15–30

const clock = {
  dayLengthSeconds: minsPerDay * secsPerMin, // 120 s per virtual day
  startHour: 12, // virtual clock starts at noon
};

// Real milliseconds per virtual minute (1440 minutes in a day)
const msPerVirtualMinute = (clock.dayLengthSeconds * 1000) / (24 * 60);

let elapsed, timestampEl, currentTime;

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

// Refreshes the HUD text and meters. Runs once per virtual minute (setup()).
function updateHud() {
  currentTime = getTimeOfDay();
  timestampEl.textContent = currentTime;
  // midnight → midnight fills the bar once, then snaps back to empty
  setMeter("time", getDayFraction());

  const temperatureEl = document.querySelector("p.temperature");
  if (temperatureEl)
    temperatureEl.textContent = `${round(weather.temperature)}°C`;
  setMeter(
    "temperature",
    norm(weather.temperature, temperatureRange.min, temperatureRange.max),
  );

  const humidityEl = document.querySelector("p.humidity");
  if (humidityEl) humidityEl.textContent = `${round(weather.humidity * 100)}%`;
  setMeter("humidity", weather.humidity);

  const moistureEl = document.querySelector("p.moisture");
  if (moistureEl) moistureEl.textContent = `${round(weather.moisture * 100)}%`;

  const conditionsEl = document.querySelector("p.conditions");
  if (conditionsEl) conditionsEl.textContent = getConditions();
  setMeter("moisture", weather.moisture);
}

// Moves a HUD meter (index.html `.meter[data-meter=name]`) to `value` 0–1.
function setMeter(name, value) {
  const el = document.querySelector(`.meter[data-meter="${name}"]`);
  if (el) el.style.setProperty("--value", constrain(value, 0, 1));
}

// ---------------------------------------------------------------------------
// p5 lifecycle
// ---------------------------------------------------------------------------
function setup() {
  // elapsed = millis();
  timestampEl = document.querySelector("p.timestamp");
  if (timestampEl) {
    setInterval(updateHud, msPerVirtualMinute);
  }
  createCanvas(canvasWidth, canvasHeight);
  pixelDensity(sharpDensity());
  colorMode(HSB, 360, 100, 100, 1); // HSB everywhere; mixRGB() restores this exact mode
  strokeWeight(3);
  strokeCap(ROUND);
  frameRate(FRAME_RATE); // see FRAME_RATE near the clock settings above
  setupInputElements(); // leaf sway on hover + click bursts (user-input.js)
  setupWeather(); // precompute the weather noise arrays (noise.js)
}

function draw() {
  updateWeather(); // rain, moisture, temperature for this frame (noise.js)

  // Advance seasonal leaf growth. getDayFraction() is frozen while paused, so
  // this only accumulates real (un-paused) virtual time. Jumps larger than half
  // a day (e.g. backward arrow steps) are ignored, consistent with noise.js.
  {
    const f = getDayFraction();
    if (_lastSeasonFraction >= 0) {
      let delta = f - _lastSeasonFraction;
      if (delta < 0) delta += 1; // wrapped past midnight
      if (delta <= 0.5) totalVirtualDays += delta;
    }
    _lastSeasonFraction = f;
    seasonProgress = min(1, totalVirtualDays / leafGrowthSettings.growthDays);
  }

  // Update every palette entry for the current time of day and weather.
  // Time and weather only meet here (AGENTS.md §2): either works with the
  // other switched off (rain = 0 → no weather offset).
  Object.assign(
    palette,
    resolvePalette(
      getTimeBase(),
      getWeatherOffset(weather.rain),
      getDaylight(),
    ),
  );
  palette.star = starColour(); // night stars, faded by daylight and rain

  vanishingPoint = {
    x: width * perspective.vanishingPointX,
    y: height * perspective.horizon,
  };

  if (sceneDirty) {
    // repaint in one go (the very first frame has nothing to show yet)
    startRebuild();
    stepRebuild(Infinity);
    fadeFrom = null;
    sceneDirty = false;
  } else if (!rebuild && !fadeFrom && paletteDrifted()) {
    startRebuild();
  }
  if (rebuild) stepRebuild(cacheSettings.frameBudgetMs);
  // after the repaint step, so a picture that just finished gets the leaves
  // that came due while it was being painted before it is shown
  growLeaves();
  drawBuffer(buffers.current.scene); // the saved picture
  drawTwinkle(); // stars glow brighter and dimmer (before the hover patches, which draw their own)

  // patches of swaying tree leaves / rustling bush marks, if any (user-input.js)
  for (const swayArea of getSwayAreas()) redrawArea(swayArea);
  // after the patch, so a cross-fade covers the patch too (otherwise the patch
  // shows the new colours while the rest is mid-fade: a visible square)
  drawFadingPicture();
  updateRain(); // puddle patches, splashes, falling drops (rain.js)
  updateInputElements(); // fades the hover, draws rings and bursts on top (user-input.js)
}

// The whole scene, as steps: each `yield` is a point where a background
// repaint can pause until the next frame. The order of random() calls is the
// same as drawing it in one go, so the picture is identical either way —
// which is why nothing else may call p5's random() between frames (bursts use
// Math.random). Draws into whatever target stepRebuild() points p5 at.
function* sceneSteps() {
  randomSeed(seed);
  noiseSeed(seed);
  // solid base first: the sky's 1 px gradient lines only cover ~75% of each
  // pixel, which left the picture slightly see-through (redrawn patches then
  // showed the scene through them as a faint box)
  background(palette.skyTop);
  drawSky();
  noStroke();
  fill(palette.grass);
  rect(0, vanishingPoint.y, width, height - vanishingPoint.y); // flat base coat under the verges
  yield;
  drawRoad();
  yield;
  yield* drawGrass();
  copyBuffer(buffers.pending.scene, buffers.pending.base); // the layer under stars/bushes/trees, for redrawArea
  // stars after the base snapshot (not with the sky), so twinkling and hover
  // patches can redraw them over a starless sky; still before bushes/trees so
  // those cover them
  const stars = buildStars();
  drawStars(stars);
  snapshotStarBoxes(stars); // to check later whether anything is painted over each star
  // bushes after the ground so it doesn't cover them, before the trees so they sit in front
  const bushes = buildBushes();
  yield;
  for (const bush of bushes) {
    bush.draw();
    yield;
  }
  // build every tree, then every tree's leaves, before drawing any: the same
  // random() order as when leaves were generated while drawing, so the layout
  // is unchanged, and drawing no longer uses random() at all
  const { trees, placements } = buildTrees();
  for (const tree of trees) {
    tree.buildFoliage();
    yield;
  }
  const leavesPerStep = 1500; // big near trees have ~10k leaf marks: split them up
  for (const tree of trees) {
    tree.drawWood();
    yield; // pause after wood so the budgeter can break before the leaf passes
    tree.shownLeaves = leafTarget(tree); // growLeaves() adds the rest as they come due
    for (let i = 0; i < tree.shownLeaves; i += leavesPerStep) {
      tree.drawLeaves(null, i, min(i + leavesPerStep, tree.shownLeaves));
      yield;
    }
  }
  if (debug.treeLabels) drawTreeLabels(placements);
  findOpenStars(stars); // which stars nothing covers, so they can twinkle (drawTwinkle)
  return { stars, bushes, trees, placements };
}

// How many of this tree's leaf marks should be showing now: its share of
// seasonProgress, rounded down to whole groups of leavesAtOnce (all of them
// once the season is complete)
function leafTarget(tree) {
  const total = tree.foliage.length;
  if (seasonProgress >= 1) return total;
  const group = max(1, floor(leafGrowthSettings.leavesAtOnce));
  return min(total, floor((total * seasonProgress) / group) * group);
}

// Seasonal growth between repaints: paint each tree's newly due leaves
// straight onto the saved picture, so they appear a group at a time
// (leavesAtOnce) instead of in one big batch at the next repaint. Leaves are
// stored in growth order (buildFoliage), so a new leaf belongs on top of its
// own tree's shown leaves; nearer trees are then redrawn over it, only where
// it landed, so it stays behind them.
function growLeaves() {
  if (!buffers || sceneTrees.length === 0) return;
  let grew = false;
  swayPaused = true; // the picture holds leaves at rest; sway is drawn on top
  try {
    drawInto(buffers.current.scene, () => {
      sceneTrees.forEach((tree, index) => {
        if (tree.far) return; // far trees draw a crown, not leaf marks
        const from = tree.shownLeaves;
        const to = leafTarget(tree);
        if (to <= from) return;
        tree.drawLeaves(null, from, to);
        tree.shownLeaves = to;
        grew = true;
        const boxes = tree.foliage.slice(from, to).map(leafBox);
        for (const nearer of sceneTrees.slice(index + 1)) {
          const covered = boxes.filter((box) =>
            rectsOverlap(box, nearer.bounds),
          );
          if (covered.length > 0) redrawTreeOver(nearer, covered);
        }
        coverStars(boxes);
      });
    });
  } finally {
    swayPaused = false;
  }
  // so hover and clicks find the new leaves (user-input.js)
  if (grew) registerHitAreas("tree", sceneTrees);
}

// The box a resting leaf mark fits in (centred on it; padded for its width
// and anti-aliasing)
function leafBox(leaf) {
  const reach = leaf.length + 2;
  return { x: leaf.x - reach, y: leaf.y - reach, w: reach * 2, h: reach * 2 };
}

// Repaint `tree` (wood and shown leaves) inside `boxes` only, on top of what
// is there: puts a nearer tree back in front of leaves just grown behind it.
// A coarse grid of the boxes picks out the few leaves that touch them, so a
// big tree isn't checked box by box.
function redrawTreeOver(tree, boxes) {
  const cellSize = 16;
  const columnCount = ceil(width / cellSize);
  const cellsOf = (x, y, w, h, visit) => {
    const lastColumn = floor((x + w) / cellSize);
    const lastRow = floor((y + h) / cellSize);
    for (let row = max(0, floor(y / cellSize)); row <= lastRow; row++)
      for (
        let column = max(0, floor(x / cellSize));
        column <= lastColumn;
        column++
      )
        if (visit(row * columnCount + column)) return true;
    return false;
  };
  const touched = new Set();
  for (const box of boxes)
    cellsOf(box.x, box.y, box.w, box.h, (cell) => void touched.add(cell));

  const context = drawingContext;
  push(); // not context.save(): see withClip
  context.beginPath();
  for (const box of boxes) context.rect(box.x, box.y, box.w, box.h);
  context.clip(); // the union of the boxes: nothing outside them is touched
  try {
    tree.drawWood();
    for (let index = 0; index < tree.shownLeaves; index++) {
      const box = leafBox(tree.foliage[index]);
      if (cellsOf(box.x, box.y, box.w, box.h, (cell) => touched.has(cell)))
        tree.drawLeaves(null, index, index + 1);
    }
  } finally {
    pop();
  }
}

// A leaf grown over an open star covers it, so it must stop twinkling
// (drawTwinkle restores the star's box from the bare sky, erasing the leaf)
function coverStars(boxes) {
  for (const star of sceneStars) {
    if (!star.open) continue;
    const reach = (star.arm * star.tall) / 2 + star.lineWeight + 2;
    if (boxes.some((box) => pointInRect(star.x, star.y, box, reach)))
      star.open = false;
  }
}

function startRebuild() {
  ensureBuffers();
  rebuild = sceneSteps();
  rebuildPalette = paletteSnapshot();
}

// Run the background repaint for up to `budgetMs`, drawing into the pending
// buffer: p5's drawing functions are pointed at it for the duration
function stepRebuild(budgetMs) {
  const start = performance.now();
  swayPaused = true; // keep the picture clean: swaying leaves are drawn on top by redrawArea()
  try {
    drawInto(buffers.pending.scene, () => {
      while (true) {
        const step = rebuild.next();
        if (step.done) {
          finishRebuild(step.value);
          break;
        }
        if (performance.now() - start > budgetMs) break;
      }
    });
  } finally {
    swayPaused = false;
  }
}

// Run `drawing` with all of p5's drawing functions pointed at an offscreen
// buffer instead of the canvas, then point them back
function drawInto(buffer, drawing) {
  const instance = p5.instance;
  const mainRenderer = instance._renderer;
  const mainContext = drawingContext;
  instance._renderer = buffer._renderer;
  drawingContext = buffer.drawingContext; // bushes.js uses it for the blur
  try {
    drawing();
  } finally {
    instance._renderer = mainRenderer;
    drawingContext = mainContext;
  }
}

// Swap the finished picture on screen and start fading the old one out
function finishRebuild({ stars, bushes, trees, placements }) {
  const { current, pending } = buffers;
  buffers = { ...buffers, current: pending, pending: current }; // swap; keep the patch buffer
  fadeFrom = current.scene;
  fadeStart = frameCount;
  sceneStars = stars;
  sceneBushes = bushes;
  sceneTrees = trees;
  treePlacements = placements;
  registerHitAreas("bush", bushes); // so hover/click know where things are (user-input.js)
  registerHitAreas("tree", trees);
  cachedPaletteLevels = rebuildPalette;
  rebuild = null;
}

// The previous picture, fading out over everything drawn so far this frame
function drawFadingPicture() {
  if (!fadeFrom) return;
  const t = (frameCount - fadeStart) / cacheSettings.fadeFrames;
  if (t >= 1) {
    fadeFrom = null;
    return;
  }
  drawingContext.globalAlpha = 1 - t;
  drawBuffer(fadeFrom);
  drawingContext.globalAlpha = 1;
}

// Redraw just `area`: a circle ({ centreX, centreY, radius } + its bounding
// box { x, y, w, h }) or a box. Paints the static layer, then only the bushes
// and trees that overlap it, so hovered marks move without a full repaint
//
// The patch is painted on an offscreen buffer (like the saved picture), then
// its shape is copied to the canvas. Painting straight onto the visible canvas
// gave slightly different anti-aliasing on every leaf edge (the browser
// draws visible and offscreen canvases differently), which showed as a faint
// outline around the patch.
function redrawArea(area) {
  // 1. paint the patch on the offscreen patch buffer
  drawInto(buffers.patch, () => {
    withClip(area, () => {
      drawBuffer(buffers.current.base);
      drawStars(sceneStars, area); // the base has no stars: redraw them here
      for (const bush of sceneBushes)
        if (rectsOverlap(bush.bounds, area)) bush.draw(area);
      for (const tree of sceneTrees)
        if (rectsOverlap(tree.bounds, area)) tree.draw(area);
      if (debug.treeLabels) drawTreeLabels(treePlacements);
    });
  });
  // 2. fade its rim out, so it blends into the picture with no visible edge
  if (area.softEdge) fadeEdge(buffers.patch, area);
  // 3. copy just that shape onto the canvas
  withClip(area, () => drawBuffer(buffers.patch));
}

// Make the outer `area.softEdge` px of a round patch fade from solid to
// see-through ("destination-in" keeps the buffer only as much as the
// gradient is opaque)
function fadeEdge(buffer, area) {
  const context = buffer.drawingContext;
  const { centreX, centreY, radius, softEdge } = area;
  const gradient = context.createRadialGradient(
    centreX,
    centreY,
    radius - softEdge,
    centreX,
    centreY,
    radius,
  );
  gradient.addColorStop(0, "rgba(0, 0, 0, 1)"); // fully kept inside
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)"); // gone at the edge
  context.save();
  context.globalCompositeOperation = "destination-in";
  context.fillStyle = gradient;
  context.fillRect(area.x, area.y, area.w, area.h);
  context.restore();
}

// Run `drawing` with everything outside `area` masked off: a circle when
// it has a radius, otherwise its box
// push()/pop(), not the canvas's own save()/restore(): p5 remembers the last
// fill/stroke it set and skips setting the same one again, so a bare restore()
// leaves it out of step (the next fill() could be skipped and paint in a
// leftover colour). pop() puts p5's memory back in step with the canvas.
function withClip(area, drawing) {
  const context = drawingContext;
  push();
  context.beginPath();
  if (area.radius)
    context.arc(area.centreX, area.centreY, area.radius, 0, TWO_PI);
  else context.rect(area.x, area.y, area.w, area.h);
  context.clip();
  try {
    drawing();
  } finally {
    pop();
  }
}

// True once any palette colour has moved more than colourThreshold since the
// current picture was painted (time of day / weather), so it needs repainting
function paletteDrifted() {
  if (!cachedPaletteLevels) return true;
  for (const key in palette) {
    const now = palette[key].levels;
    const then = cachedPaletteLevels[key];
    if (!then) return true;
    // alpha too (index 3): palette.star fades in and out through its alpha
    for (let i = 0; i < 4; i++) {
      if (abs(now[i] - then[i]) > cacheSettings.colourThreshold) return true;
    }
  }
  // (new leaves don't need a repaint: growLeaves() paints them in)
  return false;
}

function paletteSnapshot() {
  return Object.fromEntries(
    Object.entries(palette).map(([key, colour]) => [
      key,
      colour.levels.slice(),
    ]),
  );
}

// (Re)make the five offscreen buffers (2 × scene + base, 1 patch) when missing or the pixel density changed
function ensureBuffers() {
  if (buffers && buffers.current.scene.pixelDensity() === pixelDensity())
    return;
  if (buffers) {
    for (const set of [buffers.current, buffers.pending]) {
      set.scene.remove();
      set.base.remove();
    }
    buffers.patch.remove();
  }
  const make = () => {
    const g = createGraphics(width, height);
    g.pixelDensity(pixelDensity());
    g.colorMode(HSB, 360, 100, 100, 1); // same as the main canvas (setup)
    g.strokeCap(ROUND);
    return g;
  };
  buffers = {
    current: { scene: make(), base: make() },
    pending: { scene: make(), base: make() },
    patch: make(), // where the hover patch is painted before it's copied to the canvas
  };
  fadeFrom = null;
}

// Pixel-for-pixel copy of one buffer into another
function copyBuffer(from, to) {
  const ctx = to.drawingContext;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(from.elt, 0, 0);
  ctx.restore();
}

// Paint a buffer over the whole canvas, pixel for pixel. The buffer has the
// canvas's exact pixel size, so it's copied with no scaling: scaling by a
// fractional pixel density would resample (soften) it slightly, and leaves
// redrawn crisply in a hover patch would then show as a sharper square.
// (save/restore keeps any clip and globalAlpha the caller has set.)
function drawBuffer(buffer) {
  const context = drawingContext;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0); // raw pixels, no pixel-density scale
  context.drawImage(buffer.elt, 0, 0);
  context.restore();
}

// Is a bush or tree actually painted at scene point (x, y)? Compares the saved
// picture with its base layer (sky + ground, before any bush or tree): where
// they match, the click landed on bare sky or ground. Exact to the pixel, so
// it catches gaps between leaves that the shape tests in user-input.js (circles
// around leaves, bush outlines) slightly overshoot. Reads 1 pixel per buffer,
// so it's cheap enough for clicks (not for every pointer move).
function isPaintedOverBase(x, y) {
  if (!buffers || !sceneBushes) return false;
  const density = buffers.current.scene.pixelDensity();
  const pixelX = floor(x * density);
  const pixelY = floor(y * density);
  const picture = buffers.current.scene.drawingContext.getImageData(
    pixelX,
    pixelY,
    1,
    1,
  ).data;
  const base = buffers.current.base.drawingContext.getImageData(
    pixelX,
    pixelY,
    1,
    1,
  ).data;
  const difference =
    abs(picture[0] - base[0]) +
    abs(picture[1] - base[1]) +
    abs(picture[2] - base[2]);
  return difference > cacheSettings.paintedOverThreshold;
}

function mousePressed() {
  handleInputClick(); // bursts from trees/bushes, rings everywhere (user-input.js)
}

function keyPressed() {
  if (key === "r" || key === "R") {
    // seed = floor(random(1, 10000));
    // console.log(seed);
    sceneDirty = true;
    redraw();
  }
  // if (key === "s" || key === "S") saveCanvas(`woldgate-${seed}`, "png");
  if (key === "d" || key === "D") {
    debug.treeLabels = !debug.treeLabels;
    sceneDirty = true; // labels are part of the cached scene
    redraw();
  }
  if (key === "w" || key === "W") {
    toggleWeather(); // noise weather on / off (off = dry, mean temperature; noise.js)
  }
  if (key === "t" || key === "T") useRealClock = !useRealClock; // toggle virtual ↔ real clock (AGENTS.md debug key)
  if (key === "p" || key === "P") togglePause(); // freeze / resume the time of day
  // pause and jump to the next / previous full hour (time.js stepHour)
  if (keyCode === RIGHT_ARROW) stepHour(1);
  if (keyCode === LEFT_ARROW) stepHour(-1);
}

// ---------------------------------------------------------------------------
// Sky
// ---------------------------------------------------------------------------
function drawSky() {
  const skyBottom = vanishingPoint.y + 10;

  // 1. gradient
  strokeWeight(1);
  for (let y = 0; y <= skyBottom; y++) {
    stroke(mixRGB(palette.skyTop, palette.skyLow, pow(y / skyBottom, 1.4)));
    line(0, y, width, y);
  }

  // 2. texture dabs + 3. noise-thresholded clouds
  // for (let i = 0; i < marks(1400); i++) {
  //   const x = random(width);
  //   const y = random(skyBottom);
  //   const gradientColour = mixRGB(
  //     palette.skyTop,
  //     palette.skyLow,
  //     pow(y / skyBottom, 1.4),
  //   );
  //   const isCloud = noise(x * 0.007, y * 0.03) > 0.56;
  //   dash(
  //     x,
  //     y,
  //     random(-0.12, 0.12),
  //     random(8, 20),
  //     random(2, 4.5),
  //     isCloud
  //       ? jitter(palette.cloud, 4, 4, 3, 0.85)
  //       : jitter(gradientColour, 5, 6, 5, 0.7),
  //   );
  // }
}

// ---------------------------------------------------------------------------
// Stars
// ---------------------------------------------------------------------------

// Star colour for this frame, with alpha = how visible stars are (0–1):
// from the time of day (getStarVisibility in time.js: out all night, gone by
// 5am, back from late afternoon), dimmed by rain (overcast sky).
// Kept in the palette so the scene still draws only from palette (AGENTS.md §2).
function starColour() {
  const darkness = getStarVisibility();
  const clearSky = constrain(1 - weather.rain * starSettings.rainDim, 0, 1);
  const [h, s, b] = starSettings.colour;
  return color(h, s, b, darkness * darkness * clearSky); // squared: stars come out late in the dusk
}

// Small four-pointed sparkles scattered over the upper sky, stored as data
// (like tree foliage) so drawTwinkle and hover patches can redraw them.
// Positions come from hash01() rather than random(), so they don't shift the
// seeded random() stream the rest of the scene is laid out from.
// Each star: { x, y, angle, arm, tall, lineWeight, colour: [h, s, b, a],
// length (its full extent, for partial redraws), twinkleSeed }.
function buildStars() {
  const visibility = alpha(palette.star);
  if (visibility <= 0) return [];
  const sizeScale = sqrt(markDensity); // marks() scales counts by area; lengths by width
  const lowest = vanishingPoint.y * starSettings.skyReach;
  const [h, s, b] = starSettings.colour;
  const stars = [];
  // Evenly spread: split the star band into a grid of roughly square cells,
  // one star per cell, nudged randomly inside it (jittered grid). Plain random
  // positions clump and leave big empty patches; this keeps the scatter loose
  // but never lets two stars bunch up or a stretch of sky go bare.
  const wanted = max(1, marks(starSettings.count));
  const columns = max(1, round(sqrt((wanted * width) / lowest)));
  const rows = max(1, round(wanted / columns));
  const cellW = width / columns;
  const cellH = lowest / rows;
  const margin = (1 - starSettings.scatter) / 2; // keep this fraction of the cell clear on each side
  for (let i = 0; i < columns * rows; i++) {
    const column = i % columns;
    const row = floor(i / columns);
    const x =
      (column + margin + hash01(seed, i, 1) * starSettings.scatter) * cellW;
    const y =
      (row + margin + hash01(seed, i, 2) * starSettings.scatter) * cellH;
    const height01 = y / lowest; // 0 = top of the sky, 1 = lowest star
    const fadeNearHorizon = 1 - height01 * 0.6; // thinning toward the horizon haze
    const arm = lerp(...starSettings.size, hash01(seed, i, 3)) * sizeScale;
    // a few stars get a slightly longer vertical arm, like a glint
    const tall = hash01(seed, i, 7) > 0.85 ? 1.4 : 1;
    const strength =
      lerp(...starSettings.brightness, hash01(seed, i, 6)) *
      fadeNearHorizon *
      visibility;
    stars.push({
      x,
      y,
      angle: (hash01(seed, i, 5) * 2 - 1) * starSettings.tilt,
      arm,
      tall,
      lineWeight: lerp(...starSettings.weight, hash01(seed, i, 4)),
      // colour fixed at paint time, so a redrawn patch matches the saved
      // picture even as the live palette drifts (like tree.woodColour)
      colour: [h, s, b, strength],
      length: arm * tall,
      twinkleSeed: hash01(seed, i, 8), // its own place in the twinkle noise, so stars don't pulse in step
    });
  }
  return stars;
}

// `area` (optional { x, y, w, h }): only draw stars inside it, for partial redraws
function drawStars(stars, area) {
  for (const star of stars) {
    if (area && !pointInRect(star.x, star.y, area, star.length * 2)) continue;
    drawStarCross(star);
  }
}

// One star at its painted opacity × its twinkle now: a cross of two dashes,
// plus two shorter, slightly thinner diagonals between its arms, so it reads
// as a sparkle rather than a plus sign
function drawStarCross(star) {
  const [h, s, b, a] = star.colour;
  const colour = color(h, s, b, min(1, a * twinkle(star)));
  dash(star.x, star.y, star.angle, star.arm, star.lineWeight, colour);
  dash(
    star.x,
    star.y,
    star.angle + HALF_PI,
    star.arm * star.tall,
    star.lineWeight,
    colour,
  );
  const diagonal = star.arm * starSettings.diagonalLength;
  const diagonalWeight = star.lineWeight * 0.75;
  dash(
    star.x,
    star.y,
    star.angle + QUARTER_PI,
    diagonal,
    diagonalWeight,
    colour,
  );
  dash(
    star.x,
    star.y,
    star.angle - QUARTER_PI,
    diagonal,
    diagonalWeight,
    colour,
  );
}

// How bright a star is right now, as a multiplier on its opacity: wanders
// smoothly and unpredictably between twinkleRange, following p5 noise() over
// time (each star at its own noise position). Exactly 1 while the cached
// picture is painted (swayPaused), so the saved picture stays at rest.
// noise(), not random(): random() would disturb the scene's seeded layout.
function twinkle(star) {
  if (swayPaused) return 1;
  const time = (millis() / 1000) * starSettings.twinkleSpeed;
  // stretch noise's mostly-middling values so stars reach both ends of the range
  const wander = constrain(
    (noise(star.twinkleSeed * 1000, time) - 0.3) / 0.4,
    0,
    1,
  );
  return lerp(...starSettings.twinkleRange, wander);
}

// A star's box in raw buffer pixels (padded for line width and anti-aliasing),
// clamped to the buffer
function starPixelBox(star, buffer) {
  const density = buffer.pixelDensity();
  const reach = (star.arm * star.tall) / 2 + star.lineWeight + 2;
  const left = max(0, floor((star.x - reach) * density));
  const top = max(0, floor((star.y - reach) * density));
  const right = min(buffer.width * density, ceil((star.x + reach) * density));
  const bottom = min(buffer.height * density, ceil((star.y + reach) * density));
  return { x: left, y: top, w: max(1, right - left), h: max(1, bottom - top) };
}

// Right after the stars are painted: keep the pixels around each one
function snapshotStarBoxes(stars) {
  const buffer = buffers.pending.scene;
  for (const star of stars) {
    star.pixelBox = starPixelBox(star, buffer);
    const { x, y, w, h } = star.pixelBox;
    star.pixelsBefore = buffer.drawingContext.getImageData(x, y, w, h).data;
  }
}

// Once the whole scene is painted: a star is "open" (can twinkle) only if no
// bush, tree or label has touched its box. drawTwinkle repaints the box from
// the starless base layer, which would otherwise erase whatever covers it.
function findOpenStars(stars) {
  const context = buffers.pending.scene.drawingContext;
  for (const star of stars) {
    const { x, y, w, h } = star.pixelBox;
    const after = context.getImageData(x, y, w, h).data;
    const before = star.pixelsBefore;
    star.open = after.every((value, index) => value === before[index]);
    star.pixelsBefore = null; // only needed for this check
  }
}

// Every frame: each open star's box is restored from the base layer (bare sky,
// copied pixel for pixel so it matches the picture exactly), then the star is
// drawn again at its current twinkle. ~150 tiny copies: cheap.
function drawTwinkle() {
  if (sceneStars.length === 0) return;
  const base = buffers.current.base.elt;
  const context = drawingContext;
  for (const star of sceneStars) {
    if (!star.open || star.colour[3] < 0.01) continue; // covered, or too faint to see
    const { x, y, w, h } = star.pixelBox;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0); // raw pixels, like drawBuffer
    context.drawImage(base, x, y, w, h, x, y, w, h);
    context.restore();
    drawStarCross(star);
  }
}

// ---------------------------------------------------------------------------
// Hedge band along the horizon
// ---------------------------------------------------------------------------
function drawHedge() {
  const laneEndX = lane(1, 0.5).x; // hedge dips where the lane ends
  for (let i = 0; i < marks(1100); i++) {
    const x = random(width);
    const hedgeHeight =
      10 + noise(x * 0.015, 5) * 38 * (abs(x - laneEndX) / (width / 2) + 0.3);
    const y = vanishingPoint.y + 4 - random(hedgeHeight);
    dash(
      x,
      y,
      random(TWO_PI),
      random(3, 7),
      random(2, 4),
      jitter(palette.bush, 10, 10, 12),
    );
  }
}

// ---------------------------------------------------------------------------
// Road
// ---------------------------------------------------------------------------
function drawRoad() {
  // 1. base trapezoid with wobbly edges
  noStroke();
  fill(palette.road);
  beginShape();
  for (let i = 0; i <= 50; i++) {
    const along = i / 50,
      point = lane(along, leftEdge(along));
    vertex(point.x, point.y);
  }
  for (let i = 50; i >= 0; i--) {
    const along = i / 50,
      point = lane(along, rightEdge(along));
    vertex(point.x, point.y);
  }
  endShape(CLOSE);

  // 2. dashes that follow the lane, sized by distance
  const scatterMarks = (
    count,
    acrossMin,
    acrossMax,
    colour,
    hueRange,
    saturationRange,
    brightnessRange,
  ) => {
    for (let i = 0; i < count; i++) {
      const along = pow(random(), 1.5) * 0.98;
      const across = lerp(
        leftEdge(along),
        rightEdge(along),
        random(acrossMin, acrossMax),
      );
      const point = lane(along, across);
      const nextPoint = lane(min(1, along + 0.03), across); // next point along this track
      const angle = atan2(nextPoint.y - point.y, nextPoint.x - point.x);
      dash(
        point.x,
        point.y,
        angle + random(-0.08, 0.08),
        lerp(2, 24, point.scale) * random(0.6, 1.3),
        lerp(...roadSettings.markWeight, point.scale),
        jitter(colour, hueRange, saturationRange, brightnessRange),
      );
    }
  };

  scatterMarks(marks(1800), 0, 1, palette.road, 8, 8, 4); // general surface
  scatterMarks(marks(900), 0.22, 0.36, palette.track, 2, 4, 4); // left tyre track
  scatterMarks(marks(900), 0.64, 0.78, palette.track, 2, 4, 4); // right tyre track
  scatterMarks(marks(350), 0.45, 0.55, palette.ridge, 2, 4, 4); // centre ridge
}

// ---------------------------------------------------------------------------
// Grass verges
// ---------------------------------------------------------------------------

// 3–5 blades fanning up from one centre
function clump(point, colour) {
  const bladeCount = floor(random(3, 6));
  for (let i = 0; i < bladeCount; i++) {
    blade(
      point.x + random(-3, 3) * point.scale,
      point.y,
      -HALF_PI + random(-0.55, 0.55),
      lerp(3, 30, point.scale) * random(0.6, 1.2),
      lerp(0.7, 3.6, point.scale),
      jitter(colour, 10, 10, 10),
    );
  }
}

// A generator: each `yield` lets a background repaint pause between passes
// (sceneSteps). Run it in one go with `for (const _ of drawGrass());`
function* drawGrass() {
  // dark → mid → light passes
  for (let i = 0; i < marks(700); i++) {
    const point = vergePoint();
    if (point) clump(point, palette.grassDark);
  }
  yield;
  for (let i = 0; i < marks(800); i++) {
    const point = vergePoint();
    if (point) clump(point, palette.grass);
  }
  yield;
  for (let i = 0; i < marks(350); i++) {
    const point = vergePoint();
    if (point) clump(point, palette.grassLight);
  }
  yield;

  // clumps spilling over the road edges
  for (let i = 0; i < marks(260); i++) {
    const along = pow(random(), 1.3);
    const across =
      random() < 0.5
        ? leftEdge(along) + random(-0.04, 0.02)
        : rightEdge(along) + random(-0.02, 0.04);
    clump(
      lane(along, across),
      random([palette.grass, palette.grassDark, palette.grassLight]),
    );
  }
  yield;

  // flower dots
  noStroke();
  for (let i = 0; i < marks(160); i++) {
    const point = vergePoint();
    if (!point) continue;
    fill(
      jitter(
        random() < 0.7 ? palette.flowerYellow : palette.flowerWhite,
        6,
        10,
        5,
      ),
    );
    circle(
      point.x,
      point.y - random(2, 10) * point.scale,
      lerp(1.5, 5, point.scale),
    );
  }
}

// ---------------------------------------------------------------------------
// Trees
// ---------------------------------------------------------------------------

// Tree layout: placements from the `along` lists, and a Tree for each (far → near)
function buildTrees() {
  const placements = [];
  const leftTrees = [0.04, 0.2, 0.36, 0.4, 0.52, 0.65, 0.8, 0.9]; // `along` positions on the lane
  const rightTrees = [
    0.02, 0.07, 0.18, 0.22, 0.35, 0.55, 0.7, 0.74, 0.77, 0.82, 0.85, 0.89, 0.91,
    0.915, 0.94,
  ]; // `along` positions on the lane

  for (const side of [-1, 1]) {
    if (side === -1) {
      for (let i = 0; i < leftTrees.length; i++) {
        const along = leftTrees[i] + random(0);
        const across = side < 0 ? -0.12 - random(0.1) : 1.12 + random(0.3);
        const point = lane(along, across);
        const treeHeight =
          point.scale * height * random(...treeSettings.sizeFactor);
        const kind = "leaf";
        if (point.x < -40 || point.x > width + 40 || point.y > height + 40)
          continue; // off-canvas (zoom pushes the nearest trees out of frame)
        placements.push({ point, treeHeight, kind, side, along });
      }
    } else if (side === 1) {
      for (let i = 0; i < rightTrees.length; i++) {
        const along = rightTrees[i] + random(0);
        const across = side < 0 ? -0.12 - random(0.3) : 1.12 + random(0.3);
        const point = lane(along, across);
        const treeHeight =
          point.scale * height * random(...treeSettings.sizeFactor);
        const kind = "leaf";
        if (point.x < -40 || point.x > width + 40 || point.y > height + 40)
          continue; // off-canvas (zoom pushes the nearest trees out of frame)
        placements.push({ point, treeHeight, kind, side, along });
      }
    }
  }

  placements.sort((a, b) => a.point.y - b.point.y); // far → near
  const trees = placements
    .map(
      ({ point, treeHeight, kind, side }) =>
        new Tree(point.x, point.y, treeHeight, kind, side),
    )
    .filter((tree) => !tree.far);
  return { trees, placements };
}

// Debug: label each trunk base with its side + `along` value, drawn after all
// trees so nearer trees don't cover the labels of farther ones
function drawTreeLabels(placements) {
  push();
  textSize(11);
  textAlign(CENTER, BOTTOM);
  for (const { point, side, along } of placements) {
    const label = `${side < 0 ? "L" : "R"} ${along}`;
    // keep labels on-canvas: some drawn trees have their base just past an edge
    const x = constrain(point.x, 20, width - 20);
    const y = constrain(point.y, 16, height - 4);
    noStroke();
    fill(0, 0, 0, 0.6);
    rect(x - textWidth(label) / 2 - 3, y - 14, textWidth(label) + 6, 14, 3);
    fill(0, 0, 100);
    text(label, x, y - 1);
  }
  pop();
}

// ---------------------------------------------------------------------------
// Bushes: overlapping blob clumps along each verge (see bushes.js)
// ---------------------------------------------------------------------------
// Builds the clumps (far → near) without drawing them
function buildBushes() {
  randomSeed(seed + 1); // separate random stream for the bushes
  const settings = bushSettings;

  const bushes = [];
  for (const side of [-1, 1]) {
    for (
      let distance = 0;
      distance < settings.farAlong;
      distance += settings.spacing
    ) {
      for (let i = 0; i < settings.clumpsPerRow; i++) {
        const along = distance + random(-0.02, 0.02);
        const outward = settings.baseAcross + random(settings.acrossSpread);
        const across = side < 0 ? -outward : 1 + outward;
        const point = lane(max(0, along), across);
        if (point.x < -width * 0.25 || point.x > width * 1.25) continue;
        let size = point.scale * height * random(...settings.sizeFactor);
        // 0 in the middle third of the screen → 1 at the edges; about half the
        // clumps out there get scaled up so the sides are framed by bigger shrubs
        const edgeness = constrain(
          map(abs(point.x - width / 2), width * 0.3, width * 0.5, 0, 1),
          0,
          1,
        );
        if (random() < 0.5) size *= 1 + edgeness * random(0.2, 0.5);
        // shift outward by about half the clump's width so it grows away
        // from the lane instead of spilling over the road
        bushes.push(new Bush(point.x + side * size * 0.3, point.y, size));
      }
    }
  }

  bushes.sort((a, b) => a.y - b.y); // far → near
  randomSeed(seed); // reset so the trees get exactly the same layout as before
  return bushes;
}

// ---------------------------------------------------------------------------
// Resizing
// CSS stretches the canvas instantly while the window is being resized; once
// resizing settles, re-render once at a density that matches the new size.
// ---------------------------------------------------------------------------
let resizeTimer;

function windowResized() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    pixelDensity(sharpDensity());
    sceneDirty = true; // cache size follows the pixel density
    redraw();
  }, 200);
}
