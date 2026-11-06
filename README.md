9103 Creative Coding

# The Arrival of Springtime in Woldgate

Bringing David Hockney's _Arrival of Spring in Woldgate_ to life on-screen
Nicole Ho 560417630, Kritika Kanoi 560774382, Kasia Pownall 520473568

## Inspiration

// What inspired your team's project? This might include artworks, websites, games, concepts, or specific aspects of the source material. Explain briefly how these inspirations shaped your approach.

- the digital nature of the source artwork felt liike it could easily translate into an living, interactive artwork
- original colour palette used very bright, digital colours not usually seen in physical painting

## Techniques

// What p5.js techniques were implemented in the project and why? Give a short overview of how your code works and the key decisions your team made.

- base drawing used fractals for the trees: each `Tree` grows recursive branches, bent with `bezierVertex()` curves, with clumps of leaf and blossom marks built around the outer branches
- everything is drawn as Hockney-style **marks** over flat colour, using a shared mark kit in `utils.js`: `dash()` (road, bark, bush strokes), `blade()` (tapered grass strokes) and `dab()` (organic blobs drawn with `curveVertex()` Catmull-Rom splines, so leaves have no straight edges)
- a single `lane(along, across)` perspective function places everything on the ground relative to a vanishing point and returns a `scale` for sizing marks, so the composition can be retuned from one `perspective` settings object
- bushes are noise-wobbled blobs softened with a canvas blur (`drawingContext.filter`), with crisp dashes on top
- `randomSeed()` / `noiseSeed()` keep the layout identical on every redraw, so the scene can be repainted as colours change without trees and bushes jumping around
- **time of day:** a 24-hour cycle compressed into 60 seconds (or the real clock) blends between Night, Dusk, Golden Hour and Day colour keyframes; stars fade in at night and twinkle using `noise()` over time
- **colour:** all colours are stored as HSB and blended in OKLab, so transitions between times of day and weather don't pass through muddy greys; weather is layered on top of the time-of-day palette as an offset, sampled from three paintings in the series (dry, overcast, wet)
- **weather:** precomputed Perlin `noise()` arrays act as a timeline for humidity and temperature; rain builds up `moisture`, which dries out faster in daylight, so puddles linger after a shower
- **rain:** wavering bezier raindrops splash on the road and leave wet patches, drawn onto a separate `createGraphics()` layer and multiplied over the road (`blendMode(MULTIPLY)`) so the road texture shows through; one deeper puddle grows and dries with `moisture`
- **performance:** drawing the full scene takes ~250 ms (~90k marks), so it's cached in offscreen `createGraphics()` buffers and repainted in the background using a generator function (`function*` / `yield`) that spreads the work over several frames, then cross-fades in
- **interaction:** hovering over tree leaves or bushes makes nearby marks sway, driven by `noise()` so neighbouring leaves move together, and only that small patch of the canvas is redrawn; clicking a tree or bush sends out a burst of leaf pieces with drag and gravity
- a HUD built in HTML/CSS shows the time, temperature, humidity, moisture and current conditions, updated from the sketch each frame

## Mechanic ownership

// Which team member was responsible for which mechanic, and a brief description of what each mechanic does.

### User Input - Kasia
The user input mechanic makes the painted scene respond to the cursor. Hovering
over tree leaves makes them sway, hovering over a bush makes its marks rustle,
and clicking either throws off a burst of pieces. The original marks move instead
of an effect being drawn over them.

### Perlin noise

- Nicole contributed to setting up the base drawing and adding

### User Input

**Hover:** A `pointermove` listener converts the cursor position into scene
coordinates with `windowToScene()`, which is needed because CSS crops the canvas.
A `LeafSway` object checks whether the cursor is over its target and eases a
shared `strength` value between 0 and 1. `moveLeaf()` then uses `noise()` to shift
and turn marks near the cursor. Nearby marks get similar noise values, so they
move as a patch rather than jittering. One class handles both behaviours: the
tree sway is slow and broad, while the bush rustle uses smaller, faster settings.

**Click:** `mousePressed()` in `sketch.js` calls `handleInputClick()`. `getHit()`
finds the tree or bush under the cursor, and `isPaintedOverBase()` ignores gaps
where only the background shows. Each valid click creates 10-18 `Burst` objects,
sized from the clicked mark and coloured from the live `palette`. Their `update()`
and `display()` methods handle drag, gravity, spin and fading.

#### Main decisions

- **Partial redraws:** Repainting the full scene takes about 250 ms, so only the
  circle around the moving marks is redrawn.
- **Protecting the seeded layout:** Input code avoids p5's `random()`, which would
  change the layout of a scene being repainted across several frames. Bursts use
  `Math.random()` instead.
- **Frame-rate independence:** Motion uses `deltaTime`, capped at 250 ms, so its
  speed stays consistent and a stalled frame doesn't make pieces jump.
- **Separation from other mechanics:** This file reads `palette` but never changes
  the time or weather. It also provides `getRegion()`, which `rain.js` uses to stop
  drops behind leaves.

#### Techniques from class

| Technique | Use in this mechanic |
| --------- | -------------------- |
| Classes, constructors and methods | `LeafSway` and `Burst` |
| Separate `update()` and `display()` methods | Animating each `Burst` |
| Arrays of objects and `for...of` | Tracking and updating burst pieces |
| Nested `for` loops | Filling the leaf coverage grid |
| Perlin noise over time, with offsets | Separate movement patterns for x, y and rotation |
| `Math.cos()`, `Math.sin()` and angles (p5's `cos()` and `sin()` here) | Launching burst pieces in random directions |
| Event listeners | Tracking the cursor |
| `constrain()`, `min()` and `max()` | Limiting sizes, speeds and grid positions |
| `Math.random()` and `floor()` | Burst count, colour and launch values |
| HSB colour | Burst pieces, using stored `[h, s, b]` values |
| Reusable functions and return values | Hit testing and colour helpers |
| Settings stored in named variables | Tuning sway, rustle and burst behaviour |

#### Techniques from outside class

| Technique | Use in this mechanic | Why it was needed |
| --------- | -------------------- | ------------------ |
| `pointermove` event | Tracks the cursor | Registers movement between frames |
| `mousePressed()`, `winMouseX`, `winMouseY` | Handles clicks | Gives window coordinates to convert into scene coordinates |
| `dist()`, `lerp()`, `pow()` and `deltaTime` | Distance, blending, drag and timing | Supports smooth motion |
| Smoothstep (`smoothFalloff()`) | Fades movement away from the cursor | Avoids a hard edge |
| Exponential easing (`approach()`) | Eases strength and patch position | Keeps easing consistent at any frame rate |
| 3D `noise()` with spatial coordinates | Moves nearby marks together | Creates a breeze-like motion |
| Drag and gravity simulation | Moves burst pieces | Makes pieces fly, then fall naturally |
| Ray casting (`pointInPolygon()`) | Tests clicks inside bush outlines | Bushes have irregular shapes |
| `Uint8Array` coverage grid | Stores where leaves are | Makes frequent hover checks fast |
| Array methods: `filter()`, `map()`, `flatMap()`, `some()` | Updates and searches lists | Keeps list handling concise |
| Arrow functions, destructuring and spread syntax | Helpers and copying marks | Moves a mark without changing its resting position |
| `getBoundingClientRect()` and `querySelector()` | Used by `windowToScene()` | Corrects the cursor position for the CSS-cropped canvas |


## AI acknowledgement

// If you used ChatGPT, Claude, DeepSeek, or any other AI tool to help generate code, you must reference it here and explain what it was used for and how the generated code works. This must also be commented in the actual code (e.g. // this code was generated with the help of ChatGPT and does xyz).

## External references

// If you borrowed or were influenced by code found online, in a book, or from any other source, reference it with a link and an explanation. This must also be commented in the code (e.g. // this technique is from www.source-url.com).

- We referenced [this tutorial](https://www.deconbatch.com/2022/10/blog-post_20.html) from deconbatch for drawing organic strokes in the composition.

## Interaction instructions

### Watch
- **Spring arrives:** The trees start bare and fill with leaves over about 24 seconds.
- **The day passes:** One full day lasts 2 minutes, starting at noon. Colours shift
  with the time of day, and stars appear at night.
- **The weather changes:** Showers come and go on their own. Rain leaves wet patches
  on the lane, and a puddle grows and dries out with the moisture level.
- **Conditions:** The on-screen display shows the time, temperature, humidity,
  moisture and current conditions.

### Use the mouse
- **Move over tree leaves:** Nearby leaves sway like a breeze has passed through. Keep
  moving, as they settle about a second after the cursor stops.
- **Move over a bush:** Its marks rustle with a quicker flicker.
- **Click a leaf or bush:** Pieces burst out in matching colours, then flutter down.

Clicking the sky, road, open grass or a bare trunk does nothing. Tree leaves only
respond once they have started to grow, but bushes respond straight away.

### Use the keyboard

| Key | Action |
| --- | ------ |
| `P` | Pause or resume time |
| `→` / `←` | Pause and jump to the next or previous hour (press `P` to resume) |
