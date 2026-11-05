// User input: hover glints and click bursts.
//
// Hover: the canvas is split into a grid of ColourBlocks. Blocks within
// `hoverRadius` of the cursor "glint" — they take a lighter highlight colour
// from the palette of whatever is underneath (tree, bush, water, track, sky),
// like light catching that surface. Once the cursor moves on, each block fades
// back to the scene's own colour over `glintDuration`.
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
const hoverRadius = 70; // px (scene units) around the cursor that glints [> 0]; try 40–120
const glintDuration = 900; // ms for a glint to fade back once the cursor leaves [> 0]; try 400–1500
const columns = 64; // grid columns across the canvas [whole number ≥ 1, more = finer but slower]; try 32–96
const rows = 36; // grid rows (64 × 36 keeps cells square on the 16:9 canvas) [whole number ≥ 1]; try 18–54
const glintStrength = 0.55; // max opacity of a glint at the cursor [0–1]; try 0.3–0.8
const burstCount = [10, 18]; // [min, max] pieces per click on a tree/bush [whole numbers ≥ 0]
const burstLife = 1400; // ms a burst piece lives [> 0]; try 800–2500
const ringLife = 900; // ms a click ring takes to fade out [> 0]; try 500–1500

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let blocks = []; // ColourBlock grid
let bursts = []; // live Burst pieces
let rings = []; // live click rings: { x, y, scale, age, isWater }

// Highlight colours per region, as [h, s, b]. Rebuilt every frame from
// `palette` (updateInputElements) so they shift with time of day and weather.
let treePalette = [];
let bushPalette = [];
let waterPalette = [];
let trackPalette = [];
let skyPalette = [];

// Cursor in scene coordinates (null when it's off the canvas)
let sceneMouse = null;

// Hit areas for trees and bushes, filled by registerHitAreas() from
// drawTrees() / drawBushes() in sketch.js. Stored in draw order (far → near).
const hitAreas = { tree: [], bush: [] };

// ---------------------------------------------------------------------------
// ColourBlock: one grid cell. Holds its own highlight and reacts to the cursor.
// ---------------------------------------------------------------------------
class ColourBlock {
  constructor(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.cx = x + w / 2;
    this.cy = y + h / 2;
    this.glint = 0; // current strength 0–1
    this.peak = 0; // strength when the glint last started/refreshed
    this.startedAt = 0; // millis() of that moment
    this.highlight = null; // [h, s, b]
    // A few fixed dabs per cell so the glint reads as painted light, not a
    // flat square. Math.random (not p5's seeded random) so cells differ.
    this.dabs = [];
    for (let i = 0; i < 3; i++) {
      this.dabs.push({
        dx: (Math.random() - 0.5) * w * 0.8,
        dy: (Math.random() - 0.5) * h * 0.8,
        angle: Math.random() * TWO_PI,
        length: w * (0.6 + Math.random() * 0.6),
        bend: (Math.random() - 0.5) * 0.3,
      });
    }
  }

  // Strength 0–1 if the cursor is within hoverRadius, else 0
  isNearMouse() {
    if (!sceneMouse) return 0;
    const d = dist(this.cx, this.cy, sceneMouse.x, sceneMouse.y);
    return d < hoverRadius ? 1 - d / hoverRadius : 0;
  }

  // Light up (or keep lit) at `strength`; a stronger hit overrides a fading one
  startGlint(strength) {
    if (strength < this.glint) return;
    const region = getRegion(this.cx, this.cy);
    // keep the same colour while it stays lit, so it doesn't flicker
    if (!this.highlight || this.glint <= 0 || region !== this.region) {
      this.highlight = pickHighlight(region);
    }
    this.region = region;
    this.peak = strength;
    this.glint = strength;
    this.startedAt = millis();
  }

  // Fade linearly back to nothing over glintDuration
  update() {
    if (this.glint <= 0) return;
    const fade = 1 - (millis() - this.startedAt) / glintDuration;
    this.glint = max(0, this.peak * fade);
  }

  display() {
    if (this.glint <= 0 || !this.highlight) return;
    const [h, s, b] = this.highlight;
    const alpha = this.glint * glintStrength;
    noStroke();
    fill(h, s, b, alpha * 0.6);
    rect(this.x, this.y, this.w, this.h); // soft wash over the cell
    strokeCap(ROUND);
    for (const d of this.dabs) {
      dab(
        this.cx + d.dx,
        this.cy + d.dy,
        d.angle,
        d.length,
        this.w * 0.35,
        color(h, s, b, alpha),
        d.bend,
      );
    }
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
    const angle = random(TWO_PI);
    const speed = random(80, 260) * (size / 6); // px per second, bigger near the viewer
    this.vx = cos(angle) * speed;
    this.vy = sin(angle) * speed - speed * 0.4; // bias upward: it's flung off the branch
    this.angle = random(TWO_PI);
    this.spin = random(-6, 6); // radians per second
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
// Pointer events fire between frames, so glints start where the cursor
// actually passed even though the scene only redraws at FRAME_RATE.
function setupInputElements() {
  buildBlocks();
  window.addEventListener("pointermove", (event) => {
    sceneMouse = toScene(event.clientX, event.clientY);
    for (const block of blocks) {
      const strength = block.isNearMouse();
      if (strength > 0) block.startGlint(strength);
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

// A random highlight colour for a region, as [h, s, b]
function pickHighlight(region) {
  const choices = {
    tree: treePalette,
    bush: bushPalette,
    water: waterPalette,
    track: trackPalette,
    sky: skyPalette,
  }[region];
  return random(choices);
}

// Called at the end of draw(): refresh highlight palettes, keep glinting the
// blocks under a still cursor, then update + draw glints, rings and bursts.
function updateInputElements() {
  // Highlights are the lighter keys of each region's palette, so the "light"
  // matches the current time of day (warm at golden hour, dim at night).
  const hsb = (c) => [hue(c), saturation(c), brightness(c)];
  treePalette = [palette.leafLight, palette.blossomLight, palette.flowerWhite].map(hsb);
  bushPalette = [palette.grassLight, palette.leafLight, palette.leaf].map(hsb);
  waterPalette = [palette.cloud, palette.skyLow, palette.flowerWhite].map(hsb); // reflects the sky
  trackPalette = [palette.ridge, palette.cloud].map(hsb);
  skyPalette = [palette.cloud, palette.flowerWhite, palette.blossomLight].map(hsb);

  const dt = min(deltaTime, 250) / 1000; // seconds; capped so a stall doesn't teleport pieces

  push();
  // SCREEN only ever lightens, like light falling on the surface
  blendMode(SCREEN);
  for (const block of blocks) {
    const strength = block.isNearMouse();
    if (strength > 0) block.startGlint(strength); // cursor resting: stay lit
    block.update();
    block.display();
  }

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
    const count = floor(random(burstCount[0], burstCount[1] + 1));
    const size = lerp(3, 10, constrain(scale, 0, 1)); // bigger near the viewer
    for (let i = 0; i < count; i++) {
      bursts.push(new Burst(point.x, point.y, hsb(random(colours)), size * random(0.7, 1.3)));
    }
  }
}

// Record tree / bush hit areas. Called from drawTrees() / drawBushes() with
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
