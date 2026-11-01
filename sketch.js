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

// Perspective
const perspective = {
  horizon: 0.55, // horizon height as a fraction of canvas height
  vanishingPointX: 0.5, // vanishing point x as a fraction of canvas width
  roadHalfWidth: 0.35, // half the road width at the bottom edge, fraction of width
  compression: 0.8, // how quickly things bunch up toward the horizon
  curve: -0.08, // sideways bend of the far lane (-0.4 to 0.4)
};

// Undergrowth clumps (bushes.js)
const bushSettings = {
  baseAcross: 0.1, // nearest clump feet, in `across` units beyond each road edge
  acrossSpread: 0.45, // how much further out from there clumps can sit
  spacing: 0.05, // gap between rows of clumps, in `along` units
  clumpsPerRow: 1, // overlapping clumps at each step, so the verge fills up
  farAlong: 0.95, // how far toward the vanishing point clumps reach
  sizeFactor: [0.5, 0.8], // clump height as a fraction of canvas height up close
  lumpFrequency: 1.4, // how many lobes the outline wobbles into
  lumpDepth: 0.22, // how far the lobes push in/out (0 = clean ellipse)
  marksPerClump: 0, // dashes on a mid-sized clump
  blurAmount: 0.01, // blur radius as a fraction of clump size (soft edges)
};

// Placeholder colours (HSB). Replace with values sampled from the series,
// and later with the shared time/weather palette.
const paletteHsb = {
  skyTop: [197, 48, 82], // hsl(197, 48%, 82%)
  skyLow: [197, 48, 82], // hsl(197, 48%, 82%)
  cloud: [220, 4, 100], // hsl(220, 4%, 100%)
  bush: [118, 41, 44], // hsl(118, 41%, 44%)
  road: [30, 20, 80], // hsl(30, 20%, 80%)
  track: [22, 38, 58], // hsl(22, 38%, 58%)
  ridge: [70, 30, 72], // hsl(70, 30%, 72%)
  grass: [98, 62, 58], // hsl(98, 62%, 58%)
  grassDark: [125, 70, 34], // hsl(125, 70%, 34%)
  grassLight: [80, 55, 84], // hsl(80, 55%, 84%)
  trunk: [18, 40, 34], // hsl(18, 40%, 34%)
  leaf: [108, 62, 58], // hsl(108, 62%, 58%)
  leafLight: [88, 55, 82], // hsl(88, 55%, 82%)
  blossom: [272, 45, 68], // hsl(272, 45%, 68%)
  blossomLight: [288, 28, 90], // hsl(288, 28%, 90%)
  flowerYellow: [52, 65, 100], // hsl(52, 65%, 100%)
  flowerWhite: [0, 0, 100], // hsl(0, 0%, 100%)
};

const palette = {};
let vanishingPoint;

// ---------------------------------------------------------------------------
// internal clock
// ---------------------------------------------------------------------------

const hoursPerDay = 24;
const secsPerMin = 60;
const minsPerDay = 1;   // real minutes for one virtual day (1 × 60 = 60 s)
const FRAME_RATE = 8;   // redraws per second — try 15–20 if profiling shows headroom

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
  colorMode(HSL);
  for (const name in paletteHsb) palette[name] = color(...paletteHsb[name]);
  strokeWeight(3);
  strokeCap(ROUND);
  frameRate(FRAME_RATE); // loop at a low rate — see FRAME_RATE near clock settings above
}

function draw() {
  randomSeed(seed);
  noiseSeed(seed);

  // Update every palette entry for the current moment in the day-night cycle.
  // ── WEATHER HOOK ──────────────────────────────────────────────────────────
  // Weather mechanic: receive the palette object here and blend your tint in
  // before it reaches the drawing code. Neither mechanic overwrites the other.
  //   const tp = getTimePalette(); applyWeatherTint(tp); Object.assign(palette, tp);
  // ──────────────────────────────────────────────────────────────────────────
  Object.assign(palette, getTimePalette());

  vanishingPoint = {
    x: width * perspective.vanishingPointX,
    y: height * perspective.horizon,
  };

  drawSky();
  // drawHedge();
  noStroke();
  fill(palette.grass);
  rect(0, vanishingPoint.y, width, height - vanishingPoint.y); // flat base coat under the verges
  drawRoad();
  drawGrass();
  drawBushes(); // after the ground so it doesn't cover them, before the trees so they sit in front
  drawTrees();
}

function keyPressed() {
  if (key === "r" || key === "R") {
    // seed = floor(random(1, 10000));
    // console.log(seed);
    redraw();
  }
  // if (key === "s" || key === "S") saveCanvas(`woldgate-${seed}`, "png");
  if (key === "t" || key === "T") useRealClock = !useRealClock; // toggle virtual ↔ real clock (AGENTS.md debug key)
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

function drawGrass() {
  // dark → mid → light passes
  for (let i = 0; i < marks(700); i++) {
    const point = vergePoint();
    if (point) clump(point, palette.grassDark);
  }
  for (let i = 0; i < marks(800); i++) {
    const point = vergePoint();
    if (point) clump(point, palette.grass);
  }
  for (let i = 0; i < marks(350); i++) {
    const point = vergePoint();
    if (point) clump(point, palette.grassLight);
  }

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

function drawTrees() {
  const placements = [];
  const treeDistances = [0.04, 0.2, 0.38, 0.55, 0.7, 0.82, 0.9]; // `along` positions on the lane

  for (const side of [-1, 1]) {
    for (let i = 0; i < treeDistances.length; i++) {
      const along = treeDistances[i] + random(0);
      const across = side < 0 ? -0.12 - random(0.3) : 1.12 + random(0.3);
      const point = lane(along, across);
      const treeHeight = point.scale * height * random(0.85, 1.15);
      const kind = "leaf";
      if (point.x < -40 || point.x > width + 40) continue;
      placements.push({ point, treeHeight, kind, side });
    }
  }

  placements.sort((a, b) => a.point.y - b.point.y); // far → near
  for (const placement of placements) {
    const { point, treeHeight, kind, side } = placement;
    new Tree(point.x, point.y, treeHeight, kind, side).draw();
  }
}

// ---------------------------------------------------------------------------
// Bushes: overlapping blob clumps along each verge (see bushes.js)
// ---------------------------------------------------------------------------
function drawBushes() {
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
  for (const bush of bushes) bush.draw();

  randomSeed(seed); // reset so the trees get exactly the same layout as before
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
    redraw();
  }, 200);
}
