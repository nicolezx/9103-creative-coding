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

### Perlin noise

- Nicole contributed to setting up the base drawing and adding

## AI acknowledgement

// If you used ChatGPT, Claude, DeepSeek, or any other AI tool to help generate code, you must reference it here and explain what it was used for and how the generated code works. This must also be commented in the actual code (e.g. // this code was generated with the help of ChatGPT and does xyz).

## External references

// If you borrowed or were influenced by code found online, in a book, or from any other source, reference it with a link and an explanation. This must also be commented in the code (e.g. // this technique is from www.source-url.com).

- We referenced [this tutorial](https://www.deconbatch.com/2022/10/blog-post_20.html) from deconbatch for drawing organic strokes in the composition.

## Interaction instructions

// How does someone experience your work? E.g., "move the mouse slowly over the screen," "click play and wait for audio to start," "use arrow keys to move."
