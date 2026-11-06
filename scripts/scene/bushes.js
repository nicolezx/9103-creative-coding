// One undergrowth clump: a solid, softly blurred organic blob with a few
// crisp marks on top. Many overlapping clumps line each side of the lane
// (see buildBushes in sketch.js); each gets a slightly different shade so
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

    // marks across the whole blob, generated once so redraws don't re-roll them.
    // Mark size is proportional to the clump, so the same count covers near
    // and far clumps equally densely
    this.marks = [];
    for (let i = 0; i < settings.marksPerClump; i++) {
      // step from the centre toward a random outline point: always lands
      // inside the wobbly edge (incl. the flattened foot); sqrt spreads them
      // evenly by area instead of bunching in the middle
      const edge = random(this.outline);
      const t = sqrt(random()) * 0.95;
      this.marks.push({
        x: lerp(x, edge.x, t),
        y: lerp(centreY, edge.y, t),
        angle: random(TWO_PI),
        length: size * settings.markLength * random(0.7, 1.3),
        weight: max(1, size * settings.markWeight),
        // only some strokes curve, so the texture mixes straight and bowed marks
        bend:
          random() < settings.curvedShare
            ? random([-1, 1]) * random(0.5, 1) * settings.markBend
            : 0,
        colour: jitter(palette.bush, ...settings.markJitter),
      });
    }
  }

  // Box everything this clump draws fits in: outline, padded for the blur
  // and for marks pushed outward by the hover (user-input.js)
  get bounds() {
    if (!this._bounds) {
      const pad = this.size * bushSettings.markLength * 2 + this.blur * 3;
      const xs = this.outline.map((p) => p.x);
      const ys = this.outline.map((p) => p.y);
      const minX = min(xs) - pad;
      const minY = min(ys) - pad;
      this._bounds = { x: minX, y: minY, w: max(xs) + pad - minX, h: max(ys) + pad - minY };
    }
    return this._bounds;
  }

  // `area` (optional { x, y, w, h }): only draw marks inside it, for
  // partial redraws (redrawArea in sketch.js)
  draw(area) {
    this.drawMass();
    this.drawMarks(area);
  }

  // Native canvas blur on just this fill: p5's filter(BLUR) would blur the
  // whole canvas.
  // Clipped to this clump's own box (massClip): Chrome runs a canvas filter
  // over a layer as big as the clip, so unclipped every one of the ~200 clumps
  // blurred a whole canvas-sized layer (~15 ms each, ~3 s per repaint, which
  // is what made frames stall while the day cycle repaints). The box reaches
  // well past where the blur fades to nothing, so the picture is unchanged
  // (checked pixel for pixel against the unclipped version).
  drawMass() {
    // set before push(), so they're still set after pop(): drawMarks relies on noStroke
    noStroke();
    fill(this.colour);
    const box = this.massClip;
    push(); // not drawingContext.save(): see withClip (sketch.js)
    drawingContext.beginPath();
    drawingContext.rect(box.x, box.y, box.w, box.h);
    drawingContext.clip();
    drawingContext.filter = `blur(${this.blur}px)`;
    beginShape();
    for (const point of this.outline) vertex(point.x, point.y);
    endShape(CLOSE);
    drawingContext.filter = "none";
    pop();
  }

  // Box the blurred fill fits in: the outline, padded by 4× the blur radius
  // (the blur measurably fades to zero within ~1×) plus 4 px for anti-aliasing
  get massClip() {
    if (!this._massClip) {
      const pad = max(0, this.blur) * 4 + 4;
      const xs = this.outline.map((p) => p.x);
      const ys = this.outline.map((p) => p.y);
      const minX = min(xs) - pad;
      const minY = min(ys) - pad;
      this._massClip = { x: minX, y: minY, w: max(xs) + pad - minX, h: max(ys) + pad - minY };
    }
    return this._massClip;
  }

  // rustleBushMark (user-input.js) moves the marks near the cursor; curved
  // marks keep their resting outline (shapeSeed) while they move
  drawMarks(area) {
    for (const restingMark of this.marks) {
      // partial redraw: skip marks outside the area (padded by the mark's size
      // plus room for the rustle)
      if (area && !pointInRect(restingMark.x, restingMark.y, area, restingMark.length * 2)) continue;
      const mark = rustleBushMark(restingMark);
      if (mark.bend === 0) {
        dash(mark.x, mark.y, mark.angle, mark.length, mark.weight, mark.colour);
      } else {
        const shapeSeed = hash01(restingMark.x, restingMark.y, restingMark.angle); // = dab()'s default at rest
        dab(mark.x, mark.y, mark.angle, mark.length, mark.weight, mark.colour, mark.bend, shapeSeed);
      }
    }
  }
}
