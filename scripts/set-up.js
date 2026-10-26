let img;
let numSegments = 100;
let segments = [];
let drawSegments = true;

function preload() {
  img = loadImage('assets/david-hockney-ipad-dh14-18_arrival-of-spring.webp');
}

function setup() {
  createCanvas(img.width, img.height);
  let segmentWidth = img.width / numSegments;
  let segmentHeight = img.height / numSegments;

  for (let segYPos = 0; segYPos < img.height; segYPos += segmentHeight) {
    for (let segXPos = 0; segXPos < img.width; segXPos += segmentWidth) {
      let segmentColour = img.get(segXPos + segmentWidth / 2, segYPos + segmentHeight / 2);
      let segment = new ImageSegment(segXPos, segYPos, segmentWidth, segmentHeight, segmentColour);
      segments.push(segment);
    }
  }
}

function draw() {
  background(0);
  image(img, 0, 0);
  if (drawSegments) {
    for (const segment of segments) {
      segment.draw();
    }
  } else {
    
  }
}

class ImageSegment {

  constructor(srcImgSegXPosInPrm, srcImgSegYPosInPrm, srcImgSegWidthInPrm, srcImgSegHeightInPrm, srcImgSegColourInPrm) {
    this.srcImgSegXPos = srcImgSegXPosInPrm;
    this.srcImgSegYPos = srcImgSegYPosInPrm;
    this.srcImgSegWidth = srcImgSegWidthInPrm;
    this.srcImgSegHeight = srcImgSegHeightInPrm;
    this.srcImgSegColour = srcImgSegColourInPrm;
    this.scale = 1;

    // --- brushstroke properties, randomised once so they stay stable ---
    // brightness of the sampled colour, used to bias the stroke direction
    this.angle = random(-PI / 4, PI / 4) + (brightness(color(this.srcImgSegColour)) > 50 ? 0 : PI / 6);
    this.lengthFactor = random(1.4, 2.2);   // strokes are longer than they are wide
    this.thicknessFactor = random(0.8, 1.2);
    this.curve = random(-0.4, 0.4);         // how much the stroke bends
    this.bristles = [];
    // This is where we change the number of strokes/ density
    for (let i = 0; i < 4; i++) {
      this.bristles.push({
        offset: random(-0.4, 0.4),          // sideways position across the stroke
        shade: random(-25, 25),             // slight colour variation per bristle
        lenVar: random(0.85, 1.1)
      });
    }
  }

  draw() {
    // centre of the original grid cell
    let cx = this.srcImgSegXPos + this.srcImgSegWidth / 2;
    let cy = this.srcImgSegYPos + this.srcImgSegHeight / 2;

    let len = this.srcImgSegWidth * this.lengthFactor * this.scale;
    let thick = this.srcImgSegHeight * this.thicknessFactor * this.scale;

    let c = color(this.srcImgSegColour);

    push();
    translate(cx, cy);
    rotate(this.angle);
    noFill();
    strokeCap(ROUND);

    // draw several overlapping bristle lines to build up a stroke
    for (const b of this.bristles) {
      let r = constrain(red(c) + b.shade, 0, 255);
      let g = constrain(green(c) + b.shade, 0, 255);
      let bl = constrain(blue(c) + b.shade, 0, 255);
      stroke(r, g, bl, 220);
      // This is where we change the thickness of the brushstrokes
      strokeWeight(max(2, thick / 3));

      let y = b.offset * thick;
      let half = (len * b.lenVar) / 2;
      let bend = this.curve * thick;

      // a gently curved line from one end of the stroke to the other
      beginShape();
      curveVertex(-half, y);
      curveVertex(-half, y);
      curveVertex(0, y + bend);
      curveVertex(half, y);
      curveVertex(half, y);
      endShape();
    }
    pop();
  }
}