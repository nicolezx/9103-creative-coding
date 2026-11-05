// User input: leaf sway on hover, bursts + rings on click.
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
//      (getSwayArea → redrawArea), and nothing at all once they're still.
//
// CLICK
// On a tree or bush, a handful of Burst pieces (blossom / leaf bits) shoot
// out from the click; every click also leaves a ring (a ripple on water).
//
// Like the planned Interaction layer (AGENTS.md §2), this acts on the scene
// directly and only *reads* `palette`. It never changes time or weather.

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
// Ranges: [hard limits] are what the code can handle; "try" is what looks good.
const swayRadius = 80; // px around the cursor in which leaves sway (soft edge) [> 0]; try 50–120
const swayDistance = 2.5; // furthest a leaf shifts, in leaf widths [0–3, more can get clipped at the redraw edge]; try 1.5–3
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
const leafCoverageCellSize = 8; // px per cell of the "where are leaves?" map [> 0, smaller = more exact]; try 4–12
const burstCount = [10, 18]; // [min, max] pieces per click on a tree/bush [whole numbers ≥ 0]
const burstLife = 1400; // ms a burst piece lives [> 0]; try 800–2500
const ringLife = 900; // ms a click ring takes to fade out [> 0]; try 500–1500

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let leafSway = null; // the one LeafSway (made in setupInputElements)
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

// Hit areas for trees and bushes, filled by registerHitAreas() from
// finishRebuild() in sketch.js. Stored in draw order (far → near).
const hitAreas = { tree: [], bush: [] };

// Where tree leaves actually are: a coarse grid over the canvas, 1 where any
// leaf covers that cell. Rebuilt with the hit areas (buildLeafCoverage), so the
// sway only starts when the cursor is really on leaves, not on sky between them.
let leafCoverage = null; // { columnCount, rowCount, cells: Uint8Array }

// ---------------------------------------------------------------------------
// LeafSway: how much the leaves near the cursor are swaying right now.
// One shared state for the whole scene, so there are no seams between patches.
// ---------------------------------------------------------------------------
class LeafSway {
  constructor() {
    this.strength = 0; // 0 = still … 1 = full sway
    this.centreX = 0; // middle of the swaying patch: trails the cursor slightly
    this.centreY = 0;
    this.isOverLeaves = false; // is the cursor on a tree's leaves?
    this.lastMovedAt = -Infinity; // millis() of the last cursor move over leaves
    this.swayTime = 0; // how far along the noise pattern we are; advances only while swaying
  }

  // Step 1 — called on every cursor move (or with null when it leaves the canvas)
  noticeCursor(position) {
    this.isOverLeaves = position !== null && isOverTreeLeaves(position.x, position.y);
    if (!this.isOverLeaves) return;
    this.lastMovedAt = millis();
    // starting from still: begin the patch right where the cursor arrived
    if (this.strength === 0) {
      this.centreX = position.x;
      this.centreY = position.y;
    }
  }

  // Step 2 — called once per frame: ease the strength toward its target
  update(deltaSeconds) {
    // full sway while the cursor is on leaves and has moved recently; still otherwise
    const movedRecently = millis() - this.lastMovedAt < swayCalmDelay * 1000;
    const targetStrength = this.isOverLeaves && movedRecently ? 1 : 0;
    const easeTime = targetStrength > this.strength ? swayFadeInTime : swayFadeOutTime;
    this.strength = approach(this.strength, targetStrength, easeTime, deltaSeconds);
    if (targetStrength === 0 && this.strength < 0.03) this.strength = 0; // too small to see: stop
    if (this.strength === 0) return;

    // the patch glides after the cursor instead of jumping with it
    if (cursorScenePosition) {
      this.centreX = approach(this.centreX, cursorScenePosition.x, swayFollowTime, deltaSeconds);
      this.centreY = approach(this.centreY, cursorScenePosition.y, swayFollowTime, deltaSeconds);
    }
    this.swayTime += swaySpeed * deltaSeconds;
  }

  // The box sketch.js must redraw ({ x, y, w, h }), or null when still
  getArea() {
    if (this.strength === 0) return null;
    // leaves within swayRadius move, by up to swayDistance leaf widths (~25 px
    // for the biggest leaves); the extra 60 px covers that plus the leaf's own size
    const reach = swayRadius + 60;
    return { x: this.centreX - reach, y: this.centreY - reach, w: reach * 2, h: reach * 2 };
  }

  // Step 3 — one leaf: return it unchanged, or a slightly moved copy
  moveLeaf(leaf) {
    if (this.strength === 0) return leaf;
    const distanceToCentre = dist(leaf.x, leaf.y, this.centreX, this.centreY);
    const amount = this.strength * smoothFalloff(distanceToCentre, swayRadius);
    if (amount === 0) return leaf;

    // noise() is smooth in space and time: leaves close together get similar
    // values (they move as a patch), and each value drifts slowly as swayTime
    // advances. The +100 / +200 offsets give x, y and angle their own patterns.
    // (noise() doesn't use p5's random() stream, so the scene layout is safe.)
    const noiseX = leaf.x / swayPatchSize;
    const noiseY = leaf.y / swayPatchSize;
    const shiftX = (noise(noiseX, noiseY, this.swayTime) - 0.5) * 2;
    const shiftY = (noise(noiseX + 100, noiseY, this.swayTime) - 0.5) * 2;
    const turn = (noise(noiseX + 200, noiseY, this.swayTime) - 0.5) * 2;

    const shiftSize = amount * swayDistance * leaf.weight;
    return {
      ...leaf,
      x: leaf.x + shiftX * shiftSize,
      y: leaf.y + shiftY * shiftSize,
      angle: leaf.angle + turn * swayAngle * amount,
    };
  }
}

// ---------------------------------------------------------------------------
// Burst: one blossom or leaf piece thrown out from a click
// ---------------------------------------------------------------------------
class Burst {
  constructor(x, y, colour, size) {
    this.x = x;
    this.y = y;
    this.colour = colour; // [h, s, b]
    this.size = size;
    const launchAngle = randomBetween(0, TWO_PI);
    const launchSpeed = randomBetween(80, 260) * (size / 6); // px per second, bigger near the viewer
    this.velocityX = cos(launchAngle) * launchSpeed;
    this.velocityY = sin(launchAngle) * launchSpeed - launchSpeed * 0.4; // bias upward: flung off the branch
    this.angle = randomBetween(0, TWO_PI);
    this.spin = randomBetween(-6, 6); // radians per second
    this.shapeSeed = Math.random(); // fixed outline, so the piece doesn't morph as it flies
    this.age = 0; // ms
    this.done = false;
  }

  // deltaSeconds = time since the last frame, so motion is the same at any frame rate
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
  leafSway = new LeafSway();
  window.addEventListener("pointermove", (event) => {
    cursorScenePosition = windowToScene(event.clientX, event.clientY);
    leafSway.noticeCursor(cursorScenePosition);
  });
  document.addEventListener("pointerleave", () => {
    cursorScenePosition = null;
    leafSway.noticeCursor(null);
  });
}

// Hover hook for Tree.drawLeaves(): returns the leaf as it should be drawn
// this frame. Never calls p5's random(): it runs mid-draw, where that would
// change the scene.
function swayLeaf(leaf) {
  if (swayPaused || !leafSway) return leaf;
  return leafSway.moveLeaf(leaf);
}

// Called once per frame by sketch.js before the hover patch is drawn:
// advances the sway, then returns the box to redraw, or null when still.
function getSwayArea() {
  if (!leafSway) return null;
  const deltaSeconds = min(deltaTime, 250) / 1000; // capped so a stall doesn't jump
  leafSway.update(deltaSeconds);
  return leafSway.getArea();
}

// What's under scene point (x, y): "tree", "bush", "water", "track" or "sky".
// Trees are drawn over bushes, and nearer things over farther ones, so check
// in that order (hit areas are stored far → near, hence the reverse loops).
function getRegion(x, y) {
  const trees = hitAreas.tree;
  for (let index = trees.length - 1; index >= 0; index--) {
    if (pointInTreeArea(x, y, trees[index])) return "tree";
  }
  const bushes = hitAreas.bush;
  for (let index = bushes.length - 1; index >= 0; index--) {
    if (pointInEllipse(x, y, bushes[index])) return "bush";
  }
  if (!vanishingPoint || y < vanishingPoint.y) return "sky";

  // Work lane() backwards: screen y → `along`, then compare x with the road edges
  const scale = (y - vanishingPoint.y) / ((height - vanishingPoint.y) * perspective.zoom);
  const along = pow(constrain(1 - scale, 0, 1), 1 / perspective.compression);
  const roadLeft = lane(along, leftEdge(along)).x;
  const roadRight = lane(along, rightEdge(along)).x;
  const across = (x - roadLeft) / (roadRight - roadLeft);
  if (across < 0 || across > 1) return "bush"; // grassy verge: treated like the undergrowth
  // The tyre ruts (same bands drawRoad() paints) hold rainwater in the
  // paintings, so they ripple like water; the rest is dry track.
  const inRut = (across > 0.22 && across < 0.36) || (across > 0.64 && across < 0.78);
  return inRut ? "water" : "track";
}

// Is (x, y) on a tree's leaves? Looks it up in the leaf coverage grid.
function isOverTreeLeaves(x, y) {
  if (!leafCoverage) return false;
  const column = floor(x / leafCoverageCellSize);
  const row = floor(y / leafCoverageCellSize);
  if (column < 0 || column >= leafCoverage.columnCount || row < 0 || row >= leafCoverage.rowCount) return false;
  return leafCoverage.cells[row * leafCoverage.columnCount + column] === 1;
}

// Fill the leaf coverage grid: mark every cell a leaf (incl. its size) touches
function buildLeafCoverage(trees) {
  const columnCount = ceil(width / leafCoverageCellSize);
  const rowCount = ceil(height / leafCoverageCellSize);
  const cells = new Uint8Array(columnCount * rowCount);
  for (const tree of trees) {
    for (const leaf of tree.foliage || []) {
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
  }
  leafCoverage = { columnCount, rowCount, cells };
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
    tree: [palette.leafLight, palette.blossomLight, palette.flowerWhite].map(colourToHsb),
    bush: [palette.grassLight, palette.leafLight, palette.leaf].map(colourToHsb),
    water: [palette.cloud, palette.skyLow, palette.flowerWhite].map(colourToHsb), // reflects the sky
    track: [palette.ridge, palette.cloud].map(colourToHsb),
    sky: [palette.cloud, palette.flowerWhite, palette.blossomLight].map(colourToHsb),
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

  // Bursts: solid pieces drawn normally so they read as petals, not light
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
  const region = getRegion(point.x, point.y);
  const depthScale = laneScaleAt(point.y);

  rings.push({
    x: point.x,
    y: point.y,
    depthScale,
    age: 0,
    isWater: region === "water",
    colour: pickRingColour(region),
  });

  if (region === "tree" || region === "bush") {
    // trees shed blossom and leaves; bushes mostly leaves
    const colours =
      region === "tree"
        ? [palette.blossom, palette.blossomLight, palette.leaf, palette.leafLight]
        : [palette.leaf, palette.leafLight, palette.grassLight];
    const count = floor(randomBetween(burstCount[0], burstCount[1] + 1));
    const pieceSize = lerp(3, 10, constrain(depthScale, 0, 1)); // bigger near the viewer
    for (let index = 0; index < count; index++) {
      const colour = colours[floor(Math.random() * colours.length)];
      bursts.push(new Burst(point.x, point.y, colourToHsb(colour), pieceSize * randomBetween(0.7, 1.3)));
    }
  }
}

// Record tree / bush hit areas. Called from finishRebuild() (sketch.js) with
// the objects in draw order, each time the scene is repainted.
function registerHitAreas(kind, objects) {
  if (kind === "bush") {
    // matches the blob in Bush's constructor: radiusX ≤ 0.65 size, radiusY 0.5 size
    hitAreas.bush = objects.map((bush) => ({
      x: bush.x,
      y: bush.y - bush.size * 0.425,
      rx: bush.size * 0.55,
      ry: bush.size * 0.5,
    }));
  } else if (kind === "tree") {
    hitAreas.tree = objects.filter((tree) => tree.branches).map(treeHitArea);
    buildLeafCoverage(objects);
  }
}

// ---------------------------------------------------------------------------
// Tree hit areas (specific to this file; general shape tests are in utils.js)
// ---------------------------------------------------------------------------

// Canopy = ellipse around every branch tip (padded for the leaf clumps), plus
// the trunk as a thin box from the base to the trunk top
function treeHitArea(tree) {
  let minX = tree.trunkTop.x;
  let maxX = tree.trunkTop.x;
  let minY = tree.trunkTop.y;
  let maxY = tree.trunkTop.y;
  let leafPadding = 0;
  const includeBranch = (branch) => {
    minX = min(minX, branch.endX);
    maxX = max(maxX, branch.endX);
    minY = min(minY, branch.endY);
    maxY = max(maxY, branch.endY);
    // leaf clumps spill past the outer tips by up to a clump radius
    if (!branch.children.length) {
      leafPadding = max(leafPadding, branch.length * treeSettings.clumpSize[1]);
    }
    branch.children.forEach(includeBranch);
  };
  tree.branches.forEach(includeBranch);
  return {
    canopy: {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      rx: (maxX - minX) / 2 + leafPadding,
      ry: (maxY - minY) / 2 + leafPadding,
    },
    trunk: {
      x: min(tree.x, tree.trunkTop.x) - tree.baseWidth,
      y: tree.trunkTop.y,
      w: abs(tree.x - tree.trunkTop.x) + tree.baseWidth * 2,
      h: tree.y - tree.trunkTop.y,
    },
  };
}

// Is (x, y) on this tree: its trunk or its canopy?
function pointInTreeArea(x, y, treeArea) {
  return pointInRect(x, y, treeArea.trunk) || pointInEllipse(x, y, treeArea.canopy);
}
