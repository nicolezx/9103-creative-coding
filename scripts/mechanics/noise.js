// ── Weather layer (Perlin noise) ──────────────────────────────────────────────
// Two precomputed noise arrays, each from its own noise seed, are read as a
// timeline: one sample per virtual hour.
//
//   humidity array ──► rain (only above a threshold, so there are dry spells
//                      between showers) ──► moisture (fills while raining,
//                      drains when dry, faster in daylight)
//   temperature array ──► slow day-to-day drift, added to a daily warm/cool
//                         curve and cooled a little by rain
//
// The arrays are built once in setup(): the scene redraws use p5's global
// noise() with noiseSeed(seed), so the weather can't reseed noise every frame
// without changing how the scene's marks are laid out.
//
// Everything the rest of the sketch reads is in `weather`. When the layer is
// switched off (W key) it reports neutral values (dry, mean temperature), so
// the time-of-day cycle carries on unaffected (AGENTS.md §2).

const weatherSettings = {
  enabled: true, // W toggles; off = dry, mean temperature, moisture drains away
  noiseLength: 60, // noise() input range sampled [> 0]; samples = noiseLength / step
  hoursPerSample: 1, // virtual hours per array entry [> 0]; try 0.5–2
  // Noise steps: how far noise() input moves per sample. Smaller = slower,
  // smoother change. p5 noise has its biggest features about 1 unit wide.
  humidityStep: 0.15, // [> 0]; try 0.08–0.3 (0.15 → a shower front every ~7 virtual hours)
  temperatureStep: 0.04, // [> 0]; try 0.02–0.08 (slower: warm and cold spells last days)
  humiditySeed: 101, // noise seeds, one per array so they don't move in step
  temperatureSeed: 202,

  // rain = how far humidity sits above this, rescaled to 0–1. Higher = drier
  // weather, shorter showers [0–1); try 0.55–0.75
  // (0.65 → rain about a third of the time, a damp English spring)
  rainThreshold: 0.65,

  // moisture, per virtual hour [≥ 0]
  moistureFill: 0.35, // gained at rain = 1; try 0.2–0.6 (0.35 → ~3 h of heavy rain to fill)
  moistureDrain: 0.03, // lost when dry at night; try 0.01–0.06
  daylightDrain: 3, // drain multiplier at full daylight (sun dries the lane) [≥ 1]; try 2–5

  // temperature, °C. Spring in Yorkshire: cold nights, mild afternoons.
  meanTemperature: 10, // try 8–12
  dailySwing: 5, // ± around the mean: coldest ~3am, warmest ~3pm; try 3–7
  driftRange: 4, // ± from the temperature noise (warm / cold spells); try 2–6
  rainCooling: 3, // degrees lost at rain = 1; try 1–5

  // HUD Conditions label (getConditions()). Humidity says what the sky is
  // doing; moisture says how long it's been doing it.
  cloudyHumidity: 0.5, // overcast above this, even when not raining [< rainThreshold]; try 0.4–0.6
  cloudyMoisture: 0.25, // still cloudy while the ground is this wet after a shower [0–1]; try 0.15–0.4
  heavyHumidity: 0.82, // heavy rain above this… [rainThreshold–1]; try 0.75–0.9
  heavyMoisture: 0.15, // …once the ground is this wet, so a shower starts as drizzle [0–1]; try 0.05–0.3
};

// Live weather state, updated every frame by updateWeather().
const weather = {
  rain: 0, // 0 dry → 1 heavy rain; drives the weather palette (getWeatherOffset)
  moisture: 0, // 0 dry ground → 1 soaked; the puddle will follow this
  temperature: weatherSettings.meanTemperature, // °C
  humidity: 0.5, // 0–1 noise value rain is derived from; HUD meter + Conditions label
};

let humidityNoise = []; // 0–1 per sample
let temperatureNoise = [];
let weatherHours = 0; // virtual hours since setup, keeps counting across days
let lastDayFraction = null;

// Builds both noise arrays. Call once in setup(), before the first draw().
function setupWeather() {
  humidityNoise = makeNoiseArray(
    weatherSettings.humiditySeed,
    weatherSettings.humidityStep,
  );
  temperatureNoise = makeNoiseArray(
    weatherSettings.temperatureSeed,
    weatherSettings.temperatureStep,
  );
  noiseSeed(seed); // hand noise() back to the scene in its usual state
}

// One noise sample per step, stretched to fill 0–1. Raw p5 noise mostly sits
// between ~0.3 and ~0.7, which would make the rain threshold hard to tune.
function makeNoiseArray(noiseSeedValue, perlinNoiseStep) {
  noiseSeed(noiseSeedValue);
  const perlinNoiseArray = [];
  for (let i = 0; i < weatherSettings.noiseLength; i += perlinNoiseStep) {
    perlinNoiseArray.push(noise(i));
  }
  const lo = Math.min(...perlinNoiseArray);
  const hi = Math.max(...perlinNoiseArray);
  return perlinNoiseArray.map((v) => (v - lo) / (hi - lo));
}

// Reads an array as a looping timeline at `hours`, blending neighbouring
// samples so values glide instead of stepping once an hour.
function sampleNoise(arr, hours) {
  const pos = hours / weatherSettings.hoursPerSample;
  const i = Math.floor(pos);
  const a = arr[((i % arr.length) + arr.length) % arr.length];
  const b = arr[(((i + 1) % arr.length) + arr.length) % arr.length];
  return a + (b - a) * (pos - i);
}

// Advances the weather by however much virtual time passed since last frame.
// Call once per draw(), before resolvePalette().
function updateWeather() {
  const dt = virtualHoursSinceLastFrame();
  weatherHours += dt;
  const dayFraction = getDayFraction();

  if (weatherSettings.enabled) {
    weather.humidity = sampleNoise(humidityNoise, weatherHours);
    weather.rain = constrain(
      (weather.humidity - weatherSettings.rainThreshold) /
        (1 - weatherSettings.rainThreshold),
      0,
      1,
    );
  } else {
    weather.humidity = 0; // dry, so the Conditions label clears too
    weather.rain = 0;
  }

  // Moisture is the layer's memory: it lags behind rain, so the lane stays
  // wet after a shower. Daylight is the one deliberate time → weather link.
  const drain =
    weatherSettings.moistureDrain *
    lerp(1, weatherSettings.daylightDrain, getDaylight());
  weather.moisture = constrain(
    weather.moisture +
      (weather.rain * weatherSettings.moistureFill -
        (1 - weather.rain) * drain) *
        dt,
    0,
    1,
  );

  // cos peaks at 15:00 (0.625 of the day) and bottoms out at 03:00
  const daily = Math.cos(TWO_PI * (dayFraction - 0.625));
  weather.temperature = weatherSettings.enabled
    ? weatherSettings.meanTemperature +
      daily * weatherSettings.dailySwing +
      (sampleNoise(temperatureNoise, weatherHours) - 0.5) *
        2 *
        weatherSettings.driftRange -
      weather.rain * weatherSettings.rainCooling
    : weatherSettings.meanTemperature;
}

// Virtual time between frames, from the change in day fraction, so pausing
// freezes the weather and the real-clock mode slows it to real time.
function virtualHoursSinceLastFrame() {
  const dayFraction = getDayFraction();
  if (lastDayFraction === null) lastDayFraction = dayFraction;
  const delta = (dayFraction - lastDayFraction + 1) % 1; // wraps at midnight
  lastDayFraction = dayFraction;
  // switching clock modes (T) jumps the time of day: don't fast-forward the
  // weather by hours in one frame
  return delta * 24 > 1 ? 0 : delta * 24;
}

// One word or two for the HUD Conditions label, from humidity + moisture.
// Rain itself comes from humidity alone; moisture adds the lag a real shower
// has: it opens as drizzle until the ground is wet, and the sky stays grey
// for a while after it stops instead of snapping straight back to clear.
function getConditions() {
  const s = weatherSettings;
  const { humidity, moisture } = weather;
  if (humidity > s.rainThreshold) {
    return humidity > s.heavyHumidity && moisture > s.heavyMoisture
      ? "Heavy rain"
      : "Light drizzle";
  }
  if (humidity > s.cloudyHumidity || moisture > s.cloudyMoisture)
    return "Cloudy";
  return "Clear";
}

function toggleWeather() {
  weatherSettings.enabled = !weatherSettings.enabled;
}
