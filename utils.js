// Shared helpers for the Woldgate scene: perspective, placement and mark
// primitives. Nothing here draws a whole scene object on its own.
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

// Straight dash centred on (x, y)
function dash(x, y, angle, length, weight, colour) {
  stroke(colour);
  strokeWeight(weight);
  const offsetX = (cos(angle) * length) / 2;
  const offsetY = (sin(angle) * length) / 2;
  line(x - offsetX, y - offsetY, x + offsetX, y + offsetY);
}

// Curved dab centred on (x, y): like dash() but bowed sideways. `bend` is how
// far the middle bows, as a fraction of length (+/- picks the side; 0 = straight)
function dab(x, y, angle, length, weight, colour, bend) {
  stroke(colour);
  strokeWeight(weight);
  noFill(); // the curve is stroke-only; otherwise p5 fills the bowed area
  const offsetX = (cos(angle) * length) / 2;
  const offsetY = (sin(angle) * length) / 2;
  // a quadratic's midpoint sits halfway to its control point, so push the
  // control point twice the wanted bow out along the perpendicular
  const bow = bend * length * 2;
  beginShape();
  vertex(x - offsetX, y - offsetY);
  quadraticVertex(
    x - sin(angle) * bow,
    y + cos(angle) * bow,
    x + offsetX,
    y + offsetY,
  );
  endShape();
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

// ---------------------------------------------------------------------------
// Resizing helper
// ---------------------------------------------------------------------------
// Backing pixels per design pixel so the canvas is crisp once it covers the
// window (scaled by whichever axis needs to stretch more)
function sharpDensity() {
  const coverScale = max(
    windowWidth / canvasWidth,
    windowHeight / canvasHeight,
  );
  return coverScale * window.devicePixelRatio;
}
