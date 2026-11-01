// ── PALETTE KEYFRAMES ──────────────────────────────────────────────────────────
//
// ██████████████████████████████████████████████████████████████████████████████
// ██  PLACEHOLDERS — every hex value below is a rough stand-in.               ██
// ██  Replace with colours sampled from the Hockney Woldgate series before    ██
// ██  final submission. To swap colours: edit the hex strings only.           ██
// ██  All palette logic lives in time.js; nothing else needs to change.       ██
// ██████████████████████████████████████████████████████████████████████████████
//
// Array order for every role: [Day, GoldenHour, Dusk, Night]
//   Day        = 12:00 noon
//   GoldenHour = 08:00 morning / 16:00 afternoon
//   Dusk       = 04:00 pre-dawn / 20:00 evening
//   Night      = 00:00 midnight
//
// TODO: migrate to config.js once that file exists (see AGENTS.md §6).
// ──────────────────────────────────────────────────────────────────────────────

// Nicole's reference sky values (kept for comparison — do not delete):
// '#effcad'  '#9ed0c1'  '#B7B2CC'

const PALETTE_KEYFRAMES = {
  //              Day          GoldenHour   Dusk         Night
  sky:     [ '#C9DDE6',    '#E8D8A8',   '#F2A86B',   '#1E2350' ],
  hills:   [ '#6E9B5E',    '#7E9850',   '#6B7A4A',   '#1F3A3A' ],
  trunks:  [ '#7A4B3A',    '#6E4530',   '#5A3020',   '#2A1E2E' ],
  road:    [ '#D9C2B0',    '#E0BC98',   '#D99A70',   '#4A4560' ],
  ruts:    [ '#A86A52',    '#A0603E',   '#8A4A30',   '#302A40' ],
  grass:   [ '#8FD04A',    '#A8C848',   '#9AA040',   '#2A5A3A' ],
  flowers: [ '#1F3BE0',    '#3A3CC8',   '#6A3A9A',   '#3A40A0' ],
};
