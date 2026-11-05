# AGENTS.md — Arrival of Spring (IDEA9103 Creative Coding)

Shared context for everyone on the team **and** any AI coding agent (Claude Code, Cursor, Copilot, etc.) working in this repo. Read this before writing code. If something here is out of date, fix it in the same PR as the change that made it stale.

> Claude Code users: add a `CLAUDE.md` containing just `@AGENTS.md` so it loads automatically.

**Agents: keep this file current.** Whenever you make a structural change (new/renamed/moved files, public functions, data structures, colour pipeline, render order) or add a feature or debug key, update the relevant sections here **in the same change**, including §0 (status), §6 (files) and §8 (to-dos). Don't wait to be asked.

---

## 0. Current status

What exists today vs. what the rest of this doc describes as the target design. Sections below are marked **(built)**, **(partial)** or **(planned)**.

| Area                    | Status  | Where / notes                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Base scene              | built   | `sketch.js`: sky gradient, night stars (`drawStars()`, small twinkling sparkles; `starSettings`), road + tyre tracks, grass verges, flower dots, bushes, trees                                                                                                                                                                                                                                                                                  |
| Perspective (`lane()`)  | built   | `utils.js`; tuned via `perspective` in `sketch.js`                                                                                                                                                                                                                                                                                                                       |
| Trees                   | partial | `trees.js` `Tree`: recursive bending branches + stored leaf/blossom dab clusters (`buildFoliage()`). Rebuilt from the seed on each repaint; far-tree crown written (`drawFar()`) but `this.far` still disabled; no sway/shake yet                                                                                                                                        |
| Bushes                  | built   | `bushes.js` `Bush`, placed by `drawBushes()` in `sketch.js`                                                                                                                                                                                                                                                                                                              |
| Time of day             | built   | `time.js`: 60 s virtual day (or real clock), 4 colour keyframes, pause                                                                                                                                                                                                                                                                                                   |
| Colour pipeline         | built   | `colors.js` data + `time.js` `resolvePalette()`: time keyframes + weather offset → `palette.*`                                                                                                                                                                                                                                                                           |
| Weather simulation      | partial | `noise.js`: precomputed Perlin arrays → `weather.rain`, `weather.moisture`, `weather.temperature` (W toggles on/off). Rain drives the weather palette and `rain.js`                                                                                                                                                                                       |
| Rain + puddle           | partial | `rain.js`: wavering bezier drops; drops landing on the lane leave blobby ripples + blobby wet patches (none off the lane), multiplied over the road via `puddleLayer` so its texture shows through; half collect at a foreground puddle spot (moves at most once a virtual day, at a random time, once the lane is dry: `updatePuddleSpot()`), so one deep puddle forms, kept `puddleEdgeMargin` inside the road edges (`keepOffEdges()`); its size stops growing past `puddleMaxMoisture`, so very heavy rain deepens it instead, growing and drying with `moisture`. No reflection, muddy rim or cached layer yet |
| Moon phases             | built   | `moon.js`: organic wobbled disc (noise-perturbed polygon, stable shape) with phase-correct lit area (arc + bezier terminator) and canvas blur; arcs left→right 6 pm–6 am at a low sinusoidal arc; phase advances one of 8 steps at each midnight; drawn as a live patch behind trees via `redrawMoonArea()` in `sketch.js`; settings in `moonSettings`; public API: `getMoonPatch()`, `getMoonPhase()` |
| Interaction / creatures | partial | `user-input.js`: leaf sway on hover (`LeafSway`, trees only) + click bursts/rings (`Burst`). No tree shake, reaction table or creatures yet                                                                                                                                                                                                                              |
| Render layers / caching | partial | `sketch.js`: whole scene cached in offscreen buffers, repainted in the background when the palette drifts, cross-faded in; hover patch redrawn live. Runs at `FRAME_RATE` 24. No puddle/rain/atmosphere layers yet                                                                                                                                                       |
| HUD                     | partial | `index.html` + `style.css` + `updateHud()` in `sketch.js`: time, temperature, humidity and moisture show text + a progress meter (`setMeter()`; time = midnight → midnight, temperature = `temperatureRange` 0–20 °C, humidity / moisture = 0–100 %), read from `weather` (`noise.js`). Conditions shows `getConditions()` (Clear / Cloudy / Light drizzle / Heavy rain) |

---

## 1. What we're building

An interactive p5.js adaptation of David Hockney's _The Arrival of Spring in Woldgate_ series. One season (spring), one scene: a country lane receding to a vanishing point, with trees, grass verges and sky, all drawn as **marks** (dashes, dabs, scribbles) over flat colour, using a palette sampled from the series.

Three layers sit on top of the base scene:

1. **Weather** — Perlin noise drives rain and temperature. Rain builds up `moisture`, which feeds a reflective puddle that grows and slowly drains.
2. **Time of day** — an automatic 24-hour cycle compressed into a fixed duration (currently 60 s), controlling colour, light and visibility.
3. **Interaction** — clicking a tree shakes its branches and triggers an animation (birds, ducks, falling petals) chosen by current conditions.

Weather and time must each work with the other switched off.

---

## 2. The one architectural rule

**Inputs drive state → state resolves into one shared `env` description → the scene draws only from `env`.**

```
Clock ──► TimeOfDay ─┐
                     ├─► Environment (palette + light) ──► Scene components ──► canvas
Noise ──► Weather ───┘                                          ▲
Pointer ──► Interaction ────────────────────────────────────────┘
```

- No scene element knows whether it's raining or what time it is. It only asks the environment things like "what colour is foliage right now, and how strong is the light?"
- Time and weather **never touch the scene directly**. They only meet inside `Environment`. When either is switched off it reports a neutral value (noon / dry), so the other keeps working.
- Interaction **bypasses** the Environment: it acts on scene objects directly (shake this tree, spawn these ducks) and reads `env` only to choose which reaction to play.
- The **one deliberate cross-link**: daylight speeds up how fast `moisture` drains.

**Today:** there is no `env.js` / `Environment` object yet. The meeting point is `resolvePalette()` in `time.js`, called once per frame from `draw()` in `sketch.js`; the scene reads only the resulting `palette.*` colours. Keep that separation when `env.js` arrives.

If a change needs to break one of these rules, raise it with the team first. Don't quietly add a shortcut.

---

## 3. Layer reference

### Weather (partial — `noise.js`)

| Value         | Range                         | Drives                                                                         |
| ------------- | ----------------------------- | ------------------------------------------------------------------------------ |
| `rain`        | 0 → 1                         | Raindrop count, puddle ripples, and the weather palette (dry → overcast → wet) |
| `temperature` | ~0–20 °C (`temperatureRange`) | HUD meter today; what else it drives is TBD — agree as a team                  |
| `moisture`    | 0 → 1                         | Puddle size, darker wet ground. Builds while raining, drains when dry          |

- `moisture` is the layer's memory: the puddle follows moisture, not rain, so it lingers after a shower.
- **How it works (`noise.js`):** `setupWeather()` (in `setup()`) builds two noise arrays, each with its own noise seed, read as timelines at one sample per virtual hour (`sampleNoise()` blends neighbours and loops). `updateWeather()` runs first in `draw()`:
  - `humidity` array → `rain` = how far humidity is above `rainThreshold`, rescaled to 0–1, so there are dry spells between showers.
  - `moisture` += rain × `moistureFill`, −= drain × (1 − rain), per virtual hour; drain is multiplied by up to `daylightDrain` in daylight (the one deliberate time → weather link).
  - `temperature` = `meanTemperature` + daily cosine (coldest ~3am, warmest ~3pm) + noise drift (slower `temperatureStep`, warm/cold spells over days) − rain cooling.
  - Weather time comes from the change in `getDayFraction()` between frames, so pause freezes it; jumps over 1 h (T key) are skipped.
  - The arrays are built once because scene drawing relies on `noiseSeed(seed)`; never call `noiseSeed()` from per-frame weather code.
  - `getConditions()` → HUD label from humidity + moisture: rain above `rainThreshold` is Heavy rain only once humidity > `heavyHumidity` **and** the ground is wet (`heavyMoisture`), otherwise Light drizzle; dry but humid (`cloudyHumidity`) or still damp after a shower (`cloudyMoisture`) is Cloudy; otherwise Clear.
- Off (W key) → `rain = 0`, mean temperature, moisture drains, so the time cycle is unaffected. All settings are in `weatherSettings`.
- **Removed:** clouds, mist (and wind, unless re-agreed). Don't reintroduce them without a team decision. Older docs that mention `cloud` or `wetness` are out of date — `wetness` was renamed to `moisture`. (`palette.cloud` still exists as a derived sky tint but nothing draws clouds.)

### Time of day (built — `time.js`)

- `getDayFraction()` returns 0 → 1 across the day (0 = midnight, 0.25 = 6am, 0.5 = noon, 0.75 = 6pm). It's computed from `millis()` minus time spent paused, so pausing freezes it and resuming continues from the same moment. Day length and start hour live in `clock` in `sketch.js`.
- `useRealClock` (T key) switches to the system wall clock.
- `stepHour(±1)` (→ / ← keys) pauses and moves the paused time to the next / previous full hour; `togglePause()` resumes from wherever the paused time is. Weather advances by a forward jump shorter than 1 h (e.g. 3:20 → 4:00) and ignores longer or backward ones (`virtualHoursSinceLastFrame()` in noise.js).
- `_STOPS` maps hours to colour keyframes: midnight → Night, 6:00 → Dusk, 9:00 → GoldenHour, noon → Day, then mirrored. Transitions are smoothstepped.
- `getDaylight()` → 0 (night) to 1 (noon), from `_DAYLIGHT` per keyframe, eased the same way as the colours.
- `getStarVisibility()` → 0 to 1. Morning: full until `_STARS_FADE_OUT.start` (4:00), smoothstepped to 0 by its `end` (5:00). From noon: `_STARS` per keyframe (Night 1, Dusk 0.7, GoldenHour/Day 0) via `_blendKeyframeValues()` (shared with `getDaylight()`), so stars return 15:00 → 18:00 and are full at midnight. Separate from daylight, which starts rising right after midnight.
- `getTimeOfDay()` formats the HUD clock.
- **Planned:** `sunAltitude`, `sunSide` (−1 morning / +1 evening) for shadows and lighting.

### Interaction (partial — `user-input.js`; planned — `actors.js`)

**Built (`user-input.js`):**

- **Leaf sway (hover, trees only, no overlay, no colour change):** the tree's own leaf marks move. (1) Every `pointermove` calls `leafSway.noticeCursor()`, which checks the cursor against `leafCoverage`, a coarse grid (`leafCoverageCellSize`) of where leaf marks actually are, rebuilt with the hit areas each repaint, so sky between branches doesn't count. (2) Once per frame `getSwayAreas()` → `LeafSway.update()` eases one shared `strength` (0 still → 1 full) with `approach()`: up over `swayFadeInTime` when the cursor arrives on leaves, down over `swayFadeOutTime` once it has rested for `swayCalmDelay` or left the leaves, so a resting cursor calms to still in about 1 s. The patch centre trails the cursor (`swayFollowTime`). (3) `Tree.drawLeaves()` passes each leaf through `swayLeaf()`: within `swayRadius` (soft `smoothFalloff`), it shifts by up to `swayDistance` leaf widths and turns by up to `swayAngle`, following p5 `noise()` over space (`swayPatchSize`) and time (`swaySpeed`), so neighbouring leaves move together. Everything is scaled by `strength`, so leaves return exactly to rest. Each leaf keeps its outline while moving via `shapeSeed` (see `dab()`). (4) Only that patch is redrawn; nothing once still. `swayLeaf()` must never call p5's `random()` (it runs mid-draw); `noise()` is fine.
- **Bush rustle (hover, bushes only):** a second `LeafSway` (`bushRustle`, settings `rustle*` at the top of `user-input.js`) runs the same steps on a bush's crisp marks: `Bush.drawMarks()` passes each mark through `rustleBushMark()`. Tuned quicker and smaller than the tree sway (small `rustlePatchSize`, fast `rustleSpeed`, more turn than shift) so it reads as a flicker. The blurred mass doesn't move. Starts when the cursor is inside a bush's outline and not on tree leaves (`isOverBush()`). `LeafSway` takes a settings object + an `isOverTarget(x, y)` test, and tracks its own biggest mark (`setBiggestMark()`) to size the redraw circle.
- **Click:** `handleInputClick()` only reacts when the click lands on a tree leaf mark or inside a bush's outline (`getRegion()`) **and** a bush or tree is actually painted at that pixel (`isPaintedOverBase()` in sketch.js compares the cached picture with its base layer, so sky showing between leaves never counts). Nothing happens on sky, road, open grass or bare trunk: a ring plus `Burst` pieces (dabs with drag + gravity), coloured like the marks clicked (`burstColoursByRegion`: trees = `palette.bush` / `leaf` / `leafLight`, the foliage passes; bushes = `palette.bush` ±10 brightness). Pieces are sized from the stroke clicked: `getHit()` returns the leaf under the cursor (or the nearest bush mark), and piece size = its length × `burstPieceSize[region]`, varied ±30% per piece, then clamped to `burstPieceMinSize`–`burstPieceMaxSize` px. The ring code still has a flattened-ripple variant for `water`, unused until the puddle exists.
- **Region lookup (clicks):** `getRegion()` (= `getHit().region`; `getHit()` also returns the mark hit) → `tree` (on a leaf mark: `leafCoverage` grid, then `findLeafAt()` checks single leaves) / `trunk` / `bush` (inside `bush.outline`, `pointInPolygon()`) / `verge` / `water` / `track` / `sky`. Open grass outside a bush is `verge`; the tyre ruts count as `water` (until the puddle exists).
- **Hit areas:** `finishRebuild()` (sketch.js) calls `registerHitAreas()` with the bushes/trees it painted; trees = leaf marks + bounds + trunk box (`treeHitArea`, used for clicks) plus `leafCoverage` (used for hover and as a quick pre-check for clicks), bushes = the `Bush` blob's own outline (clicks and rustle).
- **Cursor mapping:** `windowToScene()` (utils.js) converts window px to scene px, accounting for the CSS `object-fit: cover` crop (p5's `mouseX` doesn't). The cursor lives in `cursorScenePosition`.
- Pointer moves are handled in a `pointermove` listener, so touches register along the cursor's path between frames.
- Input code must not call p5's `random()` (use `randomBetween()` / `Math.random`, or `hash01()` for repeatable values): the scene repaints across several frames from one seeded `random()` stream, and any call in between would change the layout.

**Planned:**

- Click a tree → `shake()` sets an amplitude that decays over ~1 s. Hover → light rustle.
- A **reaction table** decides what happens. First row whose condition passes and isn't cooling down wins:

| Reaction             | Condition                      | Cooldown |
| -------------------- | ------------------------------ | -------- |
| Ducks cross the lane | `moisture > 0.35` and daylight | 8 s      |
| Birds fly out        | daylight and `rain < 0.4`      | 1.5 s    |
| Petals / leaves fall | fallback, always               | none     |
| Owl or bats          | night                          | TBD      |

- Every spawned creature implements the same interface: `update(dt, env)`, `draw(g, palette)`, `done`. **Adding a behaviour = adding a row to the table**, not new branching logic elsewhere.

---

## 4. Colour & light (built)

**Colour format:** HSB everywhere. `setup()` sets `colorMode(HSB, 360, 100, 100, 1)` and `mixRGB()` restores exactly that after its RGB blend. Stored colours are plain `[h, s, b]` arrays (h 0–360, s/b 0–100) with a `// #RRGGBB` comment for editor previews — keep the comment in sync when editing a value. Blending happens in **OKLab** inside `time.js` (no hue-wraparound or grey midpoints); don't blend with `lerpColor` in HSB mode. p5 `color()` objects are only created at the last step.

Colour is built in stages — never store a palette per weather × time combination:

1. **Time:** `TIME_KEYFRAMES` (Day, GoldenHour, Dusk, Night) → blend the two nearest by time of day (`getTimeBase()`). The Day column _is_ the dry weather palette.
2. **Weather:** `WEATHER_SETS` (dry, overcast, wet; one reference painting each, never mix roles across paintings) → blend by `rain`, take the difference from dry (`getWeatherOffset()`), and add it on top, scaled by daylight (the references are all daytime, so weather fades out at night).
3. Resolve one base colour per **role** (`sky`, `bush`, `trunk`, `road`, `rut`, `grass`, `leaf`, `flower`), then expand into the named `palette.*` keys the drawing code uses (`skyTop`, `skyLow`, `grassDark`, `track`, `blossom`, …) with light/dark versions via OKLab lightness shifts (`resolvePalette()`).
4. Marks add small per-mark variation with `jitter()` (± hue/sat/brightness). **Planned:** per-mark variant swatches — see the `VARIANTS` comments in `colors.js` and `resolvePalette()`.

Current data: `WEATHER_SETS` are sampled from paintings (dry = 31 May no. 2, overcast = 17 April, wet = 18 December). GoldenHour / Dusk / Night keyframes are invented placeholders (no night references exist in the series); the `leaf` row reuses grass colours outside Day.

Don't hard-code colours in scene code — always go through `palette`.

**Stars (built):** `palette.star` is set in `draw()` by `starColour()` (sketch.js): `starSettings.colour` with alpha = visibility: `getStarVisibility()` (time.js, squared) and dimmed by rain (`rainDim`, below 1 so a night shower never hides them completely). The alpha lives in the palette so `paletteDrifted()` (which also compares alpha) repaints the cache as stars fade. `buildStars()` places small crosses on a jittered grid (one per cell, wandering `starSettings.scatter` of the cell, so they spread evenly) with `hash01()`, not `random()`, so the seeded layout of the rest of the scene is unchanged, and stores them (`sceneStars`, with their colour fixed at paint time) so `drawTwinkle()` and `redrawArea()` can redraw them; `drawStars(stars, area)` → `drawStarCross()` draws each as a cross of two `dash()` marks plus two shorter, thinner diagonals (`starSettings.diagonalLength`). Stars don't move on hover. Stars are painted **after** the base snapshot, so `buffers.*.base` is starless sky.

**Twinkle (built):** `twinkle(star)` multiplies each star's opacity by a value wandering through `starSettings.twinkleRange`, from p5 `noise()` over time (`twinkleSpeed`, per-star `twinkleSeed`); it returns 1 while the cache is painted (`swayPaused`). Each frame `drawTwinkle()` (in `draw()`, right after the picture, before hover patches) copies each star's small box from `current.base` back onto the canvas and redraws the star at its current twinkle. Only "open" stars twinkle: `snapshotStarBoxes()` saves each box right after the stars are painted and `findOpenStars()` compares it at the end of `sceneSteps()`, so a star with any bush/tree over it stays static (restoring its box would erase that cover).

**Planned light object:** `ambient`, `shadowAlpha`, `starAlpha` (today: `palette.star` alpha), `visibility`, `sunAltitude`, `sunSide`. Today only `getDaylight()` exists.

---

## 5. Drawing conventions

- **Everything is a filled shape + a field of marks**, drawn sky first, then far → near. Current order (in `sceneSteps()`, painted into the cache; `draw()` then copies it and adds the hover patch): sky → ground base coat → road → grass → bushes → trees → rain layer (wet patches, splashes, drops; `updateRain()`, live every frame) → input overlay (rings, bursts; `updateInputElements()`). Hover doesn't draw: it moves tree leaves as they're drawn (`swayLeaf()`).
- **Perspective:** all ground placement goes through `lane(along, across)` (`along`: 0 = viewer's feet, 1 = vanishing point; `across`: 0 = left road edge, 1 = right; outside 0–1 = verges). It returns `{ x, y, scale }`, where `scale` sizes marks. Changing the composition means changing the `perspective` settings (horizon, vanishing point, road width, compression, curve, zoom) — never scattering new coordinates.
- **Mark counts:** wrap counts in `marks(n)` so density holds at any canvas size.
- **Mark kit (`utils.js`):** use the shared marks rather than ad-hoc `line()` / `ellipse()` calls.

  | Mark     | Function  | Shape                                                                                                                                                                                                                                            | For                                        |
  | -------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
  | Dash     | `dash()`  | straight, round ends                                                                                                                                                                                                                             | road, bark, bush marks                     |
  | Blade    | `blade()` | tapered, slightly bent stroke                                                                                                                                                                                                                    | grass clumps                               |
  | Dab      | `dab()`   | organic blob: 4 Catmull-Rom control points in a loose diamond, no straight edges; outline nudges come from `hash01(shapeSeed, …)`, so a mark looks the same every redraw (pass the resting place's `shapeSeed` to keep the shape while it moves) | leaves, foliage accents, curved bush marks |
  | Scribble | planned   | 3–5 noise-nudged points                                                                                                                                                                                                                          | blossom, ragged edges                      |

- **Trees (`trees.js`):** recursive branches with bezier bends, generated in the `Tree` constructor and drawn from that data. Placement comes from the `leftTrees` / `rightTrees` `along` lists in `buildTrees()`; size from `treeSettings.sizeFactor`. Leaves are clumps of `dab()` marks around the outer branches, generated once by `buildFoliage()` (shadow → mid → light pass, settings in `treeSettings`) and stored in `tree.foliage`, like `Bush` marks. Drawing (`drawWood()` + `drawLeaves()`) uses no `random()`, so any part of the scene can be redrawn on its own. Every tree is built, then every tree's foliage, before any is drawn: that keeps the `random()` order (and the look) fixed. `tree.bounds` / `bush.bounds` are boxes used by partial redraws. **Target:** add sway/shake as a per-node angle accumulating down the tree, and give only the nearest 2–3 trees full branching (`drawFar()` exists but `this.far` is currently disabled).
- **Bushes (`bushes.js`):** overlapping `Bush` clumps along each verge, placed through `lane()` by `drawBushes()` (settings in `bushSettings`) and drawn far → near. Each clump is a solid noise-wobbled blob in a slightly jittered `palette.bush` shade, softened with a canvas blur (`drawingContext.filter`, applied to that fill only), with optional crisp dashes on top. Don't build bushes from branch skeletons.
- **Randomness:** seeded (`randomSeed(seed)`, `noiseSeed(seed)` at the start of each repaint in `sceneSteps()`; bushes use `seed + 1`) so the layout is identical every repaint and for everyone debugging. A repaint can be spread over several frames, so nothing outside it may call p5's `random()`.

### Render layers (partial, bottom → top)

**Built (`sketch.js`):** drawing the whole scene takes ~250 ms (~90k marks), so it is never drawn straight to the canvas:

- `sceneSteps()` is the whole scene as a generator (sky → ground → road → grass → _base snapshot_ → stars → bushes → trees → debug labels); each `yield` is a point where it can pause. `stepRebuild()` runs it into an offscreen `p5.Graphics` by temporarily pointing p5's renderer (and `drawingContext`) at it.
- Two buffer sets (`buffers.current` on screen, `buffers.pending` being painted), each with `scene` (everything) and `base` (under bushes/trees). Each frame `drawBuffer(current.scene)` copies the picture to the canvas pixel for pixel (no scaling: resampling at a fractional pixel density made redrawn patches show as a sharper square). Order per frame: picture → star twinkle (`drawTwinkle()`) → hover patch (`redrawArea`) → `drawFadingPicture()`, so a cross-fade covers the patch too.
- When any palette colour drifts more than `cacheSettings.colourThreshold`, a background repaint starts and gets `frameBudgetMs` per frame; when done, `finishRebuild()` swaps the buffers and the old picture fades out over `fadeFrames`. `sceneDirty = true` (first frame, `r`, `d`, resize) repaints in one go instead.
- Hover: `getSwayAreas()` returns 0–2 circles (tree sway, bush rustle), each sized to exactly where moving leaves can reach (`reachOfMovingLeaves()`, leaf shift capped at `swayDistance`) plus a `swayEdgeSoftness` fade ring. `redrawArea()` paints that circle on an offscreen `buffers.patch` (via `drawInto()` + `withClip()`): `current.base`, then the stars inside it (`drawStars(sceneStars, area)`; the base has none), then only the bushes/trees whose `bounds` overlap, and only their marks inside. Then `fadeEdge()` fades its rim, and it's copied onto the canvas. Why: (a) the browser rasterises the visible canvas and offscreen canvases slightly differently, and never quite identically twice, so a hard-edged patch drawn on the canvas showed as an outline; (b) trees keep their build-time bark colour (`tree.woodColour`), since the live palette drifts away from the saved picture. `sceneSteps()` starts with an opaque `background()`: the sky's 1 px lines alone left pixels ~75% opaque.
- Measured (headless Chrome): idle ~1 ms/frame; hover over the biggest trees ~25–30 fps; through the 60 s day cycle ~20 fps of 24 with repaints running. Before caching: ~4.6 fps.

Still planned:

| Layer      | Contents                                                                               | Redrawn                                                          |
| ---------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Static     | sky, ground, bushes, trees (built, see above), shadows                                 | only when conditions change noticeably (cached `createGraphics`) |
| Puddle     | static + live layers mirrored about the horizon, clipped to the puddle, tint + ripples | every frame                                                      |
| Live       | trunks, swaying canopies, creatures                                                    | every frame                                                      |
| Rain       | drops, count follows `rain`                                                            | every frame                                                      |
| Atmosphere | night dimming                                                                          | every frame                                                      |

`p5.brush` is fine on the static layer; it's likely too slow for anything redrawn every frame.

---

## 6. File structure

Scripts are plain (non-module) `<script>` tags sharing globals; load order in `index.html` matters: `colors.js` → `time.js` → `noise.js` → `utils.js` → `trees.js` → `bushes.js` → `rain.js` → `sketch.js` → `user-input.js`.

**Existing**

| File            | Owns                                                                                                                                                                                                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `colors.js`     | Colour data as `[h, s, b]`: `WEATHER_SETS`, `TIME_KEYFRAMES`                                                                                                                                                                                                                        |
| `time.js`       | Clock + pause, OKLab blending, keyframe schedule, `getDaylight()`, `getStarVisibility()`, `getWeatherOffset()`, `resolvePalette()`                                                                                                                                                                         |
| `noise.js`      | Weather layer: `weatherSettings`, live `weather` state (`rain`, `moisture`, `temperature`), `setupWeather()`, `updateWeather()`, `getConditions()`, `toggleWeather()`                                                                                                               |
| `rain.js`     | Rain + puddle live layer: `rainSettings`, `Raindrop`, `Splash`, `WetPatch`, `blob()`, `puddleSpot` (`updatePuddleSpot()`, `pickPuddleSpot()`), `updateRain()` (called in `draw()` after the scene, before the input overlay) |
| `utils.js`    | `lane()` perspective, verge placement, `marks()`, mark kit (`dash`, `blade`, `dab`), `jitter`, `mixRGB`, `sharpDensity`                                                                                                                                                             |
| `trees.js`      | `Tree` (recursive bending branches, leaf clumps) + bezier helpers                                                                                                                                                                                                                   |
| `bushes.js`     | `Bush` (one blurred undergrowth clump)                                                                                                                                                                                                                                              |
| `user-input.js` | Hover rustle (`ColourBlock` touch grid, `hoverTouch()` hook used by `trees.js` / `bushes.js`), click bursts (`Burst`) + rings, region lookup (`getRegion`), tree/bush hit areas, cursor → scene mapping. Settings (`hoverRadius`, `glintDuration`, `columns`, `rows`, …) at the top |
| `sketch.js`     | p5 entry point, settings (`perspective`, `roadSettings`, `treeSettings`, `bushSettings`, `starSettings`, `cacheSettings`, `clock`, `FRAME_RATE`), scene cache + background repaint (`sceneSteps`, `stepRebuild`, `redrawArea`), scene passes, `temperatureRange`, HUD (`updateHud`, `setMeter`), input              |
| `index.html`    | Script order + HUD markup (time / temperature / humidity / moisture / conditions; `.meter[data-meter=…]` bars)                                                                                                                                                                      |
| `style.css`     | Canvas scaling (cover the window) + HUD styling, incl. `.meter` (fill width from `--value`)                                                                                                                                                                                         |
| `assets/`       | Reference image(s) from the series                                                                                                                                                                                                                                                  |
| `scripts/`      | Old experiments (`set-up.js`, `user-input.js`), commented out in `index.html` — not used                                                                                                                                                                                            |
| `TODO.md`       | Per-layer task list                                                                                                                                                                                                                                                                 |

**Planned**

| File        | Will own                                                                     |
| ----------- | ---------------------------------------------------------------------------- |
| `config.js` | Tunable settings currently at the top of `sketch.js` + colour data           |
| `env.js`    | `TimeOfDay`, `Environment` (resolves palette + light); may absorb `noise.js` |
| `actors.js` | Birds, ducks, petals, reaction table                                   |
| `scene.js`  | Puddle reflection, static/live drawing passes                                         |

**Existing (added)**

| File       | Owns                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `moon.js`  | Moon phases: `moonSettings`, phase tracking (`_moonPhaseDay`, `getMoonPhase()`), arc position, organic wobble path, phase lit-area path, `getMoonPatch()` → `{area, draw}` consumed by `redrawMoonArea()` in `sketch.js` |

Tunable numbers (durations, thresholds, cooldowns, colours) belong in a settings object (`config.js` once it exists), not inline. Annotate them with `[hard limits]` and a "try" range, like `perspective` in `sketch.js`.

**Keys:**

| Key   | Action                                                                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `t`   | Toggle virtual ↔ real (wall) clock                                                                                                    |
| `p`   | Pause / resume the clock                                                                                                              |
| `→` / `←` | Pause and jump to the next / previous full hour (`stepHour()` in time.js); `p` resumes from there                              |
| `w`   | Toggle the noise weather on / off (off = dry, mean temperature)                                                                       |
| `d`   | Toggle debug tree labels (side + `along` value at each trunk)                                                                         |
| `r`   | Redraw                                                                                                                                |
| hover | Moving onto tree leaves makes the leaves near the cursor sway slightly (bush marks rustle); they calm to still about 1 s after the cursor stops or leaves |
| click | Blossom/leaf burst on a tree or bush; ring (ripple on the ruts) anywhere                                                              |

---

## 7. Working together

- **Team:** _add names + who owns which layer/file_
- **Repo / branch:** https://github.com/nicolezx/9103-creative-coding — `main` plus personal branches (e.g. `nicole`). _Add branching convention._
- **Running locally:** VS Code Live Server (or `npx serve .`); scripts load over `http://`, not `file://`.
- **Deadline / milestones:** _add_
- **Design source of truth:** project Notion page "Arrival of Spring Generative Artwork". If code and Notion disagree, flag it in the group chat rather than guessing.

### Ground rules for humans and agents

- Keep each change inside one layer where possible; touching shared files (`utils.js`, `time.js`, `colors.js`, later `env.js`) affects everyone, so mention it.
- Before adding a new variable to `env`, check whether an existing one already covers it.
- Comment the _why_ on anything non-obvious (thresholds, magic curves) — this is assessed work and markers will read it.
- Don't add libraries beyond p5.js (and p5.brush on the static layer) without agreement.
- Agents: don't restructure files, rename public functions, or reintroduce removed weather features unprompted. Ask first.
- Agents: update this file in the same change as any structural change or new feature (see the note at the top).
- Check performance before merging anything that runs every frame. The scene is cached (§5 Render layers); anything new in the scene goes into `sceneSteps()` with a `yield` after any pass that takes more than a few ms.

---

## 8. Open to-dos

- [x] Wire the draft scene's colours into the shared palette (`resolvePalette()`)
- [x] Sample daytime palettes for dry / overcast / wet from the series
- [ ] Tune the invented GoldenHour / Dusk / Night keyframes (no night references exist)
- [ ] Give `leaf` its own non-Day keyframes (currently copies grass)
- [x] Weather layer: noise-driven `rain`, `moisture`, `temperature` (`noise.js`)
- [x] Rain drops, splashes and wet-patch puddle (`rain.js`)
- [ ] Decide what `temperature` drives
- [ ] Set the composition: vanishing point, road width, tree placement
- [x] Store tree leaf marks once (`buildFoliage()`)
- [ ] Redraw trees per frame for sway and shake (only the swaying ones, like `redrawArea()`); re-enable far trees
- [x] Cache the scene instead of redrawing it every frame (background repaint + cross-fade)
- [ ] Make a full repaint cheaper (~250 ms of marks) so colour changes during the day cycle can be smoother
- [ ] Per-mark variant swatches (`VARIANTS` hooks in `colors.js` / `time.js`)
- [x] Leaf sway on hover, bush rustle on hover and click bursts (`user-input.js`)
- [x] Moon phases: 8-phase cycle, nightly arc, organic outline, blur (`moon.js` + `redrawMoonArea()` in `sketch.js`)
- [ ] Interaction: tree shake, reaction table, creatures; add a night reaction (owl or bats)
- [ ] Puddle: sky/tree reflection, muddy rim, stretched along the lane (today: dark wet patches only)
- [ ] Move settings + colour data into `config.js`
