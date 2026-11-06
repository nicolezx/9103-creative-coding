9103 Creative Coding

# The Arrival of Springtime in Woldgate

Bringing David Hockney's _Arrival of Spring in Woldgate_ to life on-screen

Nicole Ho 560417630, Kritika Kanoi 560774382, Kasia Pownall 520473568

## Inspiration

Our project was inspired by an image found in the book _Hockney – Van Gogh: The Joy of Nature_ of _The Arrival of Spring in Woldgate, East Yorkshire, 18 December 2011_ from David Hockney's collection _Arrival of Spring in Woldgate_. The series of digital illustrations completed on an iPad stood out to us as its separate components and texture felt natural to expand into an interactive digital artwork.

The broader series shows the passage of an entire season in the English countryside, depicting different scenes in various scales (some are more close-up), but one view that was recurring was this view of the road that was depicted in our original reference.

As the series shows a transition of seasons, there is a noticeable shift in colour tone from cool to warmer, and different times of day and weather conditions are represented too. In [our reference](https://geistmc.com/our-artists/david-hockney/arrival-of-spring-in-woldgate/18-december-2011-large/) it’s raining and there’s a large puddle, and the top right and bottom right also depict puddles in different conditions.

We were inspired to represent the various weather conditions and tones of the series in a generative interactive digital artwork.

## Mechanic ownership

The base drawing was procedurally created with the help of Claude. Each layer of the drawing (sky, road, grass (background + foreground), stars, bushes and trees) are drawn on separate layers and are driven by variables which allowed us to finely tune individual details to match our reference paintings.

### Perlin noise - Nicole

Two separate noise arrays control temperature and humidity levels, which fluctuate according to the noise curve.

**Humidity:** When humidity levels cross a certain threshold, rain starts to fall in the scene. variable across a certain threshold, and rainfall adds to a `moisture` variable, which decreases as rainfall slows.

**Puddle:** Heavy rainfall creates a puddle in the scene. The `moisture` and `humidity` variables together determine how fast the puddle dries up, which is faster during daylight than at night. Half of the wet patches (`puddleShare`) are concentrated around a single `puddleSpot`, a random position in the foreground of the road, so their overlapping layers build up into one deep puddle. Once per virtual day, when the scene is dry, `updatePuddleSpot()` generates a new position for variation day to day.

**Weather:** we sampled three daytime palettes from the series: dry (_31 May no. 2_), overcast (_17 April_) and wet (_18 December_). Each frame, `getWeatherOffset()` blends between them by `rain` (0 = dry, 0.5 = overcast, 1 = wet) and works out how far that blend sits from the dry palette for each element (sky, grass, road, leaves, etc). `resolvePalette()` then adds this difference on top of the time-of-day colours, scaled by `getDaylight()`.

All of our reference paintings are set during daytime, so the weather tint fades out at night instead of greying a night sky. Colour blending happens in OKLab, so colours shift smoothly without passing through greys. Rain also dims the stars (`starColour()`).

### User Input - Kasia

The user input mechanic makes the painted scene respond to the cursor. Hovering
over tree leaves makes them sway, hovering over a bush makes its marks rustle,
and clicking either throws off a burst of pieces. The original marks move instead
of an effect being drawn over them.

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

## Techniques

// What p5.js techniques were implemented in the project and why? Give a short overview of how your code works and the key decisions your team made.

- **time of day:** a 24-hour cycle compressed into 60 seconds (or the real clock) blends between Night, Dusk, Golden Hour and Day colour keyframes; stars fade in at night and twinkle using `noise()` over time
- **colour:** all colours are stored as HSB and blended in OKLab, so transitions between times of day and weather don't pass through muddy greys; weather is layered on top of the time-of-day palette as an offset, sampled from three paintings in the series (dry, overcast, wet)
- **weather:** precomputed Perlin `noise()` arrays act as a timeline for humidity and temperature; rain builds up `moisture`, which dries out faster in daylight, so puddles linger after a shower
- **rain:** wavering bezier raindrops splash on the road and leave wet patches, drawn onto a separate `createGraphics()` layer and multiplied over the road (`blendMode(MULTIPLY)`) so the road texture shows through; one deeper puddle grows and dries with `moisture`
- **performance:** drawing the full scene takes ~250 ms (~90k marks), so it's cached in offscreen `createGraphics()` buffers and repainted in the background using a generator function (`function*` / `yield`) that spreads the work over several frames, then cross-fades in
- **interaction:** hovering over tree leaves or bushes makes nearby marks sway, driven by `noise()` so neighbouring leaves move together, and only that small patch of the canvas is redrawn; clicking a tree or bush sends out a burst of leaf pieces with drag and gravity
- a HUD built in HTML/CSS shows the time, temperature, humidity, moisture and current conditions, updated from the sketch each frame

#### Base drawing

| Technique                                                            | Function                                                                                                               |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Recursion (fractals)                                                 | Each `Tree` grows branches that split into smaller branches, with leaf and blossom clumps around the outer ones        |
| `bezierVertex()` curves                                              | Bending each branch so trees look hand-drawn rather than straight                                                      |
| Reusable mark functions (`dash()`, `blade()`, `dab()` in `utils.js`) | Hockney-style marks over flat colour: dashes for the road, bark and bushes, tapered blades for grass, blobs for leaves |
| Catmull-Rom curves (drawn as canvas `bezierCurveTo()`)               | `dab()` leaves have soft, irregular outlines with no straight edges                                                    |
| Perspective function (`lane(along, across)`)                         | Places everything on the ground relative to the vanishing point and scales marks smaller with distance                 |
| Perlin `noise()`                                                     | Wobbling bush outlines and the road edges, so nothing is perfectly straight                                            |
| Canvas blur (`drawingContext.filter`)                                | Softening each bush's fill, with crisp dashes drawn on top                                                             |
| `randomSeed()` and `noiseSeed()`                                     | Keeping the layout identical on every redraw, so trees and bushes don't jump when the colours repaint                  |
| Classes, constructors and methods                                    | `Tree` and `Bush` store their marks once, then draw from that data                                                     |
| HSB colour and `jitter()`                                            | Small per-mark colour variation around the shared `palette`                                                            |

#### User input

##### Techniques from class

| Technique                                                             | Function                                         |
| --------------------------------------------------------------------- | ------------------------------------------------ |
| Classes, constructors and methods                                     | `LeafSway` and `Burst`                           |
| Separate `update()` and `display()` methods                           | Animating each `Burst`                           |
| Arrays of objects and `for...of`                                      | Tracking and updating burst pieces               |
| Nested `for` loops                                                    | Filling the leaf coverage grid                   |
| Perlin noise over time, with offsets                                  | Separate movement patterns for x, y and rotation |
| `Math.cos()`, `Math.sin()` and angles (p5's `cos()` and `sin()` here) | Launching burst pieces in random directions      |
| Event listeners                                                       | Tracking the cursor                              |
| `constrain()`, `min()` and `max()`                                    | Limiting sizes, speeds and grid positions        |
| `Math.random()` and `floor()`                                         | Burst count, colour and launch values            |
| HSB colour                                                            | Burst pieces, using stored `[h, s, b]` values    |
| Reusable functions and return values                                  | Hit testing and colour helpers                   |
| Settings stored in named variables                                    | Tuning sway, rustle and burst behaviour          |

##### Techniques from outside class

| Technique                                                 | Function                            | Why it was needed                                          |
| --------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------- |
| `pointermove` event                                       | Tracks the cursor                   | Registers movement between frames                          |
| `mousePressed()`, `winMouseX`, `winMouseY`                | Handles clicks                      | Gives window coordinates to convert into scene coordinates |
| `dist()`, `lerp()`, `pow()` and `deltaTime`               | Distance, blending, drag and timing | Supports smooth motion                                     |
| Smoothstep (`smoothFalloff()`)                            | Fades movement away from the cursor | Avoids a hard edge                                         |
| Exponential easing (`approach()`)                         | Eases strength and patch position   | Keeps easing consistent at any frame rate                  |
| 3D `noise()` with spatial coordinates                     | Moves nearby marks together         | Creates a breeze-like motion                               |
| Drag and gravity simulation                               | Moves burst pieces                  | Makes pieces fly, then fall naturally                      |
| Ray casting (`pointInPolygon()`)                          | Tests clicks inside bush outlines   | Bushes have irregular shapes                               |
| `Uint8Array` coverage grid                                | Stores where leaves are             | Makes frequent hover checks fast                           |
| Array methods: `filter()`, `map()`, `flatMap()`, `some()` | Updates and searches lists          | Keeps list handling concise                                |
| Arrow functions, destructuring and spread syntax          | Helpers and copying marks           | Moves a mark without changing its resting position         |
| `getBoundingClientRect()` and `querySelector()`           | Used by `windowToScene()`           | Corrects the cursor position for the CSS-cropped canvas    |

#### Perlin noise

##### Techniques from class

| Technique                                               | Function                                                                      |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Perlin `noise()` sampled into an array with a step size | `makeNoiseArray()` builds the humidity and temperature timelines              |
| `noiseSeed()`                                           | A separate seed per array, so humidity and temperature don't move in step     |
| `for` loops and arrays                                  | Filling the noise arrays one sample per step                                  |
| Classes, constructors and methods                       | `Raindrop`, `Splash` and `WetPatch`                                           |
| Separate `update()` and `draw()` methods                | Animating each drop, splash and wet patch                                     |
| Arrays of objects and `for...of`                        | Tracking and updating everything currently raining                            |
| `constrain()`                                           | Keeping `rain` and `moisture` between 0 and 1                                 |
| `lerp()`                                                | Blending between noise samples, and spreading the puddle as `moisture` rises  |
| `Math.cos()` and `Math.sin()`                           | The daily temperature curve, coldest around 3am and warmest around 3pm        |
| `millis()` instead of `frameCount`                      | Weather follows the virtual clock, so it runs at the same speed on any device |
| `keyPressed()`                                          | The W key switches the weather on and off                                     |
| `Math.random()`                                         | Where drops land and where the puddle forms                                   |
| HSB colour                                              | Weather palettes stored as `[h, s, b]` values                                 |
| Settings stored in named variables                      | Tuning the weather and rain in `weatherSettings` and `rainSettings`           |

##### Techniques from outside class

| Technique                                                  | Function                                              | Why it was needed                                                              |
| ---------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| Min–max normalisation (`Math.min()`, `Math.max()`)         | Stretches each noise array to fill 0–1                | Raw `noise()` mostly sits between 0.3 and 0.7, so thresholds were hard to tune |
| Interpolating between samples, with `%` to wrap            | `sampleNoise()` reads the array as a looping timeline | Values glide instead of jumping once an hour, and never run out                |
| Fill-and-drain accumulator                                 | `moisture` rises with rain and drains when dry        | Gives the weather a memory, so puddles linger after a shower                   |
| Time delta with jump detection                             | `virtualHoursSinceLastFrame()`                        | Pausing freezes the weather, and skipping hours doesn't fast-forward it        |
| `deltaTime`, capped at 250 ms                              | Moves drops and fades patches                         | Keeps speed consistent, and a stalled frame doesn't teleport drops             |
| `createGraphics()` layer with `blendMode(MULTIPLY)`        | Wet patches are drawn on their own layer              | Darkens the road so its texture shows through, however many patches overlap    |
| `drawingContext` `clip()` and `clearRect()`                | Clears and redraws only the box around the patches    | Avoids redrawing a full-canvas layer every frame                               |
| Native canvas `bezierCurveTo()`                            | Wavering drops and blobby patch outlines              | Faster than p5 shapes for hundreds of marks per frame                          |
| OKLab colour blending (`Math.cbrt()`)                      | `getWeatherOffset()` blends dry → overcast → wet      | Colours shift smoothly without passing through muddy greys                     |
| Array methods: `filter()` and `splice()`                   | Removes finished drops and caps the number of patches | Keeps lists short so the frame rate holds during heavy rain                    |
| `querySelector()`, `textContent` and CSS custom properties | `updateHud()` and `setMeter()`                        | Shows temperature, humidity and moisture as text and meters                    |

## AI acknowledgement

// If you used ChatGPT, Claude, DeepSeek, or any other AI tool to help generate code, you must reference it here and explain what it was used for and how the generated code works. This must also be commented in the actual code (e.g. // this code was generated with the help of ChatGPT and does xyz).

## External references

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
