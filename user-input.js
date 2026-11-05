// User input: hover rustle and click bursts.
//
// Hover: nothing is drawn on top of the scene. Instead the existing leaf marks
// on trees and the marks on bushes are nudged as they're drawn: within
// `hoverRadius` of the cursor they're pushed away from it and twisted a little,
// and some of them (`lightenShare`) blend toward a lighter colour from their
// region's palette, as if the moved leaves catch the light. Once the cursor
// moves on, they ease back to their place and colour over `glintDuration`.
//
// The canvas is split into a grid of ColourBlocks that only *remember* the
// touch: where the cursor was and how much it has faded since. Tree.drawFoliage()
// and Bush.drawMarks() ask hoverTouch() how to move each of their marks.
//
// Click: on a tree or bush, a handful of Burst pieces (blossom / leaf bits)
// shoot out from the click; every click also leaves a ring (a ripple on water).
//
// Like the planned Interaction layer (AGENTS.md §2), this acts on the canvas
// directly and only *reads* `palette`. It never changes time or weather.
// All colours come from `palette`, so highlights follow the time of day.

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
// Ranges: [hard limits] are what the code can handle; "try" is what looks good.
const hoverRadius = 70; // px (scene units) around the cursor that disturbs marks [> 0]; try 40–120
const glintDuration = 900; // ms for marks to settle back once the cursor leaves [> 0]; try 400–1500
const columns = 64; // grid columns across the canvas [whole number ≥ 1, more = finer but slower]; try 32–96
const rows = 36; // grid rows (64 × 36 keeps cells square on the 16:9 canvas) [whole number ≥ 1]; try 18–54
const hoverPush = 0.6; // how far marks are pushed from the cursor, in mark lengths [≥ 0]; try 0.3–1
const hoverTwist = 0.6; // max extra rotation of a pushed mark, radians [≥ 0]; try 0.2–1
const lightenShare = 0.35; // fraction of touched marks that lighten [0–1]; try 0.2–0.5
const hoverLighten = 0.55; // how far those marks blend toward the highlight colour [0–1]; try 0.3–0.7
const burstCount = [10, 18]; // [min, max] pieces per click on a tree/bush [whole numbers ≥ 0]
const burstLife = 1400; // ms a burst piece lives [> 0]; try 800–2500
const ringLife = 900; // ms a click ring takes to fade out [> 0]; try 500–1500

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let blocks = []; // ColourBlock grid
let bursts = []; // live Burst pieces
let rings = []; // live click rings: { x, y, scale, age, isWater }

// Highlight colours per region, as [h, s, b]. Tree/bush ones lighten touched
// marks; the rest colour click rings. Rebuilt every frame from
// `palette` (updateInputElements) so they shift with time of day and weather.
let treePalette = [];
let bushPalette = [];
let waterPalette = [];
let trackPalette = [];
let skyPalette = [];

// Cursor in scene coordinates (null when it's off the canvas)
let sceneMouse = null;

// True while sketch.js paints its cache, so hovered marks aren't baked in
let hoverPaused = false;

// Hit areas for trees and bushes, filled by registerHitAreas() from
// finishRebuild() in sketch.js. Stored in draw order (far → near).
const hitAreas = { tree: [], bush: [] };

// ---------------------------------------------------------------------------
// ColourBlock: one grid cell. Remembers whether the cursor touched it, where,
// and how much that touch has faded. Draws nothing itself.
// ---------------------------------------------------------------------------
class ColourBlock {
  constructor(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.glint = 0; // touch strength 0–1: 1 while the cursor is near, then fades
    this.startedAt = 0; // millis() of the last touch
    this.touchX = 0; // cursor position at the last touch: marks are pushed away from it
    this.touchY = 0;
  }

  // True if any part of the cell is within hoverRadius of the cursor, so marks
  // near the cell's edge are covered too
  isNearMouse() {
    if (!sceneMouse) return false;
    const nearestX = constrain(sceneMouse.x, this.x, this.x + this.w);
    const nearestY = constrain(sceneMouse.y, this.y, this.y + this.h);
    return dist(nearestX, nearestY, sceneMouse.x, sceneMouse.y) < hoverRadius;
  }

  // Touch (or keep touching) at the current cursor position
  startGlint() {
    this.glint = 1;
    this.startedAt = millis();
    this.touchX = sceneMouse.x;
    this.touchY = sceneMouse.y;
  }

  // Fade linearly back to untouched over glintDuration
  update() {
    if (this.glint <= 0) return;
    this.glint = max(0, 1 - (millis() - this.startedAt) / glintDuration);
  }

  // How strongly a mark at (x, y) is disturbed, 0–1: full at the touch point,
  // easing to nothing at hoverRadius, scaled by how much the touch has faded
  strengthAt(x, y) {
    if (this.glint <= 0) return 0;
    const d = dist(x, y, this.touchX, this.touchY);
    if (d >= hoverRadius) return 0;
    const falloff = 1 - d / hoverRadius;
    return this.glint * falloff * falloff * (3 - 2 * falloff); // smoothstep: no hard rim
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
    const angle = randomBetween(0, TWO_PI);
    const speed = randomBetween(80, 260) * (size / 6); // px per second, bigger near the viewer
    this.vx = cos(angle) * speed;
    this.vy = sin(angle) * speed - speed * 0.4; // bias upward: it's flung off the branch
    this.angle = randomBetween(0, TWO_PI);
    this.spin = randomBetween(-6, 6); // radians per second
    this.age = 0;
    this.done = false;
  }

  // dt in seconds, so motion is the same at any frame rate
  update(dt) {
    this.age += dt * 1000;
    if (this.age > burstLife) {
      this.done = true;
      return;
    }
    this.vx *= pow(0.25, dt); // air drag
    this.vy = this.vy * pow(0.25, dt) + 220 * dt; // drag + gravity, petals drift down
    this.x += this.vx * dt + sin(this.age * 0.006) * 0.6; // slight flutter
    this.y += this.vy * dt;
    this.angle += this.spin * dt;
  }

  display() {
    const [h, s, b] = this.colour;
    const alpha = 1 - pow(this.age / burstLife, 2); // stay solid, then fade at the end
    dab(this.x, this.y, this.angle, this.size, this.size * 0.6, color(h, s, b, alpha), 0.25);
  }
}

// ---------------------------------------------------------------------------
// Input functions
// ---------------------------------------------------------------------------

// Called from setup(): build the grid and start tracking the cursor.
// Pointer events fire between frames, so touches start where the cursor
// actually passed even though the scene only redraws at FRAME_RATE.
function setupInputElements() {
  buildBlocks();
  window.addEventListener("pointermove", (event) => {
    sceneMouse = toScene(event.clientX, event.clientY);
    for (const block of blocks) {
      if (block.isNearMouse()) block.startGlint();
    }
  });
  document.addEventListener("pointerleave", () => (sceneMouse = null));
}

// Split the canvas into columns × rows ColourBlocks
function buildBlocks() {
  blocks = [];
  const w = width / columns;
  const h = height / rows;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      blocks.push(new ColourBlock(col * w, row * h, w, h));
    }
  }
}

// What's under scene point (x, y): "tree", "bush", "water", "track" or "sky".
// Trees are drawn over bushes, and nearer things over farther ones, so check
// in that order (hit areas are stored far → near, hence the reverse loops).
function getRegion(x, y) {
  const trees = hitAreas.tree;
  for (let i = trees.length - 1; i >= 0; i--) {
    if (insideTree(trees[i], x, y)) return "tree";
  }
  const bushes = hitAreas.bush;
  for (let i = bushes.length - 1; i >= 0; i--) {
    if (insideEllipse(bushes[i], x, y)) return "bush";
  }
  if (!vanishingPoint || y < vanishingPoint.y) return "sky";

  // Invert lane(): screen y → `along`, then compare x with the road edges
  const scale = (y - vanishingPoint.y) / ((height - vanishingPoint.y) * perspective.zoom);
  const along = pow(constrain(1 - scale, 0, 1), 1 / perspective.compression);
  const roadLeft = lane(along, leftEdge(along)).x;
  const roadRight = lane(along, rightEdge(along)).x;
  const across = (x - roadLeft) / (roadRight - roadLeft);
  if (across < 0 || across > 1) return "bush"; // grassy verge: lit like the undergrowth
  // The tyre ruts (same bands drawRoad() paints) hold rainwater in the
  // paintings, so they catch light like water; the rest is dry track.
  const inRut = (across > 0.22 && across < 0.36) || (across > 0.64 && across < 0.78);
  return inRut ? "water" : "track";
}

// A highlight colour for a region, as [h, s, b]. `pick` (0–1) chooses which;
// random by default. Code that runs inside draw() must pass its own value:
// p5's random() drives the seeded scene layout, and an extra call would reshuffle it.
function pickHighlight(region, pick = Math.random()) {
  const choices = {
    tree: treePalette,
    bush: bushPalette,
    water: waterPalette,
    track: trackPalette,
    sky: skyPalette,
  }[region];
  return choices[floor(pick * choices.length)];
}

// Called at the end of draw(): refresh highlight palettes, keep touching the
// blocks under a still cursor, fade the rest, then update + draw rings and bursts.
function updateInputElements() {
  // Highlights are the lighter keys of each region's palette, so the "light"
  // matches the current time of day (warm at golden hour, dim at night).
  const hsb = (c) => [hue(c), saturation(c), brightness(c)];
  treePalette = [palette.leafLight, palette.blossomLight, palette.flowerWhite].map(hsb);
  // (bush marks are dark greens, so mid greens still read as lighter)
  bushPalette = [palette.grassLight, palette.leafLight, palette.leaf].map(hsb);
  waterPalette = [palette.cloud, palette.skyLow, palette.flowerWhite].map(hsb); // reflects the sky
  trackPalette = [palette.ridge, palette.cloud].map(hsb);
  skyPalette = [palette.cloud, palette.flowerWhite, palette.blossomLight].map(hsb);

  const dt = min(deltaTime, 250) / 1000; // seconds; capped so a stall doesn't teleport pieces

  for (const block of blocks) {
    if (block.isNearMouse()) block.startGlint(); // cursor resting: stay disturbed
    block.update();
  }

  push();
  // SCREEN only ever lightens, like light catching the ring
  blendMode(SCREEN);

  // Rings: flattened by perspective so they lie on the ground
  noFill();
  for (const ring of rings) {
    ring.age += dt * 1000;
    const t = ring.age / ringLife;
    const [h, s, b] = ring.colour;
    stroke(h, s, b, (1 - t) * 0.8);
    strokeWeight(max(1, 2.5 * ring.scale));
    const r = (ring.isWater ? 50 : 30) * max(0.2, ring.scale) * (0.2 + t);
    ellipse(ring.x, ring.y, r * 2, r * 2 * (ring.isWater ? 0.35 : 1));
    if (ring.isWater && t > 0.25) {
      // second, later ripple inside the first
      ellipse(ring.x, ring.y, r * 1.2, r * 1.2 * 0.35);
    }
  }
  rings = rings.filter((ring) => ring.age < ringLife);
  blendMode(BLEND);

  // Bursts: solid pieces drawn normally so they read as petals, not light
  for (const piece of bursts) {
    piece.update(dt);
    piece.display();
  }
  bursts = bursts.filter((piece) => !piece.done);
  pop();
}

// Called from mousePressed() in sketch.js
function handleInputClick() {
  const point = toScene(winMouseX, winMouseY);
  if (!point) return;
  const region = getRegion(point.x, point.y);
  const scale = depthScale(point.y);

  rings.push({
    x: point.x,
    y: point.y,
    scale,
    age: 0,
    isWater: region === "water",
    colour: pickHighlight(region),
  });

  if (region === "tree" || region === "bush") {
    const hsb = (c) => [hue(c), saturation(c), brightness(c)];
    // trees shed blossom and leaves; bushes mostly leaves
    const colours =
      region === "tree"
        ? [palette.blossom, palette.blossomLight, palette.leaf, palette.leafLight]
        : [palette.leaf, palette.leafLight, palette.grassLight];
    const count = floor(randomBetween(burstCount[0], burstCount[1] + 1));
    const size = lerp(3, 10, constrain(scale, 0, 1)); // bigger near the viewer
    for (let i = 0; i < count; i++) {
      const colour = colours[floor(Math.random() * colours.length)];
      bursts.push(new Burst(point.x, point.y, hsb(colour), size * randomBetween(0.7, 1.3)));
    }
  }
}

// Hover hook for Tree.drawFoliage() and Bush.drawMarks(). Takes one mark
// { x, y, angle, length, colour } and returns it unchanged if the cursor
// hasn't touched it, or a moved copy: pushed away from the touch point, turned
// a little, and (for some marks) blended toward a lighter highlight colour.
// Never calls p5's random(): it runs mid-draw, where that would change the scene.
function hoverTouch(mark, region) {
  if (hoverPaused || !blocks.length) return mark;
  const col = floor(mark.x / (width / columns));
  const row = floor(mark.y / (height / rows));
  if (col < 0 || col >= columns || row < 0 || row >= rows) return mark;
  const block = blocks[row * columns + col];
  const strength = block.strengthAt(mark.x, mark.y);
  if (strength <= 0) return mark;

  // Stable per-mark number 0–1 from its position (marks sit in the same place
  // every frame), so the same leaves twist and lighten each frame instead of
  // flickering
  const h = markHash(mark.x, mark.y);
  // Slight rustle while touched; each mark on its own phase
  const shiver = sin(millis() * 0.012 + h * TWO_PI) * 0.25;
  const away = atan2(mark.y - block.touchY, mark.x - block.touchX);
  const push = strength * hoverPush * mark.length * (1 + shiver);

  let colour = mark.colour;
  if (h < lightenShare) {
    const highlight = pickHighlight(region, h / lightenShare);
    if (highlight) colour = mixRGB(colour, color(...highlight), strength * hoverLighten);
  }
  return {
    ...mark,
    x: mark.x + cos(away) * push,
    y: mark.y + sin(away) * push,
    angle: mark.angle + (h * 2 - 1 + shiver) * hoverTwist * strength,
    colour,
  };
}

// The box around every live touch ({ x, y, w, h }), or null when nothing is
// touched. sketch.js redraws only this patch each frame (redrawArea).
function getTouchedArea() {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const block of blocks) {
    if (block.glint <= 0) continue;
    minX = min(minX, block.touchX);
    maxX = max(maxX, block.touchX);
    minY = min(minY, block.touchY);
    maxY = max(maxY, block.touchY);
  }
  if (minX === Infinity) return null;
  // marks within hoverRadius move, and can be pushed up to about a mark
  // length further; 40 px covers that for the largest leaves
  const reach = hoverRadius + 40;
  return { x: minX - reach, y: minY - reach, w: maxX - minX + reach * 2, h: maxY - minY + reach * 2 };
}

// Unseeded random number in [a, b). Input code uses this instead of p5's
// random(): the scene repaints in the background across several frames, and
// any p5 random() call in between would change its layout.
function randomBetween(a, b) {
  return a + Math.random() * (b - a);
}

// Cheap repeatable hash of a position → 0–1
function markHash(x, y) {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

// Record tree / bush hit areas. Called from finishRebuild() (sketch.js) with
// the objects in draw order; cheap enough to redo every frame.
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
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Window (client) px → scene px. The canvas is CSS-scaled with
// `object-fit: cover`, which p5's own mouseX doesn't account for.
function toScene(clientX, clientY) {
  const canvas = document.querySelector("canvas");
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const s = max(rect.width / width, rect.height / height); // cover scale
  const offsetX = (rect.width - width * s) / 2; // cropped overflow, split evenly
  const offsetY = (rect.height - height * s) / 2;
  const x = (clientX - rect.left - offsetX) / s;
  const y = (clientY - rect.top - offsetY) / s;
  if (x < 0 || x > width || y < 0 || y > height) return null;
  return { x, y };
}

// Lane scale (0 at the horizon, ~1 near the viewer) at screen height y, for
// sizing click effects. Same formula as lane(), solved for scale.
function depthScale(y) {
  if (!vanishingPoint || y <= vanishingPoint.y) return 0.2;
  return (y - vanishingPoint.y) / (height - vanishingPoint.y);
}

function insideEllipse(area, x, y) {
  const dx = (x - area.x) / area.rx;
  const dy = (y - area.y) / area.ry;
  return dx * dx + dy * dy <= 1;
}

// Canopy = ellipse around every branch tip (padded for the leaf clumps), plus
// the trunk as a thin box from the base to the trunk top
function treeHitArea(tree) {
  let minX = tree.trunkTop.x;
  let maxX = tree.trunkTop.x;
  let minY = tree.trunkTop.y;
  let maxY = tree.trunkTop.y;
  let pad = 0;
  const walk = (node) => {
    minX = min(minX, node.endX);
    maxX = max(maxX, node.endX);
    minY = min(minY, node.endY);
    maxY = max(maxY, node.endY);
    // leaf clumps spill past outer tips by about half a branch length
    if (!node.children.length) pad = max(pad, node.length * treeSettings.clumpSize[1]);
    node.children.forEach(walk);
  };
  tree.branches.forEach(walk);
  return {
    canopy: {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      rx: (maxX - minX) / 2 + pad,
      ry: (maxY - minY) / 2 + pad,
    },
    trunk: {
      left: min(tree.x, tree.trunkTop.x) - tree.baseWidth,
      right: max(tree.x, tree.trunkTop.x) + tree.baseWidth,
      top: tree.trunkTop.y,
      bottom: tree.y,
    },
  };
}

function insideTree(area, x, y) {
  const t = area.trunk;
  if (x >= t.left && x <= t.right && y >= t.top && y <= t.bottom) return true;
  return insideEllipse(area.canopy, x, y);
}
