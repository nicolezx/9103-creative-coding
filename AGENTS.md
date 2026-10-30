# AGENTS.md — Arrival of Spring (IDEA9103 Creative Coding)

Shared context for everyone on the team **and** any AI coding agent (Claude Code, Cursor, Copilot, etc.) working in this repo. Read this before writing code. If something here is out of date, fix it in the same PR as the change that made it stale.

> Claude Code users: add a `CLAUDE.md` containing just `@AGENTS.md` so it loads automatically.

---

## 1. What we're building

An interactive p5.js adaptation of David Hockney's _The Arrival of Spring in Woldgate_ series. One season (spring), one scene: a country lane receding to a vanishing point, with trees, grass verges and sky, all drawn as **marks** (dashes, dabs, scribbles) over flat colour, using a palette sampled from the series.

Three layers sit on top of the base scene:

1. **Weather** — Perlin noise drives rain and temperature. Rain builds up `moisture`, which feeds a reflective puddle that grows and slowly drains.
2. **Time of day** — an automatic 24-hour cycle compressed into a fixed duration (default 60 s), controlling colour, light and visibility.
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

If a change needs to break one of these rules, raise it with the team first. Don't quietly add a shortcut.

---

## 3. Layer reference

### Weather (`env.js`)

| Value         | Range | Drives                                                                |
| ------------- | ----- | --------------------------------------------------------------------- |
| `rain`        | 0 → 1 | Raindrop count, puddle ripples                                        |
| `temperature` | TBD   | TBD — agree as a team what this drives                                |
| `moisture`    | 0 → 1 | Puddle size, darker wet ground. Builds while raining, drains when dry |

- `moisture` is the layer's memory: the puddle follows moisture, not rain, so it lingers after a shower.
- **Removed:** clouds, mist (and wind, unless re-agreed). Don't reintroduce them without a team decision. Older docs that mention `cloud` or `wetness` are out of date — `wetness` was renamed to `moisture`.

### Time of day (`env.js`)

- `phase` runs 0 → 1 across the day: 0 = midnight, 0.25 = 6am, 0.5 = noon, 0.75 = 6pm. Advance by `deltaTime / dayLength` each frame, so pausing just freezes it.
- Derived:
  - `sunAltitude = sin((phase − 0.25) × TWO_PI)` → −1 at midnight, 1 at noon
  - `daylight` → smoothed 0 → 1 with a soft twilight band
  - `sunSide` → −1 (sun left, morning) to +1 (right, evening)

### Interaction (`actors.js`)

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

## 4. Colour & light

Colour is built in stages — never store a palette per weather × time combination:

1. Time keyframes (night, dawn, noon, dusk) → blend the two nearest by `phase`
2. Apply weather tints (rain, wet ground)
3. Resolve one base colour per **element group**: `skyTop`, `skyHorizon`, `foliage`, `blossom`, `trunk`, `path`, `mud`, `verge`, `shadow`, `puddle`
4. Each mark adds its own fixed **offset** (± hue/sat/brightness), chosen once at creation and never changed

Marks store an _offset_, not a colour. That's what keeps texture stable while the whole field shifts with the light. Don't hard-code hex values in scene code — always go through the palette.

The light object exposes: `ambient`, `shadowAlpha`, `starAlpha`, `visibility`, `sunAltitude`, `sunSide`.

---

## 5. Drawing conventions

- **Everything is a filled shape + a field of marks**, drawn sky first, then far → near.
- **Perspective:** all ground placement goes through `lane(t, u)` (`t`: 0 = viewer's feet, 1 = vanishing point; `u`: 0 = left road edge, 1 = right; outside 0–1 = verges). It returns `{ x, y, s }`, where `s` scales mark size. Changing the composition means changing the vanishing point and road width — never scattering new coordinates.
- **Mark kit:** use the shared marks in `utils.js` rather than ad-hoc `line()` / `ellipse()` calls.

  | Mark     | Shape                         | For                                |
  | -------- | ----------------------------- | ---------------------------------- |
  | Dash     | straight, round ends          | road, sky texture, bark            |
  | Dab      | short, thick, slightly curved | leaves, grass accents              |
  | Scribble | 3–5 noise-nudged points       | blossom, undergrowth, ragged edges |

- **Trees:** generate branches recursively **once** with a fixed seed, keep the result as node data, and redraw from that data every frame. Sway/shake adds an angle per node, accumulating down the tree. Only the nearest 2–3 trees get full branching; far trees are a trunk stroke + a blob of leaf marks.
- **Bushes:** overlapping `Bush` clumps along each verge (`bushes.js`), placed through `lane()` and drawn far → near. Each clump is a solid noise-wobbled blob in a slightly jittered `palette.bush` shade, so neighbours stay distinct, softened with a canvas blur (`drawingContext.filter`, applied to that fill only), with a few crisp dashes on top. Don't build bushes from branch skeletons. Like `Tree`, geometry and marks are generated once in the constructor and redrawn from that data.
- **Randomness:** seed it (`randomSeed`, `noiseSeed`) so everyone sees the same scene when debugging.

### Render layers (bottom → top)

| Layer      | Contents                                                                               | Redrawn                                                          |
| ---------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Static     | sky, ground, bushes, shadows                                                           | only when conditions change noticeably (cached `createGraphics`) |
| Puddle     | static + live layers mirrored about the horizon, clipped to the puddle, tint + ripples | every frame                                                      |
| Live       | trunks, swaying canopies, creatures                                                    | every frame                                                      |
| Rain       | drops, count follows `rain`                                                            | every frame                                                      |
| Atmosphere | night dimming                                                                          | every frame                                                      |

`p5.brush` is fine on the static layer; it's likely too slow for anything redrawn every frame.

---

## 6. File structure

| File         | Owns                                                                 |
| ------------ | -------------------------------------------------------------------- |
| `config.js`  | Settings, palette keyframes, weather tints, stroke variation amounts |
| `env.js`     | `TimeOfDay`, `Weather`, `Environment` (resolves palette + light)     |
| `utils.js`   | Shared helpers: `lane()` perspective, placement, mark kit, resizing  |
| `bushes.js`  | `Bush` (one blurred undergrowth clump; placed in `sketch.js`)        |
| `scene.js`   | `Tree`, `Puddle`, `Scene` (static + live drawing passes)             |
| `actors.js`  | Birds, ducks, petals, rain, reaction table                           |
| `sketch.js`  | p5 entry point, render order, input handling                         |

Tunable numbers (durations, thresholds, cooldowns, colours) belong in `config.js`, not inline.

**Debug keys:** `t` toggles time · `w` toggles weather · `d` toggles the debug readout.

---

## 7. Working together

- **Team:** _add names + who owns which layer/file_
- **Repo / branch:** _add repo URL and branching convention (e.g. `feature/<layer>-<thing>`)_
- **Running locally:** _e.g. VS Code Live Server, or `npx serve .`_
- **Deadline / milestones:** _add_
- **Design source of truth:** project Notion page "Arrival of Spring Generative Artwork". If code and Notion disagree, flag it in the group chat rather than guessing.

### Ground rules for humans and agents

- Keep each change inside one layer where possible; touching `env.js` affects everyone, so mention it.
- Before adding a new variable to `env`, check whether an existing one already covers it.
- Comment the _why_ on anything non-obvious (thresholds, magic curves) — this is assessed work and markers will read it.
- Don't add libraries beyond p5.js (and p5.brush on the static layer) without agreement.
- Agents: don't restructure files, rename public functions, or reintroduce removed weather features unprompted. Ask first.
- Check performance with the debug readout before merging anything that runs every frame.

---

## 8. Open to-dos

- [ ] Sample real colours from the series into the night / dawn / noon / dusk keyframes (current hex values are placeholders)
- [ ] Decide what `temperature` drives
- [ ] Set the composition: vanishing point, road width, tree placement
- [ ] Store tree branch data and redraw per frame for sway and shake
- [ ] Wire the draft scene's colours into the shared palette
- [ ] Add a night reaction (owl or bats)
- [ ] Add a muddy rim around the puddle and stretch it along the lane
