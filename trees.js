class Tree {
  constructor(x, y, height, kind, side) {
    this.far = height < 70;
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
    const branchDepth = height > 200 ? 5 : height > 90 ? 4 : 3;

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
    this.trunkTop = trunkTop;
    this.baseWidth = baseWidth;
    this.branches = branches;
  }
  // Recursive branch: returns a node tree (kept as data so it can sway later)
  makeBranch(x, y, angle, length, weight, depth) {
    const endX = x + cos(angle) * length;
    const endY = y + sin(angle) * length;
    const node = { x, y, endX, endY, weight, depth, length, children: [] };
    if (depth > 0) {
      const childCount = random([2, 2, 3]);
      for (let i = 0; i < childCount; i++) {
        const childAngle = lerp(angle + random(-0.65, 0.65), -HALF_PI, 0.18); // slight upward pull
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
    const foliageColours =
      this.kind === "blossom"
        ? [palette.blossom, palette.blossomLight]
        : [palette.leaf, palette.leafLight];
    const topWidth = this.baseWidth * 0.6;

    // trunk: tapered quad + bark dashes
    noStroke();
    fill(jitter(palette.trunk, 4, 6, 4));
    quad(
      this.x - this.baseWidth / 2,
      this.y,
      this.x + this.baseWidth / 2,
      this.y,
      this.trunkTop.x + topWidth / 2,
      this.trunkTop.y,
      this.trunkTop.x - topWidth / 2,
      this.trunkTop.y,
    );
    for (let i = 0; i < this.height * 0.4; i++) {
      const heightFraction = 1;
      const barkX =
        lerp(this.x, this.trunkTop.x, heightFraction) +
        random(-0.4, 0.4) * lerp(this.baseWidth, topWidth, heightFraction);
      dash(
        barkX,
        lerp(this.y, this.trunkTop.y, heightFraction),
        -HALF_PI + random(-0.1, 0.1),
        (random(4, 10) * this.baseWidth) / 10 + 2,
        max(1, this.baseWidth * 0.12),
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
    this.branches.forEach(drawBranch);

    // leaf / blossom clusters: base pass then light pass
    const sizeScale = min(1, this.height / 400);
    const marksPerAnchor = this.kind === "blossom" ? 14 : 10;
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
    for (let i = 0; i < this.height * 4; i++) {
      const angle = random(TWO_PI);
      const radius = sqrt(random()); // sqrt spreads points evenly across the disc
      const wobble = 0.8 + 0.4 * noise(cos(angle) + this.x * 0.1, sin(angle));
      dash(
        this.x + cos(angle) * radius * crownRadiusX * wobble,
        crownY + sin(angle) * radius * crownRadiusY * wobble,
        random(TWO_PI),
        random(2, 5),
        random(1.5, 3),
        jitter(
          i < this.height * 2 ? crownColours[0] : crownColours[1],
          10,
          10,
          12,
        ),
      );
    }
  }
}
