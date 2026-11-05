# AGENTS.md — Arrival of Spring (IDEA9103 Creative Coding)

Shared context for everyone on the team **and** any AI coding agent (Claude Code, Cursor, Copilot, etc.) working in this repo. Read this before writing code. If something here is out of date, fix it in the same PR as the change that made it stale.

> Claude Code users: add a `CLAUDE.md` containing just `@AGENTS.md` so it loads automatically.

**Agents: keep this file current.** Whenever you make a structural change (new/renamed/moved files, public functions, data structures, colour pipeline, render order) or add a feature or debug key, update the relevant sections here **in the same change**, including §0 (status), §6 (files) and §8 (to-dos). Don't wait to be asked.

---

## 0. Current status

What exists today vs. what the rest of this doc describes as the target design. Sections below are marked **(built)**, **(partial)** or **(planned)**.

| Area                    | Status      | Where / notes                                                                                     |
| ----------------------- | ----------- | ------------------------------------------------------------------------------------------------- |
| Base scene              | built       | `sketch.js`: sky gradient, road + tyre tracks, grass verges, flower dots, bushes, trees           |
| Perspective (`lane()`)  | built       | `utils.js`; tuned via `perspective` in `sketch.js`                                                |
| Trees                   | partial     | `trees.js` `Tree`: recursive bending branches + stored leaf marks (`buildFoliage()`). Rebuilt from the seed on each repaint; far-tree path disabled; no sway/shake yet |
| Bushes                  | built       | `bushes.js` `Bush`, placed by `drawBushes()` in `sketch.js`                                       |
| Time of day             | built       | `time.js`: 60 s virtual day (or real clock), 4 colour keyframes, pause                            |
| Colour pipeline         | built       | `colors.js` data + `time.js` `resolvePalette()`: time keyframes + weather offset → `palette.*`    |
| Weather simulation      | planned     | Only `weatherStub.rain` in `sketch.js` (W key cycles 0 / 0.5 / 1). No noise, rain drops, `moisture` or `temperature` yet |
| Puddle                  | planned     |                                                                                                   |
| Interaction / creatures | partial     | `user-input.js`: hover rustle (moves/lightens existing tree + bush marks) + click bursts/rings (`Burst`). No tree shake, reaction table or creatures yet |
| Render layers / caching | partial     | `sketch.js`: whole scene cached in offscreen buffers, repainted in the background when the palette drifts, cross-faded in; hover patch redrawn live. Runs at `FRAME_RATE` 24. No puddle/rain/atmosphere layers yet |
| HUD                     | partial     | `index.html` + `style.css`: current time is live; Temperature / Conditions labels are placeholders |

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

### Weather (planned — `env.js`)

| Value         | Range | Drives                                                                       |
| ------------- | ----- | ---------------------------------------------------------------------------- |
| `rain`        | 0 → 1 | Raindrop count, puddle ripples, and the weather palette (dry → overcast → wet) |
| `temperature` | TBD   | TBD — agree as a team what this drives                                       |
| `moisture`    | 0 → 1 | Puddle size, darker wet ground. Builds while raining, drains when dry        |

- `moisture` is the layer's memory: the puddle follows moisture, not rain, so it lingers after a shower.
- **Today:** only `weatherStub = { rain }` exists in `sketch.js`, feeding `getWeatherOffset()`. Replace it with the real Weather layer; keep `rain = 0` meaning dry so the time cycle is unaffected when weather is off.
- **Removed:** clouds, mist (and wind, unless re-agreed). Don't reintroduce them without a team decision. Older docs that mention `cloud` or `wetness` are out of date — `wetness` was renamed to `moisture`. (`palette.cloud` still exists as a derived sky tint but nothing draws clouds.)

### Time of day (built — `time.js`)

- `getDayFraction()` returns 0 → 1 across the day (0 = midnight, 0.25 = 6am, 0.5 = noon, 0.75 = 6pm). It's computed from `millis()` minus time spent paused, so pausing freezes it and resuming continues from the same moment. Day length and start hour live in `clock` in `sketch.js`.
- `useRealClock` (T key) switches to the system wall clock.
- `_STOPS` maps hours to colour keyframes: midnight → Night, 6:00 → Dusk, 9:00 → GoldenHour, noon → Day, then mirrored. Transitions are smoothstepped.
- `getDaylight()` → 0 (night) to 1 (noon), from `_DAYLIGHT` per keyframe, eased the same way as the colours.
- `getTimeOfDay()` formats the HUD clock.
- **Planned:** `sunAltitude`, `sunSide` (−1 morning / +1 evening) for shadows and lighting.

### Interaction (partial — `user-input.js`; planned — `actors.js`)

**Built (`user-input.js`):**

- **Hover rustle (no overlay):** existing marks move instead. `Tree.drawLeaves()` and `Bush.drawMarks()` pass each mark `{ x, y, angle, length, colour }` through `hoverTouch(mark, region)` before drawing it. Within `hoverRadius` of the cursor, marks are pushed away from it (`hoverPush`), twisted (`hoverTwist`) and shiver slightly; a stable share of them (`lightenShare`, chosen by a position hash) blends toward a colour from `treePalette` / `bushPalette` (`hoverLighten`). Sky, road and grass are never touched. The `ColourBlock` grid (`columns × rows`) draws nothing: each block only remembers the touch point and fades it over `glintDuration`, so marks ease back once the cursor leaves. `hoverTouch()` must never call p5's `random()` (it runs mid-draw; an extra call would reshuffle the seeded layout); same for `pickHighlight()`, which takes an explicit `pick` there. Region palettes are rebuilt every frame from `palette`, so highlights follow time and weather.
- **Click:** `handleInputClick()` spawns `Burst` pieces (blossom/leaf dabs with drag + gravity) on trees and bushes, and a ring everywhere (a flattened ripple on `water`).
- **Region lookup (clicks):** `getRegion()` → `tree` / `bush` / `water` / `track` / `sky`. Grass verges count as `bush`; the tyre ruts count as `water` (until the puddle exists).
- **Hit areas:** `drawTrees()` / `drawBushes()` call `registerHitAreas()` with the objects they drew; trees = padded canopy ellipse + trunk box, bushes = ellipse matching the `Bush` blob.
- **Cursor mapping:** `toScene()` converts window px to scene px, accounting for the CSS `object-fit: cover` crop (p5's `mouseX` doesn't).
- Pointer moves are handled in a `pointermove` listener, so touches register along the cursor's path between frames.
- Input code must not call p5's `random()` (use `randomBetween()` / `Math.random`): the scene repaints across several frames from one seeded `random()` stream, and any call in between would change the layout.

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

**Planned light object:** `ambient`, `shadowAlpha`, `starAlpha`, `visibility`, `sunAltitude`, `sunSide`. Today only `getDaylight()` exists.

---

## 5. Drawing conventions

- **Everything is a filled shape + a field of marks**, drawn sky first, then far → near. Current order (in `sceneSteps()`, painted into the cache; `draw()` then copies it and adds the hover patch): sky → ground base coat → road → grass → bushes → trees → input overlay (rings, bursts; `updateInputElements()`). Hover doesn't draw: it moves tree/bush marks as they're drawn (`hoverTouch()`).
- **Perspective:** all ground placement goes through `lane(along, across)` (`along`: 0 = viewer's feet, 1 = vanishing point; `across`: 0 = left road edge, 1 = right; outside 0–1 = verges). It returns `{ x, y, scale }`, where `scale` sizes marks. Changing the composition means changing the `perspective` settings (horizon, vanishing point, road width, compression, curve, zoom) — never scattering new coordinates.
- **Mark counts:** wrap counts in `marks(n)` so density holds at any canvas size.
- **Mark kit (`utils.js`):** use the shared marks rather than ad-hoc `line()` / `ellipse()` calls.

  | Mark     | Function  | Shape                          | For                     |
  | -------- | --------- | ------------------------------ | ----------------------- |
  | Dash     | `dash()`  | straight, round ends           | road, bark, bush marks  |
  | Blade    | `blade()` | tapered, slightly bent stroke  | grass clumps            |
  | Dab      | `dab()`   | short, thick, slightly curved  | bush marks, leaves, grass accents |
  | Scribble | planned   | 3–5 noise-nudged points        | blossom, ragged edges   |

- **Trees (`trees.js`):** recursive branches with bezier bends, generated in the `Tree` constructor and drawn from that data. Placement comes from the `leftTrees` / `rightTrees` `along` lists in `buildTrees()`; size from `treeSettings.sizeFactor`. Leaves are clumps of `dab()` marks around the outer branches, generated once by `buildFoliage()` (shadow → mid → light pass, settings in `treeSettings`) and stored in `tree.foliage`, like `Bush` marks. Drawing (`drawWood()` + `drawLeaves()`) uses no `random()`, so any part of the scene can be redrawn on its own. Every tree is built, then every tree's foliage, before any is drawn: that keeps the `random()` order (and the look) fixed. `tree.bounds` / `bush.bounds` are boxes used by partial redraws. **Target:** add sway/shake as a per-node angle accumulating down the tree, and give only the nearest 2–3 trees full branching (`drawFar()` exists but `this.far` is currently disabled).
- **Bushes (`bushes.js`):** overlapping `Bush` clumps along each verge, placed through `lane()` by `drawBushes()` (settings in `bushSettings`) and drawn far → near. Each clump is a solid noise-wobbled blob in a slightly jittered `palette.bush` shade, softened with a canvas blur (`drawingContext.filter`, applied to that fill only), with optional crisp dashes on top. Don't build bushes from branch skeletons.
- **Randomness:** seeded (`randomSeed(seed)`, `noiseSeed(seed)` at the start of each repaint in `sceneSteps()`; bushes use `seed + 1`) so the layout is identical every repaint and for everyone debugging. A repaint can be spread over several frames, so nothing outside it may call p5's `random()`.

### Render layers (partial, bottom → top)

**Built (`sketch.js`):** drawing the whole scene takes ~250 ms (~90k marks), so it is never drawn straight to the canvas:

- `sceneSteps()` is the whole scene as a generator (sky → ground → road → grass → *base snapshot* → bushes → trees → debug labels); each `yield` is a point where it can pause. `stepRebuild()` runs it into an offscreen `p5.Graphics` by temporarily pointing p5's renderer (and `drawingContext`) at it.
- Two buffer sets (`buffers.current` on screen, `buffers.pending` being painted), each with `scene` (everything) and `base` (under bushes/trees). Each frame `drawPicture()` copies `current.scene` to the canvas.
- When any palette colour drifts more than `cacheSettings.colourThreshold`, a background repaint starts and gets `frameBudgetMs` per frame; when done, `finishRebuild()` swaps the buffers and the old picture fades out over `fadeFrames`. `sceneDirty = true` (first frame, `r`, `d`, resize) repaints in one go instead.
- Hover: `redrawArea()` clips to `getTouchedArea()`, paints `current.base`, then only the bushes/trees whose `bounds` overlap, and only their marks inside the patch.
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

Scripts are plain (non-module) `<script>` tags sharing globals; load order in `index.html` matters: `colors.js` → `time.js` → `utils.js` → `trees.js` → `bushes.js` → `sketch.js` → `user-input.js`.

**Existing**

| File          | Owns                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------- |
| `colors.js`   | Colour data as `[h, s, b]`: `WEATHER_SETS`, `TIME_KEYFRAMES`                                  |
| `time.js`     | Clock + pause, OKLab blending, keyframe schedule, `getDaylight()`, `getWeatherOffset()`, `resolvePalette()` |
| `utils.js`    | `lane()` perspective, verge placement, `marks()`, mark kit (`dash`, `blade`, `dab`), `jitter`, `mixRGB`, `sharpDensity` |
| `trees.js`    | `Tree` (recursive bending branches, leaf clumps) + bezier helpers                                          |
| `bushes.js`   | `Bush` (one blurred undergrowth clump)                                                        |
| `user-input.js` | Hover rustle (`ColourBlock` touch grid, `hoverTouch()` hook used by `trees.js` / `bushes.js`), click bursts (`Burst`) + rings, region lookup (`getRegion`), tree/bush hit areas, cursor → scene mapping. Settings (`hoverRadius`, `glintDuration`, `columns`, `rows`, …) at the top |
| `sketch.js`   | p5 entry point, settings (`perspective`, `treeSettings`, `bushSettings`, `cacheSettings`, `clock`, `FRAME_RATE`), scene cache + background repaint (`sceneSteps`, `stepRebuild`, `redrawArea`), scene passes, `weatherStub`, input |
| `index.html`  | Script order + HUD markup (time / temperature / conditions)                                   |
| `style.css`   | Canvas scaling (cover the window) + HUD styling                                               |
| `assets/`     | Reference image(s) from the series                                                            |
| `scripts/`    | Old experiments (`set-up.js`, `user-input.js`), commented out in `index.html` — not used      |
| `TODO.md`     | Per-layer task list                                                                           |

**Planned**

| File         | Will own                                                              |
| ------------ | --------------------------------------------------------------------- |
| `config.js`  | Tunable settings currently at the top of `sketch.js` + colour data    |
| `env.js`     | `TimeOfDay`, `Weather`, `Environment` (resolves palette + light)      |
| `actors.js`  | Birds, ducks, petals, rain, reaction table                            |
| `scene.js`   | `Puddle`, static/live drawing passes                                  |

Tunable numbers (durations, thresholds, cooldowns, colours) belong in a settings object (`config.js` once it exists), not inline. Annotate them with `[hard limits]` and a "try" range, like `perspective` in `sketch.js`.

**Keys:**

| Key | Action                                                                  |
| --- | ----------------------------------------------------------------------- |
| `t` | Toggle virtual ↔ real (wall) clock                                      |
| `p` | Pause / resume the clock                                                |
| `w` | Cycle `weatherStub.rain` 0 → 0.5 → 1 (temporary, until the Weather layer exists) |
| `d` | Toggle debug tree labels (side + `along` value at each trunk)            |
| `r` | Redraw                                                                  |
| hover | Tree leaves / bush marks near the cursor part, twist and some lighten, then settle back |
| click | Blossom/leaf burst on a tree or bush; ring (ripple on the ruts) anywhere |

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
- [ ] Build the Weather layer: noise-driven `rain`, `moisture`, rain drops; replace `weatherStub`
- [ ] Decide what `temperature` drives; wire the HUD Temperature / Conditions labels
- [ ] Set the composition: vanishing point, road width, tree placement
- [x] Store tree leaf marks once (`buildFoliage()`)
- [ ] Redraw trees per frame for sway and shake (only the swaying ones, like `redrawArea()`); re-enable far trees
- [x] Cache the scene instead of redrawing it every frame (background repaint + cross-fade)
- [ ] Make a full repaint cheaper (~250 ms of marks) so colour changes during the day cycle can be smoother
- [ ] Per-mark variant swatches (`VARIANTS` hooks in `colors.js` / `time.js`)
- [x] Hover rustle and click bursts (`user-input.js`)
- [ ] Interaction: tree shake, reaction table, creatures; add a night reaction (owl or bats)
- [ ] Puddle, with a muddy rim, stretched along the lane
- [ ] Move settings + colour data into `config.js`
