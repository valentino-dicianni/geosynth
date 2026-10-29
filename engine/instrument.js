// Procedural lead instrument: a complete synth patch (see patches.js for the
// fields) generated from a seed, so every place gets its own instrument.
//
// An instrument is a combination of independent choices: oscillator (saw,
// pulse, triangle, FM, reed, organ), envelope (plucked or sustained), filter
// movement, vibrato, vowel-like formants, breath, pitch scoop, effect sends
// and register. The choices are correlated just enough to keep the result
// musical. Pure function of the Rng: same seed, same instrument.

import { SynthVoice } from './voices.js';

const fr = (r, lo, hi) => lo + r.float() * (hi - lo);

// Loudness matching. Random parameters change the level a lot (a plucked FM
// bell versus a sustained organ), so each new instrument is rendered briefly
// at a low sample rate and its gain set so it sits at the level of the
// built-in leads. About 1 ms of work, once per place change.
const PROBE_SR = 16000;
const PROBE_N = 5600; // 0.35 s
const PROBE_GATE = 3200; // note held for 0.2 s
export const TARGET_DB = -21.2; // measured on the built-in leads with probeDb()
let probe = null;
let probePeak = 0; // peak of the last probeDb() call

// Mean power (dB) of one note of a patch, as heard through the probe.
export function probeDb(patch, note) {
  if (!probe) {
    probe = {
      v: new SynthVoice(PROBE_SR),
      L: new Float32Array(PROBE_N),
      R: new Float32Array(PROBE_N),
      REV: new Float32Array(PROBE_N),
      DLY: new Float32Array(PROBE_N),
    };
  }
  const { v, L, R, REV, DLY } = probe;
  L.fill(0);
  R.fill(0);
  REV.fill(0);
  DLY.fill(0);
  v.start(note, 0.7, PROBE_GATE, patch, 0.5, 0, 0.3);
  for (let o = 0; o < PROBE_N; o += 128) v.render(Math.min(128, PROBE_N - o), o, L, R, REV, DLY);
  let sum = 0;
  let pk = 0;
  for (let i = 0; i < PROBE_N; i++) {
    const x = L[i] + R[i];
    sum += x * x;
    if (x > pk) pk = x;
    else if (-x > pk) pk = -x;
  }
  probePeak = pk;
  return 10 * Math.log10(sum / PROBE_N + 1e-12);
}

export function makeInstrument(r) {
  const wave = r.pick(['saw', 'saw', 'pulse', 'tri', 'fm', 'fm', 'reed', 'organ']);
  const plucked = r.chance(0.4);
  const p = { wave, detune: 0, osc2: false, sub: 0, res: 0, key: fr(r, 0.2, 0.7), pwm: 0 };

  // Oscillator.
  if (wave === 'saw' || wave === 'pulse') {
    if (r.chance(0.6)) {
      p.osc2 = true;
      p.detune = fr(r, 4, 18);
    }
  }
  if (wave === 'pulse') {
    p.pw = fr(r, 0.15, 0.5);
    if (r.chance(0.6)) {
      p.pwm = fr(r, 0.05, 0.22);
      p.pwmRate = fr(r, 0.3, 3.5);
    }
  }
  if (wave === 'fm') {
    p.fmRatio = r.pick([0.5, 1, 1, 2, 2, 3, 3.5, 4, 5]);
    p.fmIndex = fr(r, 0.3, 3);
    p.fmDecay = plucked ? fr(r, 0.12, 0.5) : fr(r, 0.6, 2);
  }
  if (r.chance(0.25)) p.sub = fr(r, 0.15, 0.45);

  // Filter.
  p.cut = fr(r, 1200, 6500);
  p.fenv = r.chance(0.7) ? fr(r, 500, 4000) : 0;
  p.fdec = fr(r, 0.06, 0.6);
  p.res = r.chance(0.5) ? fr(r, 0, 0.45) : 0.05;
  if (wave === 'saw' && !plucked && r.chance(0.3)) {
    // Brass-like: the filter opens after the attack.
    p.cut = fr(r, 700, 1200);
    p.fenv = fr(r, 2500, 4500);
    p.fRise = fr(r, 0.04, 0.12);
    p.fdec = 1;
  }

  // Envelope.
  if (plucked) {
    p.a = fr(r, 0.002, 0.012);
    p.d = fr(r, 0.12, 0.6);
    p.s = fr(r, 0, 0.15);
    p.r = fr(r, 0.12, 0.5);
  } else {
    p.a = fr(r, 0.01, 0.18);
    p.d = fr(r, 0.1, 0.4);
    p.s = fr(r, 0.6, 0.95);
    p.r = fr(r, 0.08, 0.5);
  }

  // Vibrato.
  if (r.chance(plucked ? 0.25 : 0.75)) {
    p.vib = fr(r, 5, 24);
    p.vibRate = fr(r, 4.6, 6.4);
    p.vibDelay = fr(r, 0.1, 0.5);
  }

  // Vowel-like formants and breath (not for FM or organ, which have their own timbre).
  if (wave !== 'fm' && wave !== 'organ' && r.chance(0.45)) {
    const f1 = fr(r, 380, 900);
    const f2 = f1 * fr(r, 1.8, 3.2);
    p.formants = [
      [f1, fr(r, 2, 5), 1],
      [f2, fr(r, 2.5, 5), fr(r, 0.3, 0.6)],
      [f2 * fr(r, 1.3, 1.9), fr(r, 3, 6), fr(r, 0.1, 0.3)],
    ];
    p.dry = fr(r, 0.15, 0.55);
  }
  p.breath = r.chance(0.5) ? fr(r, 0.01, 0.12) : 0;
  if (!plucked && r.chance(0.3)) {
    p.scoop = fr(r, 15, 60);
    p.scoopDec = fr(r, 0.04, 0.1);
  }

  // Space and register.
  p.rev = fr(r, 0.2, 0.55);
  p.dly = fr(r, 0.1, 0.45);
  p.pan = fr(r, 0, 0.4);
  const reg = r.pick([[48, 72], [55, 79], [60, 84], [67, 93]]);
  p.lo = reg[0];
  p.hi = reg[1];

  // Gain: render two notes of the register and scale to the target level.
  p.gain = 0.2;
  const mid = (p.lo + p.hi) >> 1;
  const db1 = probeDb(p, mid);
  const pk1 = probePeak;
  const db2 = probeDb(p, mid - 7);
  const peak = Math.max(pk1, probePeak, 1e-6);
  let g = 0.2 * Math.pow(10, (TARGET_DB - 0.5 * (db1 + db2)) / 20);
  g = Math.min(g, (0.2 * 0.5) / peak); // a single note never peaks above ~0.5
  p.gain = Math.max(0.04, Math.min(0.9, g));
  p.name = describe(p, plucked);
  return p;
}

// A small variation of an instrument for each song section (the same
// instrument, slightly brighter or duller, a different amount of vibrato).
export function morphInstrument(base, r) {
  const m = { ...base };
  m.cut = base.cut * fr(r, 0.75, 1.3);
  if (base.fmIndex !== undefined) m.fmIndex = base.fmIndex * fr(r, 0.8, 1.25);
  if (base.vib !== undefined) m.vib = base.vib * fr(r, 0.7, 1.3);
  return m;
}

// Short human-readable description, e.g. "plucked FM bell, airy".
function describe(p, plucked) {
  let body;
  switch (p.wave) {
    case 'fm':
      body = p.fmRatio >= 3.4 ? 'FM bell' : 'FM tone';
      break;
    case 'saw':
      body = p.fRise ? 'brass' : 'saw';
      break;
    case 'pulse':
      body = p.pwm ? 'pulse (moving)' : 'pulse';
      break;
    case 'tri':
      body = 'flute-like tone';
      break;
    case 'reed':
      body = 'reed';
      break;
    default:
      body = 'organ';
  }
  const shape = plucked ? 'plucked' : p.a > 0.08 ? 'swelling' : 'sustained';
  const extra = [];
  if (p.formants) extra.push('vocal');
  if (p.breath > 0.06) extra.push('airy');
  if (p.scoop) extra.push('scooped');
  if (p.vib) extra.push('vibrato');
  if (p.osc2 && p.detune > 10) extra.push('wide');
  return `${shape} ${body}` + (extra.length ? ', ' + extra.slice(0, 2).join(', ') : '');
}
