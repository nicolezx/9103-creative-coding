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
  horizon: 0.7, // horizon height as a fraction of canvas height
  vanishingPointX: 0.5, // vanishing point x as a fraction of canvas width
  roadHalfWidth: 0.2, // half the road width at the bottom edge, fraction of width
  compression: 0.55, // how quickly things bunch up toward the horizon
  curve: 0.1, // sideways bend of the far lane (-0.4 to 0.4)
};

// Placeholder colours (HSB). Replace with values sampled from the series,
// and later with the shared time/weather palette.
const paletteHsb = {
  skyTop: [210, 32, 90],
  skyLow: [40, 14, 98],
  cloud: [220, 4, 100],
  bush: [140, 55, 38],
  road: [30, 20, 80],
  track: [22, 38, 58],
  ridge: [70, 30, 72],
  grass: [98, 62, 58],
  grassDark: [125, 70, 34],
  grassLight: [80, 55, 84],
  trunk: [18, 40, 34],
  leaf: [108, 62, 58],
  leafLight: [88, 55, 82],
  blossom: [272, 45, 68],
  blossomLight: [288, 28, 90],
  flowerYellow: [52, 65, 100],
  flowerWhite: [0, 0, 100],
};

const palette = {};
let vanishingPoint;

// ---------------------------------------------------------------------------
// internal clock
// ---------------------------------------------------------------------------

const hoursPerDay = 24;
const secsPerMin = 60;
const minsPerDay = 6; // real minutes one virtual day takes

const clock = {
  dayLengthSeconds: minsPerDay * secsPerMin,
  startHour: 0,
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
  colorMode(HSB, 360, 100, 100, 1);
  for (const name in paletteHsb) palette[name] = color(...paletteHsb[name]);
  strokeWeight(3);
  strokeCap(ROUND);
  noLoop(); // static scene: only redraws when redraw() is called
}

function draw() {
  randomSeed(seed);
  noiseSeed(seed);
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
  // if (key === "r" || key === "R") {
  //   seed = floor(random(1, 10000));
  // console.log(seed);
  //   redraw();
  // }
  // if (key === "s" || key === "S") saveCanvas(`woldgate-${seed}`, "png");
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

  scatterMarks(marks(1800), 0, 1, palette.road, 8, 8, 10); // general surface
  scatterMarks(marks(500), 0.22, 0.36, palette.track, 6, 8, 8); // left tyre track
  scatterMarks(marks(500), 0.64, 0.78, palette.track, 6, 8, 8); // right tyre track
  scatterMarks(marks(350), 0.45, 0.55, palette.ridge, 10, 10, 8); // centre ridge
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

// Recursive branch: returns a node tree (kept as data so it can sway later)
function makeBranch(x, y, angle, length, weight, depth) {
  const endX = x + cos(angle) * length;
  const endY = y + sin(angle) * length;
  const node = { x, y, endX, endY, weight, depth, length, children: [] };
  if (depth > 0) {
    const childCount = random([2, 2, 3]);
    for (let i = 0; i < childCount; i++) {
      const childAngle = lerp(angle + random(-0.65, 0.65), -HALF_PI, 0.18); // slight upward pull
      node.children.push(
        makeBranch(
          endX,
          endY,
          childAngle,
          length * random(0.62, 0.8),
          weight * 0.62,
          depth - 1,
        ),
      );
    }
  }
  return node;
}

function makeTree(x, y, treeHeight, kind, side) {
  const lean = (side < 0 ? 1 : -1) * random(0.05, 0.18); // lean toward the lane
  const trunkLength = treeHeight * random(0.35, 0.45);
  const trunkTop = {
    x: x + cos(-HALF_PI + lean) * trunkLength,
    y: y + sin(-HALF_PI + lean) * trunkLength,
  };
  const baseWidth = max(2, treeHeight * 0.05);
  const branchLength = (treeHeight - trunkLength) / 2.4;
  const branchDepth = treeHeight > 200 ? 5 : treeHeight > 90 ? 4 : 3;

  const branches = [];
  const crownBranchCount = random([2, 3]);
  for (let i = 0; i < crownBranchCount; i++) {
    branches.push(
      makeBranch(
        trunkTop.x,
        trunkTop.y,
        -HALF_PI + lean + random(-0.6, 0.6),
        branchLength * random(0.8, 1.1),
        baseWidth * 0.6,
        branchDepth - 1,
      ),
    );
  }
  // one lower side branch off the trunk
  const sideBranchHeight = random(0.55, 0.8);
  branches.push(
    makeBranch(
      lerp(x, trunkTop.x, sideBranchHeight),
      lerp(y, trunkTop.y, sideBranchHeight),
      -HALF_PI + lean + random([-1, 1]) * random(0.6, 1.0),
      branchLength * 0.7,
      baseWidth * 0.45,
      branchDepth - 2,
    ),
  );

  return { x, y, trunkTop, baseWidth, branches, kind, height: treeHeight };
}

function drawTree(tree) {
  const foliageColours =
    tree.kind === "blossom"
      ? [palette.blossom, palette.blossomLight]
      : [palette.leaf, palette.leafLight];
  const topWidth = tree.baseWidth * 0.6;

  // trunk: tapered quad + bark dashes
  noStroke();
  fill(jitter(palette.trunk, 4, 6, 4));
  quad(
    tree.x - tree.baseWidth / 2,
    tree.y,
    tree.x + tree.baseWidth / 2,
    tree.y,
    tree.trunkTop.x + topWidth / 2,
    tree.trunkTop.y,
    tree.trunkTop.x - topWidth / 2,
    tree.trunkTop.y,
  );
  for (let i = 0; i < tree.height * 0.4; i++) {
    const heightFraction = random();
    const barkX =
      lerp(tree.x, tree.trunkTop.x, heightFraction) +
      random(-0.4, 0.4) * lerp(tree.baseWidth, topWidth, heightFraction);
    dash(
      barkX,
      lerp(tree.y, tree.trunkTop.y, heightFraction),
      -HALF_PI + random(-0.1, 0.1),
      (random(4, 10) * tree.baseWidth) / 10 + 2,
      max(1, tree.baseWidth * 0.12),
      jitter(palette.trunk, 8, 10, 14),
    );
  }

  // branches, collecting the last two levels as foliage anchors
  const foliageAnchors = [];
  const drawBranch = (node) => {
    stroke(jitter(palette.trunk, 6, 8, 8));
    strokeWeight(max(0.6, node.weight));
    line(node.x, node.y, node.endX, node.endY);
    if (node.depth <= 1) foliageAnchors.push(node);
    node.children.forEach(drawBranch);
  };
  tree.branches.forEach(drawBranch);

  // leaf / blossom clusters: base pass then light pass
  const sizeScale = min(1, tree.height / 400);
  const marksPerAnchor = tree.kind === "blossom" ? 14 : 10;
  for (const pass of [0, 1]) {
    for (const anchor of foliageAnchors) {
      for (let i = 0; i < marksPerAnchor; i++) {
        const alongBranch = random(0.3, 1.1);
        const markX =
          lerp(anchor.x, anchor.endX, alongBranch) +
          random(-1, 1) * anchor.length * 0.35;
        const markY =
          lerp(anchor.y, anchor.endY, alongBranch) +
          random(-1, 1) * anchor.length * 0.35;
        dash(
          markX,
          markY,
          random(TWO_PI),
          lerp(2, 12, sizeScale) * random(0.7, 1.3),
          lerp(1.5, 5.5, sizeScale),
          jitter(foliageColours[pass], 10, 12, 12, 0.92),
        );
      }
    }
  }
}

// Distance shortcut: trunk stroke + lumpy blob of marks
function drawFarTree(tree) {
  stroke(jitter(palette.trunk));
  strokeWeight(max(1, tree.height * 0.04));
  line(tree.x, tree.y, tree.x, tree.y - tree.height * 0.5);

  const crownY = tree.y - tree.height * 0.62;
  const crownRadiusX = tree.height * 0.32;
  const crownRadiusY = tree.height * 0.38;
  const crownColours =
    tree.kind === "blossom"
      ? [palette.blossom, palette.blossomLight]
      : [palette.bush, palette.leaf];
  for (let i = 0; i < tree.height * 4; i++) {
    const angle = random(TWO_PI);
    const radius = sqrt(random()); // sqrt spreads points evenly across the disc
    const wobble = 0.8 + 0.4 * noise(cos(angle) + tree.x * 0.1, sin(angle));
    dash(
      tree.x + cos(angle) * radius * crownRadiusX * wobble,
      crownY + sin(angle) * radius * crownRadiusY * wobble,
      random(TWO_PI),
      random(2, 5),
      random(1.5, 3),
      jitter(
        i < tree.height * 2 ? crownColours[0] : crownColours[1],
        10,
        10,
        12,
      ),
    );
  }
}

function drawTrees() {
  const placements = [];
  const treeDistances = [0.04, 0.2, 0.38, 0.55, 0.7, 0.82, 0.9]; // `along` positions on the lane

  for (const side of [-1, 1]) {
    for (let i = 0; i < treeDistances.length; i++) {
      const along = treeDistances[i] + random(-0.03, 0.03);
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
    if (treeHeight < 70)
      drawFarTree({ x: point.x, y: point.y, height: treeHeight, kind });
    else drawTree(makeTree(point.x, point.y, treeHeight, kind, side));
  }
}

// ---------------------------------------------------------------------------
// Bushes behind the treeline (same leaf-cluster marks as the tree crowns)
// ---------------------------------------------------------------------------
function drawBushes() {
  randomSeed(seed + 1); // separate random stream for the bushes

  const bushes = [];
  for (const side of [-1, 1]) {
    // tight spacing so each side reads as one continuous row, spanning the
    // same stretch of lane as the trees (0.04 → 0.9)
    for (let distance = 0.02; distance < 0.93; distance += 0.06) {
      const along = distance + random(-0.02, 0.02);
      // trees span across -0.12…-0.42 / 1.12…1.42, so start where they end
      // to keep the bushes directly behind the tree row
      const across = side < 0 ? -0.42 - random(0.15) : 1.42 + random(0.15);
      const point = lane(along, across);
      if (point.x < -width * 0.25 || point.x > width * 1.25) continue;
      let size = point.scale * height * random(0.35, 0.55);
      // 0 in the middle third of the screen → 1 at the edges; about half the
      // bushes out there get scaled up so the sides are framed by bigger shrubs
      const edgeness = constrain(
        map(abs(point.x - width / 2), width * 0.3, width * 0.5, 0, 1),
        0,
        1,
      );
      if (random() < 0.5) size *= 1 + edgeness * random(0.4, 0.9);
      bushes.push({ point, size });
    }
  }

  bushes.sort((a, b) => a.point.y - b.point.y); // far → near
  for (const { point, size } of bushes) drawBush(point.x, point.y, size);

  randomSeed(seed); // reset so the trees get exactly the same layout as before
}

function drawBush(x, y, bushHeight) {
  // skeleton: 4–6 stems in a narrow fan, kept tight so each bush reads as
  // one rounded mass rather than a spray of twigs
  const stemCount = floor(random(4, 7));
  const depth = bushHeight > 120 ? 3 : 2;
  const anchors = [];
  const collect = (node) => {
    if (node.depth <= 1) anchors.push(node);
    node.children.forEach(collect);
  };
  for (let i = 0; i < stemCount; i++) {
    const spread = map(i, 0, stemCount - 1, -1, 1); // -1 = leftmost stem, 1 = rightmost
    collect(
      makeBranch(
        x + (spread * 0.15 + random(-0.05, 0.05)) * bushHeight,
        y,
        -HALF_PI + spread * 0.5 + random(-0.1, 0.1),
        bushHeight * random(0.3, 0.4),
        1,
        depth,
      ),
    );
  }

  // leaf clusters: three passes of the bush colour (same marks as the tree
  // crowns); the wider jitter gives texture without bringing in other greens
  const sizeScale = min(1, bushHeight / 400);
  for (let pass = 0; pass < 3; pass++) {
    for (const anchor of anchors) {
      for (let i = 0; i < 8; i++) {
        const alongBranch = random(0.3, 1.0);
        // smaller scatter than the tree crowns (0.35) keeps the edges neat
        dash(
          lerp(anchor.x, anchor.endX, alongBranch) +
            random(-1, 1) * anchor.length * 0.2,
          lerp(anchor.y, anchor.endY, alongBranch) +
            random(-1, 1) * anchor.length * 0.2,
          random(TWO_PI),
          lerp(2, 12, sizeScale) * random(0.7, 1.3),
          lerp(1.5, 5.5, sizeScale),
          jitter(palette.bush, 10, 10, 12),
        );
      }
    }
  }
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
