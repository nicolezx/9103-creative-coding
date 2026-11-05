// User input: leaf sway + bush rustle on hover, bursts + rings on click.
//
// HOVER — "leaf sway" (trees only)
// Nothing is drawn on top of the scene: the tree's own leaf marks move.
//   1. Notice: every time the cursor moves, check whether it's over a tree's
//      leaves (a coarse map of where leaf marks are, built each repaint).
//   2. Ease: one shared `strength` (0 = still, 1 = full sway) eases up when
//      the cursor arrives on leaves, and eases back down to 0 once the cursor
//      has stopped for a moment or left the leaves — so a resting cursor
//      calms to still after about a second.
//   3. Move: as each leaf near the cursor is drawn, swayLeaf() shifts and
//      turns it a little, following smooth p5 noise() over time. Nearby
//      leaves get similar noise values, so a patch sways together like a
//      breeze instead of jittering. Everything is multiplied by `strength`,
//      so leaves glide back to exactly where they started.
//   4. Redraw: sketch.js only redraws the patch around the swaying leaves
//      (getSwayAreas → redrawArea), and nothing at all once they're still.
//
// HOVER — "bush rustle" (bushes only)
// The same machinery (a second LeafSway with its own settings) moves the
// crisp marks on a bush instead: smaller patches, faster and twitchier, more
// turn than shift, so it reads as leaves flicking against each other rather
// than a slow breeze. Only the marks move; the blurred mass stays put. It
// starts when the cursor is over a bush and not on tree leaves (trees are in
// front, as in getRegion), and calms just like the sway.
//
// CLICK
// On a tree or bush, a handful of Burst pieces (leaf / bush bits) shoot
// out from the click;
//
// Like the planned Interaction layer (AGENTS.md §2), this acts on the scene
// directly and only *reads* `palette`. It never changes time or weather.

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
// Ranges: [hard limits] are what the code can handle; "try" is what looks good.
const swayRadius = 50; // px around the cursor in which leaves sway (soft edge) [> 0]; try 50–120
const swayDistance = 4; // furthest a leaf shifts, in leaf widths [≥ 0; the redraw patch grows to fit]; try 1.5–4
//                           (width is shared by every leaf in a clump, so neighbours move together;
//                           noise() rarely reaches its extremes, so leaves typically move ~40% of this)
const swayAngle = 0.3; // furthest a leaf turns, radians [≥ 0]; try 0.15–0.5
const swaySpeed = 0.35; // how fast the sway pattern changes [> 0, lower = slower, lazier movement]; try 0.2–0.8
const swayPatchSize = 70; // px over which leaves move alike [> 0, bigger = broader, calmer patches]; try 40–120
const swayFadeInTime = 0.25; // seconds to ease into the sway on arrival [≥ 0]; try 0.15–0.5
const swayCalmDelay = 0.3; // seconds the cursor must rest before the leaves start to calm [≥ 0]; try 0.2–0.8
const swayFadeOutTime = 0.18; // seconds to ease back to still (≈ 3.5× this to settle) [≥ 0]; try 0.15–0.4
//                               (calm delay + settling ≈ 0.3 + 0.6 ≈ 1 s from the cursor stopping)
const swayFollowTime = 0.15; // seconds the swaying patch takes to catch up with the cursor [≥ 0]; try 0.05–0.3
const swayEdgeSoftness = 10; // px over which the redrawn circle fades into the picture, outside any moving leaf [≥ 0]; try 6–16
//                              (hides the faint edge left by the browser drawing leaves very slightly differently each time)
// Bush rustle: same meanings as the sway settings above, tuned quicker and smaller
const rustleRadius = 80; // px around the cursor in which bush marks rustle [> 0]; try 40–100
const rustleDistance = 5; // furthest a mark shifts, in mark widths [≥ 0]; try 0.5–2
const rustleAngle = 0.5; // furthest a mark turns, radians [≥ 0]; try 0.25–0.8
const rustleSpeed = 2; // how fast the rustle pattern changes [> 0, higher = twitchier]; try 1–3
const rustlePatchSize = 25; // px over which marks move alike [> 0, smaller = more independent flicker]; try 15–50
const rustleFadeInTime = 0.08; // seconds to ease in [≥ 0]; try 0.05–0.2
const rustleCalmDelay = 0.15; // seconds the cursor must rest before calming [≥ 0]; try 0.1–0.4
const rustleFadeOutTime = 0.15; // seconds to ease back to still [≥ 0]; try 0.1–0.3
const rustleFollowTime = 0.08; // seconds the patch takes to catch up with the cursor [≥ 0]; try 0.03–0.2
const leafCoverageCellSize = 8; // px per cell of the "where are leaves?" map [> 0, smaller = more exact]; try 4–12
const burstCount = [10, 18]; // [min, max] pieces per click on a tree/bush [whole numbers ≥ 0]
const burstPieceSize = { tree: 1, bush: 0.6 }; // piece size as a multiple of the clicked mark's length [> 0]; try 0.5–1.5
//                                                 (bush marks are long thin dashes, so a smaller share keeps pieces leaf-sized)
const burstPieceMinSize = 2; // smallest piece in px, so pieces from tiny far-off marks stay visible [> 0]; try 1–4
const burstPieceMaxSize = 10; // biggest piece in px, so the biggest near leaves don't shed oversized pieces [≥ min]; try 12–30
//                              (a hard cap: applied after each piece's random size variation)
const burstLife = 1400; // ms a burst piece lives [> 0]; try 800–2500
const ringLife = 900; // ms a click ring takes to fade out [> 0]; try 500–1500

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let leafSway = null; // LeafSway for tree leaves (made in setupInputElements)
let bushRustle = null; // LeafSway for bush marks (made in setupInputElements)
let bursts = []; // live Burst pieces
let rings = []; // live click rings: { x, y, depthScale, age, isWater, colour }

// Cursor in scene coordinates ({ x, y }), or null when it's off the canvas
let cursorScenePosition = null;

// True while sketch.js paints its cached picture, so swaying leaves aren't
// baked into it (they're drawn on top by redrawArea instead)
let swayPaused = false;

// Ring colours per region, as [h, s, b]. Rebuilt every frame from `palette`
// (updateInputElements) so they follow the time of day and weather.
let ringColoursByRegion = { tree: [], bush: [], water: [], track: [], sky: [] };

// Burst piece colours per region, as [h, s, b]. Rebuilt every frame from
// `palette` (updateInputElements), from the leaf and bush roles in colors.js.
let burstColoursByRegion = { tree: [], bush: [] };

// Hit areas for trees and bushes, filled by registerHitAreas() from
// finishRebuild() in sketch.js. Stored in draw order (far → near).
const hitAreas = { tree: [], bush: [] };

// Where tree leaves actually are: a coarse grid over the canvas, 1 where any
// leaf covers that cell. Rebuilt with the hit areas (buildLeafCoverage), so the
// sway only starts when the cursor is really on leaves, not on sky between them.
let leafCoverage = null; // { columnCount, rowCount, cells: Uint8Array }

// ---------------------------------------------------------------------------
// LeafSway: how much the marks near the cursor are swaying right now.
// One shared state per kind of target (tree leaves, bush marks), so there are
// no seams between patches.
//   settings: { radius, distance, angle, speed, patchSize, fadeInTime,
//               calmDelay, fadeOutTime, followTime, edgeSoftness, noiseOffset }
//   isOverTarget(x, y): is the cursor on something this instance moves?
// ---------------------------------------------------------------------------
class LeafSway {
  constructor(settings, isOverTarget) {
    this.settings = settings;
    this.isOverTarget = isOverTarget;
    this.strength = 0; // 0 = still … 1 = full sway
    this.centreX = 0; // middle of the swaying patch: trails the cursor slightly
    this.centreY = 0;
    this.isOver = false; // is the cursor on a target?
    this.lastMovedAt = -Infinity; // millis() of the last cursor move over a target
    this.swayTime = 0; // how far along the noise pattern we are; advances only while swaying
    // Size of the biggest mark this instance moves (set by setBiggestMark on
    // each repaint). Sets how far past `radius` the redraw patch must reach so
    // no moving mark gets cut off.
    this.biggestMark = { weight: 0, length: 0 };
  }

  setBiggestMark(marks) {
    this.biggestMark = { weight: 0, length: 0 };
    for (const mark of marks) {
      this.biggestMark.weight = max(this.biggestMark.weight, mark.weight);
      this.biggestMark.length = max(this.biggestMark.length, mark.length);
    }
  }

  // Step 1 — called on every cursor move (or with null when it leaves the canvas)
  noticeCursor(position) {
    this.isOver = position !== null && this.isOverTarget(position.x, position.y);
    if (!this.isOver) return;
    this.lastMovedAt = millis();
    // starting from still: begin the patch right where the cursor arrived
    if (this.strength === 0) {
      this.centreX = position.x;
      this.centreY = position.y;
    }
  }

  // Step 2 — called once per frame: ease the strength toward its target
  update(deltaSeconds) {
    const settings = this.settings;
    // full sway while the cursor is on a target and has moved recently; still otherwise
    const movedRecently = millis() - this.lastMovedAt < settings.calmDelay * 1000;
    const targetStrength = this.isOver && movedRecently ? 1 : 0;
    const easeTime = targetStrength > this.strength ? settings.fadeInTime : settings.fadeOutTime;
    this.strength = approach(this.strength, targetStrength, easeTime, deltaSeconds);
    if (targetStrength === 0 && this.strength < 0.03) this.strength = 0; // too small to see: stop
    if (this.strength === 0) return;

    // the patch glides after the cursor instead of jumping with it
    if (cursorScenePosition) {
      this.centreX = approach(this.centreX, cursorScenePosition.x, settings.followTime, deltaSeconds);
      this.centreY = approach(this.centreY, cursorScenePosition.y, settings.followTime, deltaSeconds);
    }
    this.swayTime += settings.speed * deltaSeconds;
  }

  // The circle sketch.js must redraw, or null when still:
  // { centreX, centreY, radius, softEdge } plus its bounding box { x, y, w, h }.
  // It's as small as possible while still holding every moving leaf; the soft
  // edge fades out *beyond* the moving leaves, so none is ever cut or faded.
  // Written by the Claude AI plugin for VS Code
  getArea() {
    if (this.strength === 0) return null;
    const softEdge = this.settings.edgeSoftness;
    const radius = this.reachOfMovingLeaves() + softEdge;
    return {
      centreX: this.centreX,
      centreY: this.centreY,
      radius,
      softEdge,
      x: this.centreX - radius,
      y: this.centreY - radius,
      w: radius * 2,
      h: radius * 2,
    };
  }

  // Furthest from the centre any part of a moving leaf can get. A leaf at
  // `distance` moves by up to smoothFalloff(distance) × the biggest shift, so
  // check each distance out to swayRadius (leaves beyond it don't move). Then
  // add how far a leaf's blob can reach past its centre (up to about its
  // length: half its length plus outline nudges, curve overshoot and stroke,
  // see dab() in utils.js) and 2 px for anti-aliasing.
  reachOfMovingLeaves() {
    const { radius } = this.settings;
    const biggestShift = this.settings.distance * this.biggestMark.weight;
    let furthestLeafCentre = 0;
    for (let distance = 0; distance <= radius; distance++) {
      const shift = smoothFalloff(distance, radius) * biggestShift;
      furthestLeafCentre = max(furthestLeafCentre, distance + shift);
    }
    return furthestLeafCentre + this.biggestMark.length + 2;
  }

  // Step 3 — one leaf (or bush mark): return it unchanged, or a slightly moved copy
  moveLeaf(leaf) {
    if (this.strength === 0) return leaf;
    const settings = this.settings;
    const distanceToCentre = dist(leaf.x, leaf.y, this.centreX, this.centreY);
    const amount = this.strength * smoothFalloff(distanceToCentre, settings.radius);
    if (amount === 0) return leaf;

    // noise() is smooth in space and time: leaves close together get similar
    // values (they move as a patch), and each value drifts slowly as swayTime
    // advances. The +100 / +200 offsets give x, y and angle their own patterns,
    // and noiseOffset keeps the sway and the rustle from sharing one.
    // (noise() doesn't use p5's random() stream, so the scene layout is safe.)
    const noiseX = leaf.x / settings.patchSize + settings.noiseOffset;
    const noiseY = leaf.y / settings.patchSize;
    const shiftX = (noise(noiseX, noiseY, this.swayTime) - 0.5) * 2;
    const shiftY = (noise(noiseX + 100, noiseY, this.swayTime) - 0.5) * 2;
    const turn = (noise(noiseX + 200, noiseY, this.swayTime) - 0.5) * 2;

    // x and y can both peak at once, which would carry a leaf ~1.4× further
    // diagonally than the distance setting; scale the pair back so the total stays
    // within the distance setting (keeps the redraw circle tight, see getArea)
    const shiftLength = Math.hypot(shiftX, shiftY);
    const shiftLimit = shiftLength > 1 ? 1 / shiftLength : 1;

    const shiftSize = amount * settings.distance * leaf.weight * shiftLimit;
    return {
      ...leaf,
      x: leaf.x + shiftX * shiftSize,
      y: leaf.y + shiftY * shiftSize,
      angle: leaf.angle + turn * settings.angle * amount,
    };
  }
}

// ---------------------------------------------------------------------------
// Burst: one leaf or bush piece thrown out from a click
// ---------------------------------------------------------------------------
class Burst {
  constructor(x, y, colour, size) {
    this.x = x;
    this.y = y;
    this.colour = colour; // [h, s, b]
    this.size = size;
    const launchAngle = randomBetween(0, TWO_PI);
    // px per second: bigger pieces fly a bit further, capped so huge near
    // pieces don't shoot off-screen and tiny far ones still move
    const launchSpeed = randomBetween(80, 260) * constrain(size / 6, 0.5, 2);
    this.velocityX = cos(launchAngle) * launchSpeed;
    this.velocityY = sin(launchAngle) * launchSpeed - launchSpeed * 0.4; // bias upward: flung off the branch
    this.angle = randomBetween(0, TWO_PI);
    this.spin = randomBetween(-6, 6); // radians per second
    this.shapeSeed = Math.random(); // fixed outline, so the piece doesn't morph as it flies
    this.age = 0; // ms
    this.done = false;
  }

  // deltaSeconds = time since the last frame, so motion is the same at any frame rate
  // Written by the Claude AI plugin for VS Code
  update(deltaSeconds) {
    this.age += deltaSeconds * 1000;
    if (this.age > burstLife) {
      this.done = true;
      return;
    }
    this.velocityX *= pow(0.25, deltaSeconds); // air drag
    this.velocityY = this.velocityY * pow(0.25, deltaSeconds) + 220 * deltaSeconds; // drag + gravity
    this.x += this.velocityX * deltaSeconds + sin(this.age * 0.006) * 0.6; // slight flutter
    this.y += this.velocityY * deltaSeconds;
    this.angle += this.spin * deltaSeconds;
  }

  display() {
    const [hueValue, saturationValue, brightnessValue] = this.colour;
    const opacity = 1 - pow(this.age / burstLife, 2); // stay solid, then fade at the end
    const fadingColour = color(hueValue, saturationValue, brightnessValue, opacity);
    dab(this.x, this.y, this.angle, this.size, this.size * 0.6, fadingColour, 0.25, this.shapeSeed);
  }
}

// ---------------------------------------------------------------------------
// Input functions
// ---------------------------------------------------------------------------

// Called from setup(): start tracking the cursor. Pointer events fire
// between frames, so the cursor is noticed the moment it lands on leaves.
function setupInputElements() {
  leafSway = new LeafSway(
    {
      radius: swayRadius,
      distance: swayDistance,
      angle: swayAngle,
      speed: swaySpeed,
      patchSize: swayPatchSize,
      fadeInTime: swayFadeInTime,
      calmDelay: swayCalmDelay,
      fadeOutTime: swayFadeOutTime,
      followTime: swayFollowTime,
      edgeSoftness: swayEdgeSoftness,
      noiseOffset: 0,
    },
    isOverTreeLeaves,
  );
  bushRustle = new LeafSway(
    {
      radius: rustleRadius,
      distance: rustleDistance,
      angle: rustleAngle,
      speed: rustleSpeed,
      patchSize: rustlePatchSize,
      fadeInTime: rustleFadeInTime,
      calmDelay: rustleCalmDelay,
      fadeOutTime: rustleFadeOutTime,
      followTime: rustleFollowTime,
      edgeSoftness: swayEdgeSoftness,
      noiseOffset: 500, // its own noise pattern, separate from the tree sway
    },
    isOverBush,
  );
  window.addEventListener("pointermove", (event) => {
    cursorScenePosition = windowToScene(event.clientX, event.clientY);
    leafSway.noticeCursor(cursorScenePosition);
    bushRustle.noticeCursor(cursorScenePosition);
  });
  document.addEventListener("pointerleave", () => {
    cursorScenePosition = null;
    leafSway.noticeCursor(null);
    bushRustle.noticeCursor(null);
  });
}

// Hover hook for Tree.drawLeaves(): returns the leaf as it should be drawn
// this frame. Never calls p5's random(): it runs mid-draw, where that would
// change the scene.
function swayLeaf(leaf) {
  if (swayPaused || !leafSway) return leaf;
  return leafSway.moveLeaf(leaf);
}

// Hover hook for Bush.drawMarks(): same as swayLeaf, for bush marks
function rustleBushMark(mark) {
  if (swayPaused || !bushRustle) return mark;
  return bushRustle.moveLeaf(mark);
}

// Called once per frame by sketch.js before the hover patches are drawn:
// advances the sway and the rustle, then returns the circles to redraw
// (0, 1 or 2 of them; both only briefly, while one calms as the other starts).
function getSwayAreas() {
  if (!leafSway) return [];
  // Burst colours: tree pieces use the tree foliage's three passes (bush shadow,
  // leaf, leafLight; see Tree.buildFoliage), bush pieces the bush role in a
  // darker / base / lighter shade, like the jittered marks in Bush
  const bushColour = colourToHsb(palette.bush);
  burstColoursByRegion = {
    tree: [palette.bush, palette.leaf, palette.leafLight].map(colourToHsb),
    bush: [shiftBrightness(bushColour, -10), bushColour, shiftBrightness(bushColour, 10)],
  };

  const deltaSeconds = min(deltaTime, 250) / 1000; // capped so a stall doesn't jump
  const areas = [];
  for (const sway of [leafSway, bushRustle]) {
    sway.update(deltaSeconds);
    const area = sway.getArea();
    if (area) areas.push(area);
  }
  return areas;
}

// What's under scene point (x, y): "tree" (a leaf mark), "trunk", "bush"
// (inside a clump's outline) or "ground" (anything else).
function getRegion(x, y) {
  return getHit(x, y).region;
}

// Same as getRegion, plus the mark that was hit: { region, mark }. `mark` is
// the leaf under the point for "tree", the nearest of the clump's marks for
// "bush", and null otherwise. Clicks use it to size the burst pieces.
// Trees are drawn over bushes, and nearer things over farther ones, so check
// in that order (hit areas are stored far → near, hence the reverse loops).
// Within a tree, leaves are drawn over the wood, so they're checked first.
function getHit(x, y) {
  const trees = hitAreas.tree;
  const nearLeaves = isOverTreeLeaves(x, y); // quick grid check before looking at single leaves
  for (let index = trees.length - 1; index >= 0; index--) {
    const leaf = nearLeaves ? findLeafAt(x, y, trees[index]) : null;
    if (leaf) return { region: "tree", mark: leaf };
    if (pointInRect(x, y, trees[index].trunk)) return { region: "trunk", mark: null };
  }
  const bushes = hitAreas.bush;
  for (let index = bushes.length - 1; index >= 0; index--) {
    if (pointInPolygon(x, y, bushes[index].outline)) {
      return { region: "bush", mark: nearestMark(x, y, bushes[index].marks) };
    }
  }
  return { region: "ground", mark: null }; // sky, road or open grass: nothing reacts there
}


// Is (x, y) on a tree's leaves? Looks it up in the leaf coverage grid.
function isOverTreeLeaves(x, y) {
  if (!leafCoverage) return false;
  const column = floor(x / leafCoverageCellSize);
  const row = floor(y / leafCoverageCellSize);
  if (column < 0 || column >= leafCoverage.columnCount || row < 0 || row >= leafCoverage.rowCount) return false;
  return leafCoverage.cells[row * leafCoverage.columnCount + column] === 1;
}

// Is (x, y) on a bush (and not on tree leaves, which are drawn in front)?
function isOverBush(x, y) {
  if (isOverTreeLeaves(x, y)) return false;
  return hitAreas.bush.some((area) => pointInPolygon(x, y, area.outline));
}

// Fill the leaf coverage grid: mark every cell a leaf (incl. its size) touches.
// Only includes leaves that have actually been drawn (capped by seasonProgress).
function buildLeafCoverage(trees) {
  const columnCount = ceil(width / leafCoverageCellSize);
  const rowCount = ceil(height / leafCoverageCellSize);
  const cells = new Uint8Array(columnCount * rowCount);
  const drawnLeaves = trees.flatMap((tree) => {
    const count = floor((tree.foliage || []).length * seasonProgress);
    return (tree.foliage || []).slice(0, count);
  });
  leafSway.setBiggestMark(drawnLeaves);
  for (const leaf of drawnLeaves) {
    const reach = leaf.length / 2; // leaves are centred on (x, y)
    const firstColumn = max(0, floor((leaf.x - reach) / leafCoverageCellSize));
    const lastColumn = min(columnCount - 1, floor((leaf.x + reach) / leafCoverageCellSize));
    const firstRow = max(0, floor((leaf.y - reach) / leafCoverageCellSize));
    const lastRow = min(rowCount - 1, floor((leaf.y + reach) / leafCoverageCellSize));
    for (let row = firstRow; row <= lastRow; row++) {
      for (let column = firstColumn; column <= lastColumn; column++) {
        cells[row * columnCount + column] = 1;
      }
    }
  }
  leafCoverage = { columnCount, rowCount, cells };
}

// An [h, s, b] colour with its brightness moved by `amount`, kept in 0–100.
// Done here rather than with jitter(), which calls p5's random().
function shiftBrightness([hueValue, saturationValue, brightnessValue], amount) {
  return [hueValue, saturationValue, constrain(brightnessValue + amount, 0, 100)];
}

// A random ring colour for a region, as [h, s, b]
function pickRingColour(region) {
  const choices = ringColoursByRegion[region];
  return choices[floor(Math.random() * choices.length)];
}

// Called at the end of draw(): refresh ring colours, then update + draw
// rings and bursts on top of the scene.
function updateInputElements() {
  // Ring colours are the lighter keys of each region's palette, so they match
  // the current time of day (warm at golden hour, dim at night)
  ringColoursByRegion = {
    tree: [palette.leaf, palette.leafLight].map(colourToHsb),
    bush: [palette.bush].map(colourToHsb).map((bush) => shiftBrightness(bush, 15)),
  };

  // Burst colours: tree pieces use the tree foliage's three passes (bush shadow,
  // leaf, leafLight; see Tree.buildFoliage), bush pieces the bush role in a
  // darker / base / lighter shade, like the jittered marks in Bush
  const bushColour = colourToHsb(palette.bush);
  burstColoursByRegion = {
    tree: [palette.bush, palette.leaf, palette.leafLight].map(colourToHsb),
    bush: [shiftBrightness(bushColour, -10), bushColour, shiftBrightness(bushColour, 10)],
  };

  const deltaSeconds = min(deltaTime, 250) / 1000; // capped so a stall doesn't teleport pieces

  push();
  // SCREEN only ever lightens, like light catching the ring
  blendMode(SCREEN);

  // Rings: flattened by perspective so they lie on the ground
  noFill();
  for (const ring of rings) {
    ring.age += deltaSeconds * 1000;
    const progress = ring.age / ringLife;
    const [hueValue, saturationValue, brightnessValue] = ring.colour;
    stroke(hueValue, saturationValue, brightnessValue, (1 - progress) * 0.8);
    strokeWeight(max(1, 2.5 * ring.depthScale));
    const ringRadius = (ring.isWater ? 50 : 30) * max(0.2, ring.depthScale) * (0.2 + progress);
    const flatten = ring.isWater ? 0.35 : 1; // water rings lie flat on the ground
    ellipse(ring.x, ring.y, ringRadius * 2, ringRadius * 2 * flatten);
    if (ring.isWater && progress > 0.25) {
      // second, later ripple inside the first
      ellipse(ring.x, ring.y, ringRadius * 1.2, ringRadius * 1.2 * flatten);
    }
  }
  rings = rings.filter((ring) => ring.age < ringLife);
  blendMode(BLEND);

  // Bursts: solid pieces drawn normally so they read as leaves, not light
  for (const piece of bursts) {
    piece.update(deltaSeconds);
    piece.display();
  }
  bursts = bursts.filter((piece) => !piece.done);
  pop();
}

// Called from mousePressed() in sketch.js
function handleInputClick() {
  const point = windowToScene(winMouseX, winMouseY);
  if (!point) return;
  const { region, mark } = getHit(point.x, point.y);
  // only a leaf or a bush reacts to a click; sky, road, grass and bare wood do
  // nothing. getRegion's shapes slightly overshoot the drawn leaves, so also
  // check the picture itself: something must be painted at this exact pixel
  // (isPaintedOverBase, sketch.js), not bare sky showing between leaves
  if (region !== "tree" && region !== "bush") return;
  if (!isPaintedOverBase(point.x, point.y)) return;
  const depthScale = laneScaleAt(point.y);

  // pieces use the same colours as the marks they come off (leaf / bush roles
  // in colors.js, via palette), so they follow the time of day and weather
  const colours = burstColoursByRegion[region];
  const count = floor(randomBetween(burstCount[0], burstCount[1] + 1));
  // pieces match the stroke that was clicked: small far-off leaves shed small
  // bits, big near ones shed big bits (falls back to depth if there's no mark)
  const pieceSize = mark ? mark.length * burstPieceSize[region] : lerp(3, 10, constrain(depthScale, 0, 1));
  for (let index = 0; index < count; index++) {
    const colour = colours[floor(Math.random() * colours.length)];
    // vary each piece a little, then clamp so no piece passes the max
    const size = constrain(pieceSize * randomBetween(0.7, 1.3), burstPieceMinSize, burstPieceMaxSize);
    bursts.push(new Burst(point.x, point.y, colour, size));
  }
}

// Record tree / bush hit areas. Called from finishRebuild() (sketch.js) with
// the objects in draw order, each time the scene is repainted.
function registerHitAreas(kind, objects) {
  if (kind === "bush") {
    // the clump's own wobbly outline: the solid blob its marks sit on
    hitAreas.bush = objects.map((bush) => ({ outline: bush.outline, marks: bush.marks }));
    bushRustle.setBiggestMark(objects.flatMap((bush) => bush.marks));
  } else if (kind === "tree") {
    hitAreas.tree = objects.filter((tree) => tree.branches).map(treeHitArea);
    buildLeafCoverage(objects);
  }
}

// ---------------------------------------------------------------------------
// Tree hit areas (specific to this file; general shape tests are in utils.js)
// ---------------------------------------------------------------------------

// The tree's leaf marks (checked one by one, see findLeafAt), its bounds
// (to skip trees nowhere near), and the trunk as a thin box from the base to
// the trunk top
// Written by the Claude AI plugin for VS Code
function treeHitArea(tree) {
  const leafCount = floor((tree.foliage || []).length * seasonProgress);
  return {
    leaves: (tree.foliage || []).slice(0, leafCount),
    bounds: tree.bounds,
    trunk: {
      x: min(tree.x, tree.trunkTop.x) - tree.baseWidth,
      y: tree.trunkTop.y,
      w: abs(tree.x - tree.trunkTop.x) + tree.baseWidth * 2,
      h: tree.y - tree.trunkTop.y,
    },
  };
}

// The leaf mark of this tree at (x, y), or null. A dab is about its length
// long and a little narrower, so a circle of half its length around its
// centre is a close fit. Leaves are drawn in order, so the last match is the
// one on top. Only runs on a click, so scanning every leaf is fine.
function findLeafAt(x, y, treeArea) {
  if (!pointInRect(x, y, treeArea.bounds)) return null;
  const leaves = treeArea.leaves;
  for (let index = leaves.length - 1; index >= 0; index--) {
    const leaf = leaves[index];
    const reach = leaf.length / 2;
    const offsetX = x - leaf.x;
    const offsetY = y - leaf.y;
    if (offsetX * offsetX + offsetY * offsetY <= reach * reach) return leaf;
  }
  return null;
}

// The mark whose centre is closest to (x, y), or null if there are none.
// Bush marks cover the whole blob, so there's always one close by.
function nearestMark(x, y, marks) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const mark of marks) {
    const distanceSquared = (mark.x - x) ** 2 + (mark.y - y) ** 2;
    if (distanceSquared < nearestDistance) {
      nearest = mark;
      nearestDistance = distanceSquared;
    }
  }
  return nearest;
}
