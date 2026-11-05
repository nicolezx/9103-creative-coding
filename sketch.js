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
  clumpsPerBranch: [2, 4], // [min, max] leaf clumps on each outer branch [≥ 0, min ≤ max]; try 0–5
  clumpSize: [0.3, 0.4], // [min, max] clump radius as a fraction of its branch's length [> 0]; try 0.15–0.7
  leafMarksPerClump: 90, // dabs per clump on the nearest trees (far trees get fewer) [whole number ≥ 0, higher = denser but slower]; try 30–150
  leafMarkLength: 0.4, // dab length as a fraction of clump radius [> 0]; try 0.15–0.5
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
  markWeight: 0.025, // dash thickness as a fraction of clump size (min 1px) [> 0]; try 0.01–0.04
  blurAmount: 0.01, // blur radius as a fraction of clump size (soft edges) [≥ 0, 0 = sharp]; try 0–0.05
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
let treePlacements = []; // for the debug labels

// Temporary stand-in for the Weather layer: `rain` 0–1 picks the weather
// palette (0 = dry, 0.5 = overcast, 1 = wet). W cycles it for testing.
const weatherStub = { rain: 0 };
let vanishingPoint;

// ---------------------------------------------------------------------------
// internal clock
// ---------------------------------------------------------------------------

const hoursPerDay = 24;
const secsPerMin = 60;
const minsPerDay = 1; // real minutes for one virtual day (1 × 60 = 60 s)
const FRAME_RATE = 24; // frames per second. Cheap now the scene is cached (see cacheSettings); try 15–30

const clock = {
  dayLengthSeconds: minsPerDay * secsPerMin, // 120 s per virtual day
  startHour: 12, // virtual clock starts at noon
};

// Real milliseconds per virtual minute (1440 minutes in a day)
const msPerVirtualMinute = (clock.dayLengthSeconds * 1000) / (24 * 60);

let elapsed, timestampEl, currentTime;

// ---------------------------------------------------------------------------
// p5 lifecycle
// ---------------------------------------------------------------------------
function setup() {
  // elapsed = millis();
  timestampEl = document.querySelector("p.timestamp");
  if (timestampEl) {
    setInterval(() => {
      currentTime = getTimeOfDay();
      timestampEl.textContent = currentTime;
    }, msPerVirtualMinute);
  }
  createCanvas(canvasWidth, canvasHeight);
  pixelDensity(sharpDensity());
  colorMode(HSB, 360, 100, 100, 1); // HSB everywhere; mixRGB() restores this exact mode
  strokeWeight(3);
  strokeCap(ROUND);
  frameRate(FRAME_RATE); // see FRAME_RATE near the clock settings above
  setupInputElements(); // leaf sway on hover + click bursts (user-input.js)
}

function draw() {
  // Update every palette entry for the current time of day and weather.
  // Time and weather only meet here (AGENTS.md §2): either works with the
  // other switched off (rain = 0 → no weather offset).
  Object.assign(
    palette,
    resolvePalette(
      getTimeBase(),
      getWeatherOffset(weatherStub.rain),
      getDaylight(),
    ),
  );

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
  drawPicture();

  const swayArea = getSwayArea(); // patch of swaying leaves, if any (user-input.js)
  if (swayArea) redrawArea(swayArea);
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
  copyBuffer(buffers.pending.scene, buffers.pending.base); // the layer under bushes/trees, for redrawArea
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
    for (let i = 0; i < tree.foliage.length; i += leavesPerStep) {
      tree.drawLeaves(null, i, i + leavesPerStep);
      yield;
    }
  }
  if (debug.treeLabels) drawTreeLabels(placements);
  return { bushes, trees, placements };
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
  const instance = p5.instance;
  const mainRenderer = instance._renderer;
  const mainContext = drawingContext;
  instance._renderer = buffers.pending.scene._renderer;
  drawingContext = buffers.pending.scene.drawingContext; // bushes.js uses it for the blur
  swayPaused = true; // keep the picture clean: swaying leaves are drawn on top by redrawArea()
  try {
    while (true) {
      const step = rebuild.next();
      if (step.done) {
        finishRebuild(step.value);
        break;
      }
      if (performance.now() - start > budgetMs) break;
    }
  } finally {
    instance._renderer = mainRenderer;
    drawingContext = mainContext;
    swayPaused = false;
  }
}

// Swap the finished picture on screen and start fading the old one out
function finishRebuild({ bushes, trees, placements }) {
  const { current, pending } = buffers;
  buffers = { current: pending, pending: current };
  fadeFrom = current.scene;
  fadeStart = frameCount;
  sceneBushes = bushes;
  sceneTrees = trees;
  treePlacements = placements;
  registerHitAreas("bush", bushes); // so hover/click know where things are (user-input.js)
  registerHitAreas("tree", trees);
  cachedPaletteLevels = rebuildPalette;
  rebuild = null;
}

// Copy the current picture to the canvas, with the previous one fading out on top
function drawPicture() {
  drawBuffer(buffers.current.scene);
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

// Redraw just `area` ({ x, y, w, h }): the static layer, then only the bushes
// and trees that overlap it, so hovered marks move without a full repaint
function redrawArea(area) {
  const ctx = drawingContext;
  ctx.save();
  ctx.beginPath();
  ctx.rect(area.x, area.y, area.w, area.h);
  ctx.clip();
  drawBuffer(buffers.current.base);
  for (const bush of sceneBushes) if (rectsOverlap(bush.bounds, area)) bush.draw(area);
  for (const tree of sceneTrees) if (rectsOverlap(tree.bounds, area)) tree.draw(area);
  if (debug.treeLabels) drawTreeLabels(treePlacements);
  ctx.restore();
}

// True once any palette colour has moved more than colourThreshold since the
// current picture was painted (time of day / weather), so it needs repainting
function paletteDrifted() {
  if (!cachedPaletteLevels) return true;
  for (const key in palette) {
    const now = palette[key].levels;
    const then = cachedPaletteLevels[key];
    if (!then) return true;
    for (let i = 0; i < 3; i++) {
      if (abs(now[i] - then[i]) > cacheSettings.colourThreshold) return true;
    }
  }
  return false;
}

function paletteSnapshot() {
  return Object.fromEntries(
    Object.entries(palette).map(([key, colour]) => [key, colour.levels.slice()]),
  );
}

// (Re)make the four offscreen buffers when missing or the pixel density changed
function ensureBuffers() {
  if (buffers && buffers.current.scene.pixelDensity() === pixelDensity()) return;
  if (buffers) {
    for (const set of [buffers.current, buffers.pending]) {
      set.scene.remove();
      set.base.remove();
    }
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

// Paint a buffer over the whole canvas (it's at pixel density, so scale it
// down into scene units)
function drawBuffer(buffer) {
  drawingContext.drawImage(buffer.elt, 0, 0, width, height);
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
    // cycle dry → overcast → wet (temporary until the Weather layer exists)
    weatherStub.rain = (weatherStub.rain + 0.5) % 1.5;
  }
  if (key === "t" || key === "T") useRealClock = !useRealClock; // toggle virtual ↔ real clock (AGENTS.md debug key)
  if (key === "p" || key === "P") togglePause(); // freeze / resume the time of day
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
        lerp(0.6, 4.5, point.scale),
        jitter(colour, hueRange, saturationRange, brightnessRange),
      );
    }
  };

  scatterMarks(marks(1800), 0, 1, palette.road, 8, 8, 4); // general surface
  scatterMarks(marks(500), 0.22, 0.36, palette.track, 6, 8, 4); // left tyre track
  scatterMarks(marks(500), 0.64, 0.78, palette.track, 6, 8, 4); // right tyre track
  scatterMarks(marks(350), 0.45, 0.55, palette.ridge, 10, 10, 4); // centre ridge
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
  const leftTrees = [0.04, 0.2, 0.24, 0.38, 0.4, 0.55, 0.7, 0.82, 0.9]; // `along` positions on the lane
  const rightTrees = [
    0.02, 0.07, 0.18, 0.22, 0.35, 0.55, 0.7, 0.75, 0.77, 0.82, 0.85, 0.9, 0.91,
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
