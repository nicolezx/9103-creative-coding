class Tree {
  constructor(x, y, height, kind, side) {
    // this.far = height < 70;
    this.x = x;
    this.y = y;
    this.height = height;
    this.kind = kind;
    // this.side = side;

    if (this.far) return;

    const lean = (side < 0 ? 1 : -1) * random(0.05, 0.18); // lean toward the lane
    const trunkLength = height * random(0.35, 0.45);
    const trunkTop = {
      x: x + cos(-HALF_PI + lean) * trunkLength,
      y: y + sin(-HALF_PI + lean) * trunkLength,
    };
    const baseWidth = max(2, height * 0.05);
    const branchLength = (height - trunkLength) / 2.4;
    const branchDepth = height > 200 ? 4 : height > 90 ? 2 : 2; // how many levels of branches, lower branches have less children

    const branches = [];
    const crownBranchCount = random([2, 3]);
    for (let i = 0; i < crownBranchCount; i++) {
      branches.push(
        this.makeBranch(
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
      this.makeBranch(
        lerp(x, trunkTop.x, sideBranchHeight),
        lerp(y, trunkTop.y, sideBranchHeight),
        -HALF_PI + lean + random([-1, 1]) * random(0.6, 1.0),
        branchLength * 0.7,
        baseWidth * 0.45,
        branchDepth - 2,
      ),
    );
    // trunk bends far less than the branches (±6% vs ±15%) so it stays sturdy
    const trunkBendThreshold = 0.06;
    const trunkBend =
      random(-trunkBendThreshold, trunkBendThreshold) * trunkLength;
    this.trunkControls = bendControls(
      x,
      y,
      trunkTop.x,
      trunkTop.y,
      trunkBend,
      trunkBend,
    );
    this.trunkTop = trunkTop;
    this.baseWidth = baseWidth;
    this.branches = branches;
  }
  // Recursive branch: returns a node tree (kept as data so it can sway later)
  makeBranch(x, y, angle, length, weight, depth) {
    const endX = x + cos(angle) * length;
    const endY = y + sin(angle) * length;
    // independent sideways offsets for the two control points give a mix of
    // gentle C- and S-curves; scaled by length so twigs bend as much as limbs
    const branchBendThreshold = 0.15;
    const [c1, c2] = bendControls(
      x,
      y,
      endX,
      endY,
      random(-branchBendThreshold, branchBendThreshold) * length,
      random(-branchBendThreshold, branchBendThreshold) * length,
    );
    const node = {
      x,
      y,
      endX,
      endY,
      c1,
      c2,
      weight,
      depth,
      length,
      children: [],
    };
    if (depth > 0) {
      // children follow the curve's end tangent so the limb keeps flowing
      const endAngle = atan2(endY - c2.y, endX - c2.x);
      const childCount = random([1, 2, 2]);
      for (let i = 0; i < childCount; i++) {
        const childAngle = lerp(endAngle + random(-0.65, 0.65), -HALF_PI, 0.18); // slight upward pull
        node.children.push(
          this.makeBranch(
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
  draw() {
    this.far ? this.drawFar() : this.drawFull();
  }
  drawFull() {
    const topWidth = this.baseWidth * 0.6;

    // trunk: tapered shape with curved sides + bark dashes
    const [trunkC1, trunkC2] = this.trunkControls;
    // half-width at the control points (1/3 and 2/3 up) keeps the taper even
    const halfWidthAt = (t) => lerp(this.baseWidth, topWidth, t) / 2;
    noStroke();
    fill(palette.trunk);
    // fill(jitter(palette.trunk, 4, 6, 4));
    beginShape();
    vertex(this.x - this.baseWidth / 2, this.y);
    bezierVertex(
      trunkC1.x - halfWidthAt(1 / 3),
      trunkC1.y,
      trunkC2.x - halfWidthAt(2 / 3),
      trunkC2.y,
      this.trunkTop.x - topWidth / 2,
      this.trunkTop.y,
    );
    vertex(this.trunkTop.x + topWidth / 2, this.trunkTop.y);
    bezierVertex(
      trunkC2.x + halfWidthAt(2 / 3),
      trunkC2.y,
      trunkC1.x + halfWidthAt(1 / 3),
      trunkC1.y,
      this.x + this.baseWidth / 2,
      this.y,
    );
    endShape(CLOSE);
    // ----------------------------
    // trunk shading
    // ----------------------------
    // for (let i = 0; i < this.height * 0.4; i++) {
    //   const heightFraction = random();
    //   const barkX =
    //     bezierPoint(
    //       this.x,
    //       trunkC1.x,
    //       trunkC2.x,
    //       this.trunkTop.x,
    //       heightFraction,
    //     ) +
    //     random(-0.4, 0.4) * lerp(this.baseWidth, topWidth, heightFraction);
    //   dash(
    //     barkX,
    //     bezierPoint(
    //       this.y,
    //       trunkC1.y,
    //       trunkC2.y,
    //       this.trunkTop.y,
    //       heightFraction,
    //     ),
    //     -HALF_PI + random(-0.1, 0.1),
    //     (random(4, 10) * this.baseWidth) / 10 + 2,
    //     max(1, this.baseWidth * 0.12),
    //     jitter(palette.trunk, 8, 10, 14),
    //   );
    // }

    // branches, collecting the last two levels as foliage anchors
    const foliageAnchors = [];
    const drawBranch = (node) => {
      // stroke(palette.trunk);
      stroke(palette.trunk);
      noFill();
      // taper: draw the curve in pieces, thinning down to the children's
      // starting weight (× 0.62, see makeBranch) so joints meet without a step
      const pieces = splitBezier(
        [
          { x: node.x, y: node.y },
          node.c1,
          node.c2,
          { x: node.endX, y: node.endY },
        ],
        TAPER_PIECES,
      );
      pieces.forEach(([p0, p1, p2, p3], i) => {
        const weightFraction = (i + 0.5) / TAPER_PIECES; // weight at the piece's midpoint
        strokeWeight(max(0.6, node.weight * lerp(1, 0.62, weightFraction)));
        beginShape();
        vertex(p0.x, p0.y);
        bezierVertex(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
        endShape();
      });
      if (node.depth <= 1) foliageAnchors.push(node);
      node.children.forEach(drawBranch);
    };
    this.branches.forEach(drawBranch);

    // leaf / blossom clumps around the outer branches
    this.drawFoliage(foliageAnchors);
  }
  // Leaf clumps: a few rounded clusters of dabs along each outer branch.
  // Each clump is painted in three passes so it reads as a lit ball of leaves
  // rather than flat confetti: shadow underneath, mid-tone everywhere, light
  // on top (marks drift upward with each pass, toward the sky).
  drawFoliage(anchors) {
    const settings = treeSettings;
    const colours =
      this.kind === "blossom"
        ? [palette.blossom, palette.blossom, palette.blossomLight]
        : [palette.bush, palette.leaf, palette.leafLight];
    // far trees get fewer marks; detail is lost at that size anyway
    const sizeScale = min(1, this.height / 500);
    const marksPerClump = round(
      lerp(settings.leafMarksPerClump * 0.4, settings.leafMarksPerClump, sizeScale),
    );
    const passShare = [0.3, 0.45, 0.25]; // shadow / mid / light share of each clump's marks
    const passLift = [0.35, 0, -0.35]; // vertical drift per pass, in clump radii (− = up)

    const clumps = [];
    for (const anchor of anchors) {
      const count = round(random(...settings.clumpsPerBranch));
      for (let i = 0; i < count; i++) {
        // clumps sit along the outer part of the branch and spill past the tip
        const t = random(0.45, 1.05);
        clumps.push({
          x: bezierPoint(anchor.x, anchor.c1.x, anchor.c2.x, anchor.endX, t),
          y: bezierPoint(anchor.y, anchor.c1.y, anchor.c2.y, anchor.endY, t),
          radius: anchor.length * random(...settings.clumpSize),
        });
      }
    }

    for (let pass = 0; pass < 3; pass++) {
      for (const clump of clumps) {
        const markLength = max(1.5, clump.radius * settings.leafMarkLength);
        for (let i = 0; i < marksPerClump * passShare[pass]; i++) {
          // sqrt spreads marks evenly over the disc; squash it a little so
          // clumps are wider than tall, like foliage masses
          const angle = random(TWO_PI);
          const r = sqrt(random()) * clump.radius;
          dab(
            clump.x + cos(angle) * r,
            clump.y + sin(angle) * r * 0.8 + passLift[pass] * clump.radius,
            random(TWO_PI),
            markLength * random(0.7, 1.3),
            max(1.2, markLength * 0.6),
            jitter(colours[pass], 8, 10, 10),
            random(-0.2, 0.2),
          );
        }
      }
    }
  }
  // Distance shortcut: trunk stroke + lumpy blob of marks
  drawFar() {
    stroke(jitter(palette.trunk));
    strokeWeight(max(1, this.height * 0.04));
    line(this.x, this.y, this.x, this.y - this.height * 0.5);

    const crownY = this.y - this.height * 0.62;
    const crownRadiusX = this.height * 0.32;
    const crownRadiusY = this.height * 0.38;
    const crownColours =
      this.kind === "blossom"
        ? [palette.blossom, palette.blossomLight]
        : [palette.bush, palette.leaf];
    // for (let i = 0; i < this.height * 4; i++) {
    //   const angle = random(TWO_PI);
    //   const radius = sqrt(random()); // sqrt spreads points evenly across the disc
    //   const wobble = 0.8 + 0.4 * noise(cos(angle) + this.x * 0.1, sin(angle));
    //   dash(
    //     this.x + cos(angle) * radius * crownRadiusX * wobble,
    //     crownY + sin(angle) * radius * crownRadiusY * wobble,
    //     random(TWO_PI),
    //     random(2, 5),
    //     random(1.5, 3),
    //     jitter(
    //       i < this.height * 2 ? crownColours[0] : crownColours[1],
    //       10,
    //       10,
    //       12,
    //     ),
    //   );
    // }
  }
}

// Bezier control points at 1/3 and 2/3 along a segment, each pushed sideways
// (along the segment's normal) by its own offset in pixels
function bendControls(x1, y1, x2, y2, offset1, offset2) {
  const segmentLength = dist(x1, y1, x2, y2) || 1;
  const normalX = -(y2 - y1) / segmentLength;
  const normalY = (x2 - x1) / segmentLength;
  return [
    {
      x: lerp(x1, x2, 1 / 3) + normalX * offset1,
      y: lerp(y1, y2, 1 / 3) + normalY * offset1,
    },
    {
      x: lerp(x1, x2, 2 / 3) + normalX * offset2,
      y: lerp(y1, y2, 2 / 3) + normalY * offset2,
    },
  ];
}

// Number of strokes each branch is split into for its taper. More pieces give
// a smoother taper at the cost of more draw calls per branch.
const TAPER_PIECES = 8;

// Split a cubic bezier [p0, c1, c2, p3] into `count` equal-t pieces, each
// returned as its own [p0, c1, c2, p3]. Uses de Casteljau splitting, so the
// pieces trace exactly the same curve as the original.
function splitBezier(curve, count) {
  const pieces = [];
  let rest = curve;
  for (let i = count; i > 1; i--) {
    const [piece, remainder] = splitBezierAt(rest, 1 / i); // 1/i of what's left = equal steps overall
    pieces.push(piece);
    rest = remainder;
  }
  pieces.push(rest);
  return pieces;
}

function splitBezierAt([p0, p1, p2, p3], t) {
  const mix = (a, b) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
  const a = mix(p0, p1);
  const b = mix(p1, p2);
  const c = mix(p2, p3);
  const d = mix(a, b);
  const e = mix(b, c);
  const mid = mix(d, e);
  return [
    [p0, a, d, mid],
    [mid, e, c, p3],
  ];
}
