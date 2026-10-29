// Music theory helpers and the style table. Pure integer/array logic, no audio.

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const SCALES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  // More minor-side scales
  melodicMinor: [0, 2, 3, 5, 7, 9, 11],
  dorianB2: [0, 1, 3, 5, 7, 9, 10],
  neapolitanMinor: [0, 1, 3, 5, 7, 8, 11],
  hungarianMinor: [0, 2, 3, 6, 7, 8, 11],
  ukrainianDorian: [0, 2, 3, 6, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  // Oriental heptatonic scales (Arabic / Persian / Byzantine colour)
  hijaz: [0, 1, 4, 5, 7, 8, 10],
  doubleHarmonic: [0, 1, 4, 5, 7, 8, 11],
  persian: [0, 1, 4, 5, 6, 8, 11],
  // Quarter-tone scales (maqam-like, 24-EDO): a .5 is a quarter tone, i.e. a
  // pitch halfway between two piano keys.
  rast: [0, 2, 3.5, 5, 7, 9, 10.5],
  bayati: [0, 1.5, 3, 5, 7, 8, 10],
  saba: [0, 1.5, 3, 4, 6, 8, 10],
  neutral: [0, 2, 3.5, 5, 7, 8.5, 10.5],
};

// Five-note oriental scales (Japanese and Chinese). The melody uses the five
// notes (`mel`); chords are built on the 7-note `parent` mode that contains
// them, so the harmony stays consistent with the melody.
export const ORIENT_PENT = {
  hirajoshi: { parent: 'aeolian', mel: [0, 2, 3, 7, 8] },
  inSen: { parent: 'phrygian', mel: [0, 1, 5, 7, 10] },
  miyako: { parent: 'phrygian', mel: [0, 1, 5, 7, 8] },
  yo: { parent: 'dorian', mel: [0, 2, 5, 7, 9] },
  kumoi: { parent: 'dorian', mel: [0, 2, 3, 7, 9] },
  iwato: { parent: 'locrian', mel: [0, 1, 5, 6, 10] },
  ryukyu: { parent: 'ionian', mel: [0, 4, 5, 7, 11] },
  gong: { parent: 'ionian', mel: [0, 2, 4, 7, 9] },
};

// What Auto picks from in an "oriental" roll: all of them, or Japanese only.
export const ORIENT_NAMES = [...Object.keys(ORIENT_PENT), 'hijaz', 'doubleHarmonic', 'persian'];
export const ORIENT_JP = ['hirajoshi', 'inSen', 'miyako', 'yo', 'kumoi', 'ryukyu'];

// True for any scale name the app knows (7-note modes and the five-note ones).
export function isScaleName(name) {
  return typeof name === 'string' && (Object.prototype.hasOwnProperty.call(SCALES, name) || Object.prototype.hasOwnProperty.call(ORIENT_PENT, name));
}

// The extra minor-side scales above; Auto uses them only where the style's
// own mode is minor, so major-leaning places stay major.
export const MINOR_EXTRA = ['melodicMinor', 'dorianB2', 'neapolitanMinor', 'hungarianMinor', 'ukrainianDorian', 'locrian'];

// The quarter-tone scales above, in the order the Auto pick chooses among them.
export const MICRO_NAMES = ['rast', 'bayati', 'saba', 'neutral'];

// Scales whose melodies may use the five-note subset when a style asks for it.
export const PENT_OK = ['ionian', 'lydian', 'mixolydian', 'dorian', 'aeolian', 'phrygian'];

// Display name of a scale key: harmonicMinor -> "harmonic minor".
export function scaleLabel(name) {
  return name.replace(/([A-Z])/g, ' $1').toLowerCase();
}

export const PENT = {
  major: [0, 2, 4, 7, 9],
  minor: [0, 3, 5, 7, 10],
};

// Which chord-transition matrix suits each mode, and which degrees give it
// its colour (extra weight in the Markov chain).
export const SCALE_INFO = {
  ionian: { mat: 'major', favor: {} },
  lydian: { mat: 'major', favor: { 1: 2.2 } },
  mixolydian: { mat: 'major', favor: { 6: 2.0 } },
  dorian: { mat: 'minor', favor: { 3: 1.8 } },
  aeolian: { mat: 'minor', favor: {} },
  phrygian: { mat: 'minor', favor: { 1: 2.6 } },
  harmonicMinor: { mat: 'minor', favor: { 4: 1.8 } },
  melodicMinor: { mat: 'minor', favor: { 3: 1.6 } },
  dorianB2: { mat: 'minor', favor: { 1: 1.8 } },
  neapolitanMinor: { mat: 'minor', favor: { 1: 2.2, 4: 1.4 } },
  hungarianMinor: { mat: 'minor', favor: { 3: 1.8, 4: 1.4 } },
  ukrainianDorian: { mat: 'minor', favor: { 3: 2.0 } },
  locrian: { mat: 'minor', favor: { 4: 2.0 } },
  hijaz: { mat: 'major', favor: { 1: 2.4, 5: 1.3 } },
  doubleHarmonic: { mat: 'major', favor: { 1: 2.2, 5: 1.4 } },
  persian: { mat: 'major', favor: { 1: 2.0, 4: 1.4 } },
  rast: { mat: 'major', favor: { 3: 1.6 } },
  bayati: { mat: 'minor', favor: { 1: 1.6 } },
  saba: { mat: 'minor', favor: { 1: 2.2 } },
  neutral: { mat: 'minor', favor: { 2: 1.5 } },
};

// Row = from-degree, column = to-degree (0..6).
const MATRIX = {
  major: [
    [0.0, 0.08, 0.1, 0.25, 0.3, 0.22, 0.05],
    [0.05, 0.0, 0.05, 0.1, 0.5, 0.1, 0.2],
    [0.1, 0.1, 0.0, 0.3, 0.1, 0.4, 0.0],
    [0.25, 0.1, 0.05, 0.0, 0.35, 0.15, 0.1],
    [0.5, 0.05, 0.05, 0.1, 0.0, 0.25, 0.05],
    [0.1, 0.25, 0.05, 0.35, 0.2, 0.0, 0.05],
    [0.6, 0.05, 0.1, 0.05, 0.1, 0.1, 0.0],
  ],
  minor: [
    [0.0, 0.03, 0.12, 0.25, 0.15, 0.25, 0.2],
    [0.1, 0.0, 0.1, 0.1, 0.4, 0.1, 0.2],
    [0.1, 0.05, 0.0, 0.2, 0.1, 0.3, 0.25],
    [0.25, 0.05, 0.1, 0.0, 0.2, 0.15, 0.25],
    [0.4, 0.02, 0.08, 0.1, 0.0, 0.3, 0.1],
    [0.1, 0.05, 0.3, 0.2, 0.1, 0.0, 0.25],
    [0.35, 0.03, 0.25, 0.1, 0.1, 0.17, 0.0],
  ],
};

// ---------------------------------------------------------------------------
// Scale helpers

// Semitone offset of scale index `idx` (any integer, may be negative or
// beyond the scale length; wraps by octaves).
export function scaleNote(scale, idx) {
  const n = scale.length;
  const oct = Math.floor(idx / n);
  const i = idx - oct * n;
  return scale[i] + 12 * oct;
}

// Index in `scale` (extended across octaves) whose pitch is nearest to
// `semi` semitones above the key root.
export function nearestIdx(scale, semi) {
  const n = scale.length;
  let oct = Math.floor(semi / 12);
  let best = 0;
  let bestD = 1e9;
  for (let o = oct - 1; o <= oct + 1; o++) {
    for (let i = 0; i < n; i++) {
      const d = Math.abs(scale[i] + 12 * o - semi);
      if (d < bestD) {
        bestD = d;
        best = o * n + i;
      }
    }
  }
  return best;
}

// Chord tones (semitones above key root) for scale degree `d` (0..6) of a
// 7-note scale. opts: seventh (bool), sus ('2' | '4' | null).
export function chordTones(scale, d, opts) {
  const o = opts || {};
  const third = o.sus === '2' ? d + 1 : o.sus === '4' ? d + 3 : d + 2;
  const idxs = [d, third, d + 4];
  if (o.seventh) idxs.push(d + 6);
  return idxs.map((i) => scaleNote(scale, i));
}

// A new 7-note scale invented from a seed. Steps are counted in quarter tones
// (2 = one semitone) and add up to an octave (24). `quarter` allows odd step
// sizes (quarter tones) and at least one is used; without it only whole
// semitones are used. The tonic
// triad is kept usable: third between a minor and a major third (neutral
// thirds included), fifth within a quarter tone of perfect.
// Returns { scale (semitones, may contain .5), steps (semitones), info }.
export function makeProceduralScale(rng, quarter) {
  const unit = quarter ? 1 : 2;
  for (let tries = 0; tries < 80; tries++) {
    const q = [];
    let sum = 0;
    for (let i = 0; i < 7; i++) {
      const v = 2 + unit * rng.below(Math.floor(4 / unit) + 1); // 2..6 (even only without quarter)
      q.push(v);
      sum += v;
    }
    let guard = 0;
    while (sum !== 24 && guard++ < 200) {
      const i = rng.below(7);
      if (sum > 24 && q[i] - unit >= 2) {
        q[i] -= unit;
        sum -= unit;
      } else if (sum < 24 && q[i] + unit <= 6) {
        q[i] += unit;
        sum += unit;
      }
    }
    if (sum !== 24) continue;
    const pos = [0];
    for (let i = 0; i < 6; i++) pos.push(pos[i] + q[i]);
    const third = pos[2];
    const fifth = pos[4];
    if (third < 6 || third > 8 || fifth < 13 || fifth > 15) continue;
    if (q.filter((x) => x === 6).length > 1) continue;
    if (quarter && !q.some((x) => x % 2 === 1)) continue; // with quarter tones on, use at least one
    return {
      scale: pos.map((x) => x / 2),
      steps: q.map((x) => x / 2),
      info: { mat: third >= 8 ? 'major' : 'minor', favor: {} },
    };
  }
  return { scale: SCALES.dorian, steps: [1, 0.5, 1, 1, 1, 0.5, 1].map((x) => x * 2), info: SCALE_INFO.dorian };
}

// Fold a pitch into [lo, lo + 12).
export function fold(midi, lo) {
  while (midi < lo) midi += 12;
  while (midi >= lo + 12) midi -= 12;
  return midi;
}

// Markov progression of `len` degrees.
// `scaleName` is a key of SCALE_INFO or an info object ({ mat, favor }).
export function makeProgression(rng, scaleName, len, stay, startDegrees) {
  const info = typeof scaleName === 'string' ? SCALE_INFO[scaleName] : scaleName;
  const mat = MATRIX[info.mat];
  const prog = [];
  let cur = rng.pick(startDegrees);
  prog.push(cur);
  while (prog.length < len) {
    if (rng.chance(stay)) {
      prog.push(cur);
      continue;
    }
    const w = mat[cur].map((x, j) => x * (info.favor[j] || 1));
    cur = rng.weighted(w);
    prog.push(cur);
  }
  return prog;
}

// Euclidean rhythm: k hits spread over n steps. Returns array of 0/1.
export function euclid(k, n, rot) {
  const out = new Array(n).fill(0);
  if (k <= 0) return out;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += k;
    if (acc >= n) {
      acc -= n;
      out[(i + (rot || 0)) % n] = 1;
    }
  }
  return out;
}

// Parse a drum pattern string like "x...x...x...x..." into step indices.
export function pat(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) if (str[i] === 'x') out.push(i);
  return out;
}

// ---------------------------------------------------------------------------
// Styles

export const STYLES = [
  {
    id: 'drift',
    trim: 0.7,
    name: 'Drift',
    blurb: 'slow ambient pads, distant bells',
    bpm: [54, 70],
    scales: ['lydian', 'ionian', 'dorian'],
    pent: true,
    chordBars: 2,
    stay: 0.25,
    sevenths: 0.5,
    sus: 0.35,
    starts: [0, 0, 5, 3],
    patches: { pad: 'padSoft', bass: 'bassSub', arp: 'arpBell', lead: 'leadFlute' },
    layerProb: { pad: 1.0, bass: 0.6, arp: 0.25, lead: 0.55, drums: 0.0 },
    bass: { mode: 'drone' },
    arp: { mode: 'random', rate: 4, octaves: 2, vel: 0.45, gate: 1.6 },
    lead: { density: 0.16, vel: 0.55, minGap: 3 },
    drums: null,
    swing: 0,
    fx: { delayBeats: 0.75, delayFb: 0.5, delayMix: 0.3, reverbMix: 0.42, reverbSize: 0.92 },
    bright: [0.3, 0.6],
  },
  {
    id: 'neon',
    trim: 1.33,
    name: 'Neon',
    blurb: 'synthwave: pulsing bass, arps, gated snare',
    bpm: [96, 116],
    scales: ['aeolian', 'dorian', 'aeolian'],
    pent: false,
    chordBars: 1,
    stay: 0.1,
    sevenths: 0.25,
    sus: 0.05,
    starts: [0, 0, 5],
    patches: { pad: 'padSaw', bass: 'bassSaw', arp: 'arpSaw', lead: 'leadSax' },
    layerProb: { pad: 0.9, bass: 0.95, arp: 0.8, lead: 0.55, drums: 0.9 },
    bass: { mode: 'pulse' },
    arp: { mode: 'updown', rate: 2, octaves: 2, vel: 0.5, gate: 0.85 },
    lead: { density: 0.3, vel: 0.7, minGap: 1, lo: 58, hi: 82 },
    drums: { kick: 'x.......x.......', snare: '....x.......x...', hat: 'eighth', ghost: 0.1, level: 0.9 },
    swing: 0,
    fx: { delayBeats: 0.75, delayFb: 0.38, delayMix: 0.22, reverbMix: 0.22, reverbSize: 0.78 },
    bright: [0.5, 0.9],
  },
  {
    id: 'pulse',
    trim: 1.3,
    name: 'Pulse',
    blurb: 'driving house: four on the floor, offbeat bass',
    bpm: [122, 134],
    scales: ['phrygian', 'aeolian', 'harmonicMinor'],
    pent: false,
    chordBars: 2,
    stay: 0.45,
    sevenths: 0.1,
    sus: 0.0,
    starts: [0, 0, 0, 1],
    patches: { pad: 'padDark', bass: 'bassPulse', arp: 'arpPulse', lead: 'leadPulse' },
    layerProb: { pad: 0.6, bass: 0.95, arp: 0.85, lead: 0.25, drums: 1.0 },
    bass: { mode: 'offbeat' },
    arp: { mode: 'seq', rate: 1, octaves: 2, vel: 0.42, gate: 0.6 },
    lead: { density: 0.18, vel: 0.6, minGap: 2 },
    drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'offbeat', ghost: 0.05, level: 1.0 },
    swing: 0.02,
    fx: { delayBeats: 0.75, delayFb: 0.45, delayMix: 0.2, reverbMix: 0.16, reverbSize: 0.7 },
    bright: [0.35, 0.95],
  },
  {
    id: 'glass',
    trim: 0.8,
    name: 'Glass',
    blurb: 'dreamy pentatonic plucks over soft pads',
    bpm: [76, 92],
    scales: ['ionian', 'lydian', 'mixolydian'],
    pent: true,
    chordBars: 1,
    stay: 0.15,
    sevenths: 0.35,
    sus: 0.2,
    starts: [0, 3, 0, 5],
    patches: { pad: 'padSoft', bass: 'bassSub', arp: 'arpPluck', lead: 'leadVibes' },
    layerProb: { pad: 0.9, bass: 0.7, arp: 0.95, lead: 0.5, drums: 0.4 },
    bass: { mode: 'sub' },
    arp: { mode: 'random', rate: 2, octaves: 3, vel: 0.5, gate: 1.3 },
    lead: { density: 0.2, vel: 0.6, minGap: 2 },
    drums: { kick: 'x.......x.......', snare: null, hat: 'sparse', ghost: 0.0, level: 0.5 },
    swing: 0.05,
    fx: { delayBeats: 0.75, delayFb: 0.55, delayMix: 0.35, reverbMix: 0.38, reverbSize: 0.88 },
    bright: [0.45, 0.8],
  },
  {
    id: 'abyss',
    trim: 0.72,
    name: 'Abyss',
    blurb: 'dark drones, sparse low tones',
    bpm: [50, 64],
    scales: ['phrygian', 'harmonicMinor', 'aeolian'],
    pent: false,
    chordBars: 2,
    stay: 0.5,
    sevenths: 0.3,
    sus: 0.3,
    starts: [0, 0, 1],
    patches: { pad: 'padChoir', bass: 'bassSub', arp: 'arpBell', lead: 'leadFM' },
    layerProb: { pad: 1.0, bass: 0.9, arp: 0.15, lead: 0.5, drums: 0.0 },
    bass: { mode: 'drone' },
    arp: { mode: 'random', rate: 4, octaves: 2, vel: 0.35, gate: 2.0 },
    lead: { density: 0.1, vel: 0.5, minGap: 4 },
    drums: null,
    swing: 0,
    fx: { delayBeats: 1.5, delayFb: 0.55, delayMix: 0.28, reverbMix: 0.5, reverbSize: 0.96 },
    bright: [0.2, 0.5],
  },
  {
    id: 'arcade',
    trim: 1.36,
    name: 'Arcade',
    blurb: 'chiptune: pulse waves and fast arps',
    bpm: [132, 150],
    scales: ['mixolydian', 'ionian', 'dorian'],
    pent: false,
    chordBars: 1,
    stay: 0.1,
    sevenths: 0.0,
    sus: 0.0,
    starts: [0, 0, 5, 3],
    patches: { pad: 'padPulse', bass: 'bassPulse', arp: 'arpPulse', lead: 'leadPulse' },
    layerProb: { pad: 0.3, bass: 0.95, arp: 0.9, lead: 0.85, drums: 0.9 },
    bass: { mode: 'octave' },
    arp: { mode: 'up', rate: 1, octaves: 2, vel: 0.4, gate: 0.5 },
    lead: { density: 0.45, vel: 0.65, minGap: 1 },
    drums: { kick: 'x.....x.x.......', snare: '....x.......x...', hat: 'eighth', ghost: 0.15, level: 0.8 },
    swing: 0,
    fx: { delayBeats: 0.5, delayFb: 0.25, delayMix: 0.12, reverbMix: 0.08, reverbSize: 0.5 },
    bright: [0.7, 1.0],
  },
  {
    id: 'chill',
    trim: 0.83,
    name: 'Chill',
    blurb: 'lo-fi chillwave: seventh chords, swung beat',
    bpm: [78, 92],
    scales: ['dorian', 'ionian', 'mixolydian'],
    pent: true,
    chordBars: 1,
    stay: 0.1,
    sevenths: 0.85,
    sus: 0.1,
    starts: [0, 1, 3, 5],
    patches: { pad: 'padFM', bass: 'bassSub', arp: 'arpPluck', lead: 'leadClarinet' },
    layerProb: { pad: 1.0, bass: 0.9, arp: 0.35, lead: 0.7, drums: 0.9 },
    bass: { mode: 'walk' },
    arp: { mode: 'updown', rate: 2, octaves: 2, vel: 0.35, gate: 1.0 },
    lead: { density: 0.22, vel: 0.6, minGap: 2 },
    drums: { kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'eighth', ghost: 0.2, level: 0.75 },
    swing: 0.18,
    fx: { delayBeats: 0.75, delayFb: 0.4, delayMix: 0.25, reverbMix: 0.3, reverbSize: 0.82 },
    bright: [0.3, 0.65],
  },
  {
    id: 'epic',
    trim: 1.34,
    name: 'Epic',
    blurb: 'cinematic: big saw pads, rising arps, toms',
    bpm: [70, 90],
    scales: ['harmonicMinor', 'aeolian', 'dorian'],
    pent: false,
    chordBars: 1,
    stay: 0.1,
    sevenths: 0.15,
    sus: 0.05,
    starts: [0, 0, 5],
    patches: { pad: 'padStrings', bass: 'bassSaw', arp: 'arpSaw', lead: 'leadTrumpet' },
    layerProb: { pad: 1.0, bass: 0.85, arp: 0.7, lead: 0.65, drums: 0.55 },
    bass: { mode: 'pulse' },
    arp: { mode: 'up', rate: 2, octaves: 3, vel: 0.4, gate: 0.9 },
    lead: { density: 0.14, vel: 0.75, minGap: 4 },
    drums: { kick: 'x.......x.x.....', snare: '............x...', hat: null, ghost: 0.0, level: 0.9 },
    swing: 0,
    fx: { delayBeats: 0.75, delayFb: 0.4, delayMix: 0.2, reverbMix: 0.4, reverbSize: 0.92 },
    bright: [0.4, 0.85],
  },
  {
    id: 'smoke',
    trim: 1.67,
    name: 'Smoke',
    blurb: 'late-night jazz: sax, walking bass, swung brushes',
    bpm: [68, 94],
    scales: ['dorian', 'mixolydian', 'aeolian'],
    pent: false,
    chordBars: 1,
    stay: 0.05,
    sevenths: 0.95,
    sus: 0.1,
    starts: [0, 1, 3, 5],
    patches: { pad: 'padFM', bass: 'bassUpright', arp: 'arpVibes', lead: 'leadSax' },
    layerProb: { pad: 0.95, bass: 0.95, arp: 0.25, lead: 0.95, drums: 0.9 },
    bass: { mode: 'walk' },
    arp: { mode: 'updown', rate: 2, octaves: 2, vel: 0.3, gate: 1.1 },
    lead: { density: 0.3, vel: 0.7, minGap: 1, lo: 55, hi: 80 },
    drums: { kick: 'x.......x.......', snare: '....x.......x...', hat: 'eighth', ghost: 0.25, level: 0.45 },
    swing: 0.05,
    swing8: 0.6,
    fx: { delayBeats: 0.75, delayFb: 0.3, delayMix: 0.15, reverbMix: 0.3, reverbSize: 0.8 },
    bright: [0.4, 0.75],
  },
  {
    id: 'techno',
    trim: 1.25,
    name: 'Techno',
    blurb: 'hard techno: kick on every beat, acid bass, 16th hats, stabs',
    bpm: [128, 146],
    scales: ['phrygian', 'aeolian', 'phrygian'],
    pent: false,
    chordBars: 2,
    stay: 0.75, // mostly sits on the root: hypnotic, not melodic
    sevenths: 0.0,
    sus: 0.0,
    starts: [0, 0, 0],
    patches: { pad: 'padDark', bass: 'bassAcid', arp: 'arpStab', lead: 'leadSaw' },
    layerProb: { pad: 0.5, bass: 1.0, arp: 0.8, lead: 0.2, drums: 1.0 },
    introDrums: true,
    bass: { mode: 'acid' },
    arp: { mode: 'seq', rate: 2, octaves: 2, vel: 0.4, gate: 0.5 },
    lead: { density: 0.12, vel: 0.6, minGap: 2, lo: 60, hi: 84 },
    drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'sixteenth', ghost: 0.0, level: 1.0 },
    swing: 0,
    fx: { delayBeats: 0.75, delayFb: 0.4, delayMix: 0.18, reverbMix: 0.14, reverbSize: 0.65 },
    bright: [0.45, 1.0],
  },
  {
    id: 'anime',
    trim: 1.1,
    name: 'Anime',
    blurb: 'anime opening: bright, fast, soaring melody, sometimes Japanese scales',
    bpm: [156, 176],
    scales: ['ionian', 'lydian', 'mixolydian'],
    pent: false,
    orient: 0.3, // share of places that get a Japanese scale (default styles: 0.12)
    orientJp: true,
    chordBars: 1,
    stay: 0.05,
    sevenths: 0.2,
    sus: 0.12,
    starts: [3, 4, 0, 5], // IV V I vi: the "royal road" openings
    patches: { pad: 'padStrings', bass: 'bassPulse', arp: 'arpPluck', lead: 'leadFM' },
    layerProb: { pad: 0.85, bass: 0.9, arp: 0.9, lead: 0.85, drums: 0.95 },
    bass: { mode: 'octave' },
    arp: { mode: 'updown', rate: 2, octaves: 2, vel: 0.46, gate: 0.8 },
    lead: { density: 0.36, vel: 0.72, minGap: 1, lo: 64, hi: 90 },
    drums: { kick: 'x.....x...x.x...', snare: '....x.......x...', hat: 'eighth', ghost: 0.12, level: 0.95 },
    swing: 0,
    fx: { delayBeats: 0.75, delayFb: 0.3, delayMix: 0.16, reverbMix: 0.26, reverbSize: 0.8 },
    bright: [0.6, 1.0],
  },
];
