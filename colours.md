# Colours — outstanding work

What's still needed to fully integrate the **weather** palette (`WEATHER_SETS`) with the **time-of-day** palette (`TIME_KEYFRAMES`), and which scene elements aren't properly covered by either. See AGENTS.md §4 for how the pipeline works today.

Measured by running `colors.js` + `time.js` in Node with full rain (`rain = 1`) applied at each time keyframe.

---

## 1. Fix how weather combines with time

### 1.1 Weather offset gives wrong colours away from noon — high priority

**Problem.** `getWeatherOffset()` (time.js) measures each role's OKLab difference between the dry and wet paintings, and `resolvePalette()` adds that difference to the time-of-day colour. The difference includes a hue shift as well as darkening, so it only works on colours close to the noon (Day) ones.

| Role  | Golden hour, dry → full rain                              | Dusk, dry → full rain |
| ----- | --------------------------------------------------------- | --------------------- |
| sky   | `#E8D8A8` → `#FFD194` (more orange, not greyer)           | `#F2A86B` → `#FEA35E` |
| bush  | `#7E9850` → `#453A41` (purple-grey)                       | `#6B7A4A` → `#4F4B42` |
| road  | `#E0BC98` → `#744D00` (mustard; blue channel hits 0)      | `#D99A70` → `#A16228` |
| rut   | `#A0603E` → `#483900` (blue channel hits 0)               | `#8A4A30` → `#5E3900` |
| trunk | `#6E4530` → `#312300` (blue channel hits 0)               | `#5A3020` → `#3C2007` |

A blue channel of 0 means the colour was clipped: it ran outside what the screen can show.

**Change (pick one, agree as a team):**

- **A. Relative weather adjustment.** Describe each weather set as per-role multipliers instead of a colour difference: lightness × _k_, chroma × _k_, plus at most a small hue pull. Apply those to the time colour. Rain then means "greyer and darker" at any time of day.
- **B. Time-adjusted wet target.** Shift the wet colour by the same time-of-day change as dry (`wet + (timeBase − dry)`), then blend `timeBase` → that target by `rain`.

Either way, `resolvePalette()`'s signature can stay the same; only `getWeatherOffset()` / `_applyOffset()` change. Re-run the table above to check that nothing clips.

### 1.2 Rain has no effect on colour at night

**Problem.** The weather offset is multiplied by `_DAYLIGHT`, which is 0 at Night, so the midnight palette is identical with or without rain. The only change is the stars dimming (`starSettings.rainDim`).

**Change.** Choose one:

- Give weather a minimum weight (e.g. `max(daylight, 0.25)`) once 1.1 is fixed. The offset is only safe to apply to dark colours after that fix.
- Add a separate night-rain effect: a darker, flatter sky and a slightly lower `skyLow`.

### 1.3 Ground colours should follow `moisture`, not `rain`

**Problem.** `draw()` in sketch.js calls `getWeatherOffset(weather.rain)`. When a shower stops, the grass, road and bushes snap straight back to dry colours while the puddle (which follows `moisture`) is still there. AGENTS.md §3 says `moisture` drives "darker wet ground".

**Change.** Split the roles by input:

| Input      | Roles                                  |
| ---------- | -------------------------------------- |
| `rain`     | `sky` (and `star` dimming), `flower`?  |
| `moisture` | `road`, `rut`, `grass`, `trunk`, `bush`, `leaf` |

e.g. `getWeatherOffset(weather.rain, weather.moisture)`, with each role reading its own input. Weather off still gives a neutral result, because rain = 0 and moisture drains to 0.

### 1.4 "Wet" reference is a winter painting — team decision

`WEATHER_SETS.wet` is sampled from _18 December_, so heavy rain also makes the scene wintry (bush `#3D493A`, road `#705447`). The piece is spring-only. Decide whether to keep it, resample a wet spring painting, or soften the `wet` set.

---

## 2. Elements not covered (or wrongly covered) by the palettes

### 2.1 Grass flower dots

`palette.flowerYellow` and `palette.flowerWhite` are both `_adjustL(c.sky, +0.35)` (time.js `resolvePalette()`), so they're the same colour and neither is yellow. They don't use the `flower` role. Used in `drawGrass()` (sketch.js).

**Change.** Derive them from `c.flower`: e.g. `flowerWhite` = `flower` lightened, and `flowerYellow` = `flower` with a yellow hue pull. Alternatively add a `wildflower` role to every `WEATHER_SETS` entry and `TIME_KEYFRAMES`.

### 2.2 Blossom turns blue at golden hour

`TIME_KEYFRAMES.flower` goes Day `#FAFBC5` (pale yellow) → GoldenHour `#3A3CC8` (saturated blue) → Dusk `#6A3A9A` (purple) → Night `#3A40A0`. Blossom trees therefore turn bright blue at 9:00 and 15:00. These look like placeholder values.

**Change.** Replace them with warm, pale golden-hour blossom and progressively darker, desaturated dusk/night versions (dusk can lean slightly violet).

### 2.3 Leaf copies grass outside Day

`TIME_KEYFRAMES.leaf` GoldenHour / Dusk / Night are the grass values, so tree leaves and grass can't differ except at noon. (Already in AGENTS.md §8.)

**Change.** Give `leaf` its own non-Day keyframes, a little darker and bluer than grass so canopies read against the verges.

### 2.4 Sky gradient — done (needs tuning)

`skyLow` is now its own role in every `WEATHER_SETS` entry and in `TIME_KEYFRAMES`, and `resolvePalette()` uses it for `palette.skyLow`. Still to do: tune the GoldenHour / Dusk / Night `skyLow` values (they start as the matching sky + 0.12 lightness, the old derived horizon), e.g. a warmer glow under the pink dusk sky.

### 2.5 Star colour lives outside the colour data

`starSettings.colour` (sketch.js) is a hard-coded warm white. Only its opacity is resolved (`starColour()`), and it isn't tinted by time or weather.

**Change.** Move it to `colors.js` (a `star` entry, or derive it from `sky` at Night), and keep the visibility × rain opacity logic as it is.

### 2.6 No water / puddle role

`rain.js` builds the wet-patch colour from `palette.track`'s hue and saturation plus a fixed `rainSettings.wetDarken`. The planned puddle reflection, muddy rim and `water` click rings will need a proper colour.

**Change.** Add a `water` palette key derived from the sky, darker and with less chroma, plus a `mud` key derived from `rut`. Then point `rain.js` and the `water` rings in `user-input.js` at them.

### 2.7 `palette.cloud` is a leftover name

Clouds were removed, but `palette.cloud` (sky +0.28 lightness) is still used for raindrops (`rain.js`) and click rings (`user-input.js`).

**Change.** Rename it to something like `skyPale` (or `mist`). It's a public palette key, so mention the rename to the team.

### 2.8 No shadow or light colours

The planned light object (AGENTS.md §4: `ambient`, `shadowAlpha`, `sunAltitude`, `sunSide`) doesn't exist, and there is no shadow colour role.

**Change.** When shadows are added, derive the shadow colour from the time palette (e.g. `road` darkened and pulled toward `sky` hue) with `shadowAlpha` from daylight × (1 − rain), so overcast scenes lose their shadows.

### 2.9 Per-mark variant swatches

The `VARIANTS` hooks in `colors.js` / `resolvePalette()` aren't built yet. Marks still use `jitter()`. Do this after 1.1, since variants get the same weather adjustment as their base role.

### Already fine

Bushes, trunks (bark colour is fixed when each tree is painted, on purpose: `tree.woodColour`), road and ruts, grass clumps, and the burst and ring colours all read from `palette`. Debug labels are hard-coded, which doesn't matter.

---

## 3. Smaller gaps

- **No "time off" switch.** AGENTS.md §1 says each layer must work with the other off, and time off should mean noon. Pause (`p`) freezes the current time instead. Add a key or flag that forces `getDayFraction()` to 0.5, so weather colours can be checked in isolation.
- **Invented keyframes need tuning.** GoldenHour / Dusk / Night colours and the `_DAYLIGHT` weights are guesses. Tune them **after** 1.1, because the weather adjustment changes how they look in rain.

---

## Suggested order

1. 1.1 weather offset method (everything else depends on it)
2. 1.3 ground follows `moisture`
3. 2.1 flower dots and 2.2 blossom keyframes (quick fixes)
4. 1.2 night rain, 2.4 sky gradient roles, 2.3 leaf keyframes
5. 2.5 star colour into `colors.js`, 2.7 rename `cloud`
6. 2.6 water / mud roles (with the puddle reflection work)
7. 2.8 shadows, 2.9 variants, 1.4 wet reference decision, keyframe tuning
