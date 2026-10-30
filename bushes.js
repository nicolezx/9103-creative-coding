// One undergrowth clump: a solid, softly blurred organic blob with a few
// crisp marks on top. Many overlapping clumps line each side of the lane
// (see drawBushes in sketch.js); each gets a slightly different shade so
// neighbours stay distinct where they overlap.
class Bush {
  constructor(x, y, size) {
    const settings = bushSettings;
    this.x = x;
    this.y = y; // foot of the clump, on the ground
    this.size = size;
    this.colour = jitter(palette.bush, 4, 8, 4);
    // blur grows with size so near clumps don't look sharper than far ones
    this.blur = size * settings.blurAmount;

    // outline: an ellipse whose radius wobbles with noise, so the edge reads
    // as rounded leafy lobes rather than a clean oval
    const radiusX = size * random(0.45, 0.65);
    const radiusY = size * 0.5;
    const centreY = y - radiusY * 0.85; // sits on the ground, base slightly buried
    const noiseOffset = random(1000);
    this.outline = [];
    const points = 48;
    for (let i = 0; i < points; i++) {
      const angle = (i / points) * TWO_PI;
      const wobble =
        1 -
        settings.lumpDepth +
        settings.lumpDepth *
          2 *
          noise(
            noiseOffset + cos(angle) * settings.lumpFrequency,
            sin(angle) * settings.lumpFrequency,
          );
      this.outline.push({
        x: x + cos(angle) * radiusX * wobble,
        // flatten the underside at the foot so the clump sits on the ground
        y: min(y, centreY + sin(angle) * radiusY * wobble),
      });
    }

    // marks inside the blob, generated once so redraws don't re-roll them
    const sizeScale = min(1, size / 400);
    this.marks = [];
    const markCount = floor(settings.marksPerClump * (0.5 + sizeScale));
    for (let i = 0; i < markCount; i++) {
      // biased toward the top of the clump, where the light catches it
      const angle = random(PI, TWO_PI);
      const radius = sqrt(random()) * 0.95;
      this.marks.push({
        x: x + cos(angle) * radiusX * radius,
        y: centreY + sin(angle) * radiusY * radius,
        angle: random(TWO_PI),
        length: lerp(2, 12, sizeScale) * random(0.7, 1.3),
        weight: lerp(1.5, 5.5, sizeScale),
        colour: jitter(palette.bush, 10, 10, 12),
      });
    }
  }

  draw() {
    this.drawMass();
    this.drawMarks();
  }

  // Native canvas blur on just this fill: p5's filter(BLUR) would blur the
  // whole canvas, and blurring a single shape is cheap enough for ~40 clumps
  drawMass() {
    noStroke();
    fill(this.colour);
    drawingContext.filter = `blur(${this.blur}px)`;
    beginShape();
    for (const point of this.outline) vertex(point.x, point.y);
    endShape(CLOSE);
    drawingContext.filter = "none";
  }

  drawMarks() {
    for (const mark of this.marks) {
      dash(mark.x, mark.y, mark.angle, mark.length, mark.weight, mark.colour);
    }
  }
}
