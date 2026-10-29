// Patch table. Times in seconds, frequencies in Hz, detune in cents.
//   wave   : 'saw' | 'pulse' | 'sine' | 'tri' | 'fm'
//   osc2   : optional second oscillator (same wave) detuned by `detune` cents
//   sub    : level of a sine one octave below
//   cut    : base filter cutoff (Hz, scaled by the bright macro)
//   fenv   : added cutoff (Hz) at envelope peak, decaying over fdec seconds
//   key    : how much the cutoff follows pitch (0..1)
//   res    : filter resonance 0..0.95
//   fm*    : ratio / index / decay for the 'fm' wave
//   vib    : vibrato depth in cents, vibRate in Hz
//   pwm    : pulse-width LFO depth, pwmRate in Hz
//   rev/dly: effect sends, pan: stereo spread (0 = centre)

export const PATCHES = {
  padSoft: { wave: 'saw', detune: 9, osc2: true, sub: 0, cut: 1300, fenv: 0, fdec: 1, key: 0.3, res: 0.1,
    a: 0.9, d: 1.5, s: 0.8, r: 2.5, gain: 0.2, rev: 0.6, dly: 0.12, pan: 0.5, pwm: 0 },
  padDark: { wave: 'saw', detune: 14, osc2: true, sub: 0.3, cut: 620, fenv: 300, fdec: 2, key: 0.2, res: 0.2,
    a: 1.6, d: 2, s: 0.7, r: 3.5, gain: 0.22, rev: 0.6, dly: 0.1, pan: 0.6, pwm: 0 },
  padSaw: { wave: 'saw', detune: 12, osc2: true, sub: 0, cut: 2400, fenv: 1500, fdec: 0.9, key: 0.4, res: 0.12,
    a: 0.25, d: 1, s: 0.75, r: 1.2, gain: 0.17, rev: 0.35, dly: 0.1, pan: 0.5, pwm: 0 },
  padFM: { wave: 'fm', fmRatio: 1, fmIndex: 1.6, fmDecay: 0.9, detune: 0, osc2: false, sub: 0, cut: 6000, fenv: 0,
    fdec: 1, key: 0, res: 0, a: 0.01, d: 1.8, s: 0.3, r: 0.8, gain: 0.22, rev: 0.35, dly: 0.2, pan: 0.3, pwm: 0 },
  padPulse: { wave: 'pulse', pw: 0.3, detune: 7, osc2: true, sub: 0, cut: 3500, fenv: 0, fdec: 1, key: 0.3, res: 0.05,
    a: 0.02, d: 0.3, s: 0.5, r: 0.15, gain: 0.1, rev: 0.1, dly: 0.1, pan: 0.4, pwm: 0.12, pwmRate: 0.6 },

  bassSub: { wave: 'sine', detune: 0, osc2: false, sub: 0.35, cut: 500, fenv: 0, fdec: 1, key: 0, res: 0,
    a: 0.02, d: 0.3, s: 0.9, r: 0.4, gain: 0.45, rev: 0, dly: 0, pan: 0, pwm: 0 },
  bassSaw: { wave: 'saw', detune: 0, osc2: false, sub: 0.5, cut: 420, fenv: 1300, fdec: 0.18, key: 0.2, res: 0.3,
    a: 0.004, d: 0.2, s: 0.55, r: 0.12, gain: 0.3, rev: 0, dly: 0, pan: 0, pwm: 0 },
  bassPulse: { wave: 'pulse', pw: 0.4, detune: 0, osc2: false, sub: 0.4, cut: 600, fenv: 900, fdec: 0.1, key: 0.2,
    res: 0.35, a: 0.003, d: 0.15, s: 0.4, r: 0.08, gain: 0.3, rev: 0, dly: 0, pan: 0, pwm: 0 },

  arpPluck: { wave: 'saw', detune: 8, osc2: true, sub: 0, cut: 1800, fenv: 3000, fdec: 0.12, key: 0.5, res: 0.15,
    a: 0.003, d: 0.25, s: 0, r: 0.3, gain: 0.17, rev: 0.3, dly: 0.35, pan: 0.6, pwm: 0 },
  arpBell: { wave: 'fm', fmRatio: 3.5, fmIndex: 2, fmDecay: 0.7, detune: 0, osc2: false, sub: 0, cut: 9000, fenv: 0,
    fdec: 1, key: 0, res: 0, a: 0.004, d: 1.6, s: 0, r: 1.2, gain: 0.17, rev: 0.5, dly: 0.4, pan: 0.7, pwm: 0 },
  arpSaw: { wave: 'saw', detune: 0, osc2: false, sub: 0, cut: 1400, fenv: 3500, fdec: 0.1, key: 0.5, res: 0.3,
    a: 0.002, d: 0.18, s: 0.2, r: 0.15, gain: 0.14, rev: 0.2, dly: 0.3, pan: 0.5, pwm: 0 },
  arpPulse: { wave: 'pulse', pw: 0.25, detune: 0, osc2: false, sub: 0, cut: 3500, fenv: 1500, fdec: 0.08, key: 0.5,
    res: 0.1, a: 0.002, d: 0.12, s: 0.25, r: 0.08, gain: 0.13, rev: 0.12, dly: 0.25, pan: 0.5, pwm: 0.1, pwmRate: 2 },

  leadBell: { wave: 'fm', fmRatio: 2, fmIndex: 3, fmDecay: 1.0, detune: 0, osc2: false, sub: 0, cut: 9000, fenv: 0,
    fdec: 1, key: 0, res: 0, a: 0.005, d: 2.2, s: 0, r: 1.5, gain: 0.2, rev: 0.55, dly: 0.45, pan: 0.3, pwm: 0 },
  leadSaw: { wave: 'saw', detune: 7, osc2: true, sub: 0, cut: 2600, fenv: 1200, fdec: 0.3, key: 0.6, res: 0.2,
    a: 0.02, d: 0.3, s: 0.7, r: 0.35, gain: 0.15, rev: 0.3, dly: 0.35, pan: 0.2, pwm: 0, vib: 12, vibRate: 5.2 },
  leadPulse: { wave: 'pulse', pw: 0.5, detune: 0, osc2: false, sub: 0, cut: 5000, fenv: 0, fdec: 1, key: 0.4, res: 0.05,
    a: 0.005, d: 0.1, s: 0.6, r: 0.1, gain: 0.12, rev: 0.12, dly: 0.15, pan: 0.2, pwm: 0.15, pwmRate: 3.1, vib: 8, vibRate: 5.8 },
  leadFM: { wave: 'fm', fmRatio: 2, fmIndex: 2.2, fmDecay: 1.2, detune: 0, osc2: false, sub: 0, cut: 8000, fenv: 0,
    fdec: 1, key: 0, res: 0, a: 0.01, d: 1.0, s: 0.2, r: 0.6, gain: 0.18, rev: 0.45, dly: 0.3, pan: 0.2, pwm: 0 },

  // ---- Acoustic-style instruments -------------------------------------
  // formants: [freq Hz, Q, gain] band-pass bank; dry: unfiltered mix level;
  // breath: noise level; scoop: attack pitch bend in cents; vibDelay: seconds
  // before vibrato fades in; fRise: cutoff swell time (brass).
  leadSax: { wave: 'reed', detune: 0, osc2: false, sub: 0, cut: 5200, fenv: 1800, fdec: 0.25, key: 0.3, res: 0.05,
    formants: [[520, 2.2, 1.0], [1500, 3, 0.55], [2700, 4, 0.25]], dry: 0.4, breath: 0.07,
    a: 0.045, d: 0.3, s: 0.85, r: 0.14, gain: 0.36, rev: 0.3, dly: 0.2, pan: 0.15, pwm: 0,
    vib: 22, vibRate: 5.3, vibDelay: 0.35, scoop: 40, scoopDec: 0.07 },
  leadFlute: { wave: 'tri', detune: 0, osc2: false, sub: 0, cut: 3600, fenv: 600, fdec: 0.15, key: 0.5, res: 0,
    formants: [[900, 2, 0.25]], dry: 0.9, breath: 0.2,
    a: 0.06, d: 0.2, s: 0.9, r: 0.15, gain: 0.26, rev: 0.4, dly: 0.25, pan: 0.2, pwm: 0,
    vib: 16, vibRate: 5.0, vibDelay: 0.4 },
  leadClarinet: { wave: 'pulse', pw: 0.5, detune: 0, osc2: false, sub: 0, cut: 3200, fenv: 800, fdec: 0.2, key: 0.3, res: 0,
    formants: [[600, 2.5, 0.8], [1800, 3, 0.3]], dry: 0.5, breath: 0.04,
    a: 0.03, d: 0.25, s: 0.9, r: 0.1, gain: 0.19, rev: 0.3, dly: 0.2, pan: 0.15, pwm: 0,
    vib: 10, vibRate: 5.2, vibDelay: 0.5 },
  leadTrumpet: { wave: 'saw', detune: 0, osc2: false, sub: 0, cut: 900, fenv: 4200, fdec: 1, fRise: 0.05, key: 0.5, res: 0.05,
    formants: [[1100, 3, 0.8], [2400, 3.5, 0.4]], dry: 0.5, breath: 0.02,
    a: 0.03, d: 0.2, s: 0.8, r: 0.1, gain: 0.17, rev: 0.3, dly: 0.2, pan: 0.15, pwm: 0,
    vib: 9, vibRate: 5.6, vibDelay: 0.4, scoop: 30, scoopDec: 0.05 },
  leadVibes: { wave: 'fm', fmRatio: 3, fmIndex: 0.9, fmDecay: 0.45, detune: 0, osc2: false, sub: 0, cut: 9000, fenv: 0,
    fdec: 1, key: 0, res: 0, a: 0.003, d: 1.8, s: 0, r: 1.2, gain: 0.2, rev: 0.4, dly: 0.3, pan: 0.3, pwm: 0 },
  leadOrgan: { wave: 'organ', detune: 0, osc2: false, sub: 0, cut: 6000, fenv: 0, fdec: 1, key: 0, res: 0,
    a: 0.01, d: 0.05, s: 0.9, r: 0.08, gain: 0.16, rev: 0.25, dly: 0.15, pan: 0.2, pwm: 0,
    vib: 6, vibRate: 6.2, vibDelay: 0.1 },
  leadChoir: { wave: 'saw', detune: 10, osc2: true, sub: 0, cut: 4500, fenv: 0, fdec: 1, key: 0.2, res: 0,
    formants: [[800, 5, 1.0], [1150, 6, 0.6], [2900, 8, 0.25]], dry: 0.15, breath: 0.03,
    a: 0.25, d: 0.5, s: 0.8, r: 0.5, gain: 0.28, rev: 0.5, dly: 0.2, pan: 0.3, pwm: 0,
    vib: 10, vibRate: 5.0, vibDelay: 0.3 },

  padStrings: { wave: 'saw', detune: 16, osc2: true, sub: 0, cut: 2800, fenv: 0, fdec: 1, key: 0.4, res: 0.05,
    a: 0.4, d: 1.5, s: 0.85, r: 0.7, gain: 0.17, rev: 0.4, dly: 0.08, pan: 0.6, pwm: 0,
    vib: 5, vibRate: 5.1, vibDelay: 0.5 },
  padChoir: { wave: 'saw', detune: 10, osc2: true, sub: 0, cut: 4500, fenv: 0, fdec: 1, key: 0.2, res: 0,
    formants: [[700, 5, 1.0], [1100, 6, 0.6], [2800, 8, 0.25]], dry: 0.12, breath: 0.02,
    a: 0.6, d: 1.5, s: 0.8, r: 1.4, gain: 0.26, rev: 0.6, dly: 0.1, pan: 0.6, pwm: 0,
    vib: 9, vibRate: 5.0, vibDelay: 0.5 },
  bassUpright: { wave: 'saw', detune: 0, osc2: false, sub: 0.45, cut: 330, fenv: 700, fdec: 0.1, key: 0.3, res: 0.1,
    a: 0.006, d: 0.55, s: 0.12, r: 0.2, gain: 0.38, rev: 0, dly: 0, pan: 0, pwm: 0 },
  // Techno: resonant 303-style acid bass (cutoff snaps up and falls) and a short detuned stab.
  bassAcid: { wave: 'saw', detune: 0, osc2: false, sub: 0.3, cut: 280, fenv: 2300, fdec: 0.13, key: 0.2, res: 0.72,
    a: 0.003, d: 0.14, s: 0.3, r: 0.05, gain: 0.27, rev: 0, dly: 0.05, pan: 0, pwm: 0 },
  arpStab: { wave: 'saw', detune: 10, osc2: true, sub: 0, cut: 900, fenv: 2800, fdec: 0.09, key: 0.4, res: 0.25,
    a: 0.002, d: 0.13, s: 0, r: 0.1, gain: 0.16, rev: 0.3, dly: 0.4, pan: 0.5, pwm: 0 },
  arpVibes: { wave: 'fm', fmRatio: 3, fmIndex: 0.8, fmDecay: 0.5, detune: 0, osc2: false, sub: 0, cut: 9000, fenv: 0,
    fdec: 1, key: 0, res: 0, a: 0.003, d: 1.5, s: 0, r: 1, gain: 0.15, rev: 0.4, dly: 0.25, pan: 0.6, pwm: 0 },
};

// Instruments the user can pick for the lead line (null = the style decides).
export const LEAD_INSTRUMENTS = [
  { id: 'auto', name: 'Auto', patch: null },
  { id: 'sax', name: 'Saxophone', patch: 'leadSax', lo: 55, hi: 81 },
  { id: 'flute', name: 'Flute', patch: 'leadFlute', lo: 67, hi: 96 },
  { id: 'clarinet', name: 'Clarinet', patch: 'leadClarinet', lo: 55, hi: 91 },
  { id: 'trumpet', name: 'Trumpet', patch: 'leadTrumpet', lo: 60, hi: 84 },
  { id: 'vibes', name: 'Vibraphone', patch: 'leadVibes', lo: 60, hi: 96 },
  { id: 'organ', name: 'Organ', patch: 'leadOrgan', lo: 55, hi: 88 },
  { id: 'choir', name: 'Choir', patch: 'leadChoir', lo: 55, hi: 79 },
];
