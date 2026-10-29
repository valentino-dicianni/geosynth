// Procedural composer. Pure function of (seed, bar count): no audio, no
// floating-point state that depends on the platform beyond IEEE basics, and
// every random draw comes from a seeded stream, so the same seed always
// produces the same music.
//
// nextBar() returns a plan for one bar (16 sixteenth-note steps):
//   steps[s] = array of note events { voice, note, vel, len }
// voices: pad, bass, arp, lead, kick, snare, hat, tom

import { stream, mix32 } from './rng.js';
import {
  SCALES,
  PENT,
  STYLES,
  NOTE_NAMES,
  scaleNote,
  nearestIdx,
  chordTones,
  fold,
  makeProgression,
  pat,
} from './theory.js';

export const STEPS_PER_BAR = 16;
const MAX_BPM_STEP = 12;
// At full speed (100 km/h) every style reaches at least this tempo, so a slow
// style like Abyss does not top out at 70 bpm.
export const FOLLOW_TOP_BPM = 160;
export const BPM_MIN = 40;
export const BPM_MAX = 220;
const METER = [1, 0.15, 0.3, 0.15, 0.6, 0.15, 0.3, 0.15, 0.8, 0.15, 0.3, 0.15, 0.6, 0.15, 0.3, 0.15];
const LAYERS = ['pad', 'bass', 'arp', 'lead', 'drums'];

export class Composer {
  constructor() {
    this.pending = null;
    this.s = null;
    this.barCount = 0;
    this.leadOv = null;
    this.tempoFactor = null;
    this.tempoOv = null;
    this.curBpm = null;
  }

  // seed: { style: -1 (auto) | index, coarse: u32, fine: u32 }
  setSeed(seed) {
    this.pending = { style: seed.style, coarse: seed.coarse >>> 0, fine: seed.fine >>> 0 };
  }

  hasPending() {
    return this.pending !== null;
  }

  // Tempo follows movement: factor 0..1 maps across the style's tempo range
  // (a little beyond it at both ends). null = use the tempo from the seed.
  // Applied gradually at bar lines (see nextBar).
  setTempoFactor(f) {
    this.tempoFactor = f === null || f === undefined ? null : Math.max(0, Math.min(1, f));
  }

  // Manual tempo (BPM slider): wins over movement and the seed, and applies at
  // once rather than being slewed. null returns to movement/seed tempo.
  setTempoOverride(bpm) {
    if (bpm === null || bpm === undefined || !Number.isFinite(bpm)) {
      this.tempoOv = null;
      return;
    }
    this.tempoOv = Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(bpm)));
    this.curBpm = this.tempoOv;
  }

  // Force the lead line on (the user picked a lead instrument) and keep it in
  // that instrument's range. ov = { lo, hi } midi notes, or null for the
  // style's own arrangement.
  setLeadOverride(ov) {
    this.leadOv = ov ? { lo: ov.lo, hi: ov.hi } : null;
  }

  info() {
    const s = this.s;
    if (!s) return null;
    return {
      style: s.styleIdx,
      styleName: s.style.name,
      key: NOTE_NAMES[s.pc],
      scale: s.scaleName,
      bpm: this.curBpm === null ? s.bpm : this.curBpm,
    };
  }

  // ---------------------------------------------------------------- latching

  _latch(seed) {
    const prev = this.s;
    const styleIdx =
      seed.style >= 0 && seed.style < STYLES.length
        ? seed.style
        : mix32(seed.coarse ^ 0x57) % STYLES.length;
    const style = STYLES[styleIdx];
    const full = !prev || prev.styleIdx !== styleIdx || prev.coarse !== seed.coarse;
    if (full) this.curBpm = null; // new place/style: take its tempo straight away

    const s = {
      styleIdx,
      style,
      coarse: seed.coarse,
      fine: seed.fine,
      sectionIdx: 0,
      barInSection: 0,
      sectionBars: 0,
      prog: [0, 0, 0, 0],
      motifSeed: 1,
      layers: {},
      bright: 0.5,
      densMul: 1,
      groove: null,
      seqPat: [],
      seqGate: [],
      answer: false,
      leadMidi: 74,
      hum: stream(seed.fine, 77),
    };

    // Key, mode and tempo come from the coarse cell (stable over ~10 km).
    const kr = stream(seed.coarse, 11);
    s.pc = kr.below(12);
    s.scaleName = style.scales[kr.below(style.scales.length)];
    s.scale = SCALES[s.scaleName];
    if (style.pent && s.scaleName !== 'harmonicMinor') {
      const major = ['ionian', 'lydian', 'mixolydian'].includes(s.scaleName);
      s.melScale = major ? PENT.major : PENT.minor;
    } else {
      s.melScale = s.scale;
    }
    s.bpm = style.bpm[0] + kr.below(style.bpm[1] - style.bpm[0] + 1);

    s.sectionBars = 8 * style.chordBars;
    this.s = s;
    this._newSection(full);
  }

  _newSection(intro) {
    const s = this.s;
    const style = s.style;
    const secSeed = mix32((s.fine ^ Math.imul(s.sectionIdx + 1, 0x9e3779b1)) >>> 0);
    const r = stream(secSeed, 1);

    // Harmony: keep the last progression 40% of the time so ideas come back.
    const keepProg = s.sectionIdx > 0 && r.chance(0.4);
    const pr = stream(secSeed, 2);
    if (!keepProg) {
      s.prog = makeProgression(pr, s.scaleName, 4, style.stay, style.starts);
    }
    if (!(s.sectionIdx > 0 && r.chance(0.5))) s.motifSeed = stream(secSeed, 3).next();
    s.answer = r.chance(0.6);

    // Arrangement: which layers play in this section.
    const layers = {};
    if (intro) {
      const cand = ['pad', 'bass', 'arp']
        .map((n) => [n, style.layerProb[n]])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2);
      for (const n of LAYERS) layers[n] = false;
      for (const [n] of cand) layers[n] = true;
      if (style.introDrums) layers.drums = true; // e.g. techno opens with the kick
    } else {
      let count = 0;
      for (const n of LAYERS) {
        layers[n] = r.chance(style.layerProb[n]);
        if (layers[n]) count++;
      }
      if (count < 2) {
        const top = LAYERS.map((n) => [n, style.layerProb[n]])
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2);
        for (const [n] of top) layers[n] = true;
      }
    }
    if (!style.drums) layers.drums = false;
    s.layers = layers;

    s.bright = style.bright[0] + r.float() * (style.bright[1] - style.bright[0]);
    s.densMul = 0.6 + r.float() * 0.8;

    // Drum groove for the whole section.
    if (style.drums) {
      const d = style.drums;
      const kick = style.drums.kick ? pat(d.kick) : [];
      const gr = stream(secSeed, 4);
      for (const g of [3, 7, 10, 11, 14, 15]) {
        if (gr.chance(d.ghost * 0.4) && !kick.includes(g)) kick.push(g);
      }
      s.groove = { kick, snare: d.snare ? pat(d.snare) : [] };
    }

    // Arpeggio "seq" mode pattern.
    const sr = stream(secSeed, 5);
    s.seqPat = [];
    s.seqGate = [];
    for (let i = 0; i < 16; i++) {
      s.seqPat.push(sr.below(6));
      s.seqGate.push(sr.chance(0.78) ? 1 : 0);
    }

    s.barInSection = 0;
    s.secSeed = secSeed;
  }

  // ---------------------------------------------------------------- planning

  nextBar() {
    if (this.pending) {
      this._latch(this.pending);
      this.pending = null;
      this.barCount = 0;
    } else if (!this.s) {
      this._latch({ style: -1, coarse: 1, fine: 1 });
    }
    let s = this.s;
    if (s.barInSection >= s.sectionBars) {
      s.sectionIdx++;
      this._newSection(false);
    }

    const style = s.style;

    // Tempo: from the seed, or following movement speed. Moves at most
    // MAX_BPM_STEP per bar so changes feel like accelerating, not jumping.
    let targetBpm = s.bpm;
    if (this.tempoFactor !== null) {
      const lo = style.bpm[0] * 0.9;
      const hi = Math.max(style.bpm[1] * 1.1, FOLLOW_TOP_BPM);
      targetBpm = Math.round(lo + this.tempoFactor * (hi - lo));
    }
    if (this.tempoOv !== null) this.curBpm = this.tempoOv;
    else if (this.curBpm === null) this.curBpm = targetBpm;
    else this.curBpm += Math.max(-MAX_BPM_STEP, Math.min(MAX_BPM_STEP, targetBpm - this.curBpm));

    const cb = style.chordBars;
    const j = s.barInSection;
    const prog = s.prog;
    const progLen = 4 * cb;
    const jj = j % progLen;
    const chordIdx = Math.floor(jj / cb);
    const posInChord = jj % cb;
    const repeat = Math.floor(j / progLen);
    const nextChordIdx = (chordIdx + (posInChord === cb - 1 ? 1 : 0)) % 4;
    const degree = prog[chordIdx];
    const nextDegree = prog[nextChordIdx];
    const lastBar = j === s.sectionBars - 1;

    const rr = stream(s.secSeed, 200 + j);
    const opts = {
      seventh: stream(s.secSeed, 300 + chordIdx).chance(style.sevenths),
      sus: null,
    };
    const susR = stream(s.secSeed, 400 + chordIdx);
    if (susR.chance(style.sus)) opts.sus = susR.chance(0.5) ? '2' : '4';
    const tones = chordTones(s.scale, degree, opts);

    const steps = [];
    for (let i = 0; i < STEPS_PER_BAR; i++) steps.push([]);
    const L = s.layers;
    const hum = s.hum;

    // ---- pad
    if (L.pad && posInChord === 0) {
      const notes = tones.map((t) => fold(48 + s.pc + t, 55)).sort((a, b) => a - b);
      if (!L.bass) notes.unshift(fold(48 + s.pc + tones[0], 43));
      for (const n of notes) {
        steps[0].push({ voice: 'pad', note: n, vel: 0.5 + hum.float() * 0.08, len: STEPS_PER_BAR * cb });
      }
    }

    // ---- bass
    if (L.bass) this._planBass(steps, s, tones, degree, nextDegree, posInChord, rr, hum);

    // ---- arp
    if (L.arp) this._planArp(steps, s, tones, j, hum);

    // ---- lead
    if (L.lead || this.leadOv) this._planLead(steps, s, tones, j, jj, repeat, progLen, cb, lastBar);

    // ---- drums
    if (L.drums && style.drums) this._planDrums(steps, s, j, lastBar, rr, hum);

    const t = s.sectionBars > 1 ? j / (s.sectionBars - 1) : 0;
    const plan = {
      steps,
      bpm: this.curBpm,
      swing: style.swing,
      swing8: style.swing8 || 0,
      fx: style.fx,
      patches: style.patches,
      bright: s.bright * (0.78 + 0.22 * t),
      bar: this.barCount,
      section: s.sectionIdx,
      chordDegree: degree,
      trim: style.trim || 1,
      duck: L.drums && style.drums ? 0.4 : 0,
      layers: { ...L, lead: !!(L.lead || this.leadOv) },
    };
    s.barInSection++;
    this.barCount++;
    return plan;
  }

  _planBass(steps, s, tones, degree, nextDegree, posInChord, rr, hum) {
    const style = s.style;
    const cb = style.chordBars;
    const root = fold(36 + s.pc + s.scale[degree], 36);
    const mode = style.bass.mode;
    const push = (st, note, vel, len) =>
      steps[st].push({ voice: 'bass', note, vel: vel * (0.92 + hum.float() * 0.08), len });
    if (mode === 'sub' || mode === 'drone') {
      if (posInChord === 0) push(0, root, 0.8, STEPS_PER_BAR * cb - 0.5);
    } else if (mode === 'pulse') {
      const fifth = rr.chance(0.3);
      for (let st = 0; st < 16; st += 2) {
        const n = st === 14 && fifth ? root + 7 : root;
        push(st, n, st % 8 === 0 ? 0.85 : 0.65, 1.7);
      }
    } else if (mode === 'offbeat') {
      for (let st = 2; st < 16; st += 4) push(st, root, 0.8, 1.6);
    } else if (mode === 'octave') {
      for (let st = 0; st < 16; st += 2) push(st, st % 4 === 2 ? root + 12 : root, 0.7, 1.2);
    } else if (mode === 'acid') {
      // 16th-note acid line. The kick owns the beat, so the bass plays the gaps;
      // the section's random pattern picks which gaps, which note and which
      // steps are accented (and open the filter wider).
      const third = fold(36 + s.pc + tones[1], 36);
      const fifth = fold(36 + s.pc + tones[2], 36);
      const pick = [root, root, root + 12, third, fifth, root + 12];
      for (let st = 0; st < 16; st++) {
        if (st % 4 === 0 || !s.seqGate[st]) continue;
        const k = s.seqPat[(st * 5 + 3) & 15];
        push(st, pick[k], k >= 4 ? 0.95 : 0.66, 1.3);
      }
    } else if (mode === 'walk') {
      const nextRoot = fold(36 + s.pc + s.scale[nextDegree], 36);
      const third = root + (s.scale[(degree + 2) % 7] - s.scale[degree] + 12) % 12;
      const fifth = root + 7;
      const approach = nextRoot + (rr.chance(0.5) ? -1 : 1);
      const seq = [root, rr.chance(0.5) ? third : fifth, fifth, approach];
      for (let i = 0; i < 4; i++) push(i * 4, seq[i], i === 0 ? 0.85 : 0.65, 3.6);
    }
  }

  _planArp(steps, s, tones, j, hum) {
    const a = s.style.arp;
    const rate = a.rate;
    const pool = [];
    const base = tones.map((t) => fold(48 + s.pc + t, 60)).sort((x, y) => x - y);
    for (let o = 0; o < a.octaves; o++) for (const n of base) pool.push(n + 12 * o);
    const N = pool.length;
    const ar = stream(s.secSeed, 500 + j);
    for (let st = 0, k = 0; st < 16; st += rate, k++) {
      // Draw unconditionally so patterns stay in sync when options change.
      const pick = ar.below(N);
      const skip = ar.float();
      let idx;
      let play = true;
      switch (a.mode) {
        case 'up':
          idx = k % N;
          break;
        case 'down':
          idx = N - 1 - (k % N);
          break;
        case 'updown': {
          const period = Math.max(1, 2 * N - 2);
          const m = k % period;
          idx = m < N ? m : period - m;
          break;
        }
        case 'seq':
          idx = s.seqPat[st] % N;
          play = s.seqGate[st] === 1;
          break;
        default:
          idx = pick;
          play = skip > 0.3;
      }
      if (!play) continue;
      const accent = st % 4 === 0 ? 1.12 : 0.92;
      steps[st].push({
        voice: 'arp',
        note: pool[idx],
        vel: a.vel * accent * (0.9 + hum.float() * 0.1),
        len: rate * a.gate,
      });
    }
  }

  _planLead(steps, s, tones, j, jj, repeat, progLen, cb, lastBar) {
    const style = s.style;
    const key = repeat === 1 && jj === progLen - 1 && s.answer ? 99 : jj % (2 * cb);
    const r = stream(s.motifSeed, 31 * key + 7);
    let dens = Math.min(0.9, style.lead.density * s.densMul);
    if (this.leadOv) dens = Math.max(dens, 0.26);
    const mel = s.melScale;
    const origin = 48 + s.pc;
    const lo = this.leadOv ? this.leadOv.lo : style.lead.lo || 62;
    const hi = this.leadOv ? this.leadOv.hi : style.lead.hi || 88;

    // Chord tones across the lead register, as midi notes.
    const ctMidi = [];
    for (let o = -2; o <= 4; o++) for (const t of tones) ctMidi.push(origin + t + 12 * o);
    const nearestChordTone = (m) => {
      let best = ctMidi[0];
      let bd = 1e9;
      for (const c of ctMidi) {
        const d = Math.abs(c - m);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      return best;
    };

    const hits = [];
    let last = -99;
    let idx = nearestIdx(mel, s.leadMidi - origin);
    const deltas = [-3, -2, -2, -1, -1, -1, 0, 1, 1, 1, 2, 2, 3];
    for (let st = 0; st < 16; st++) {
      const chance = r.float();
      const delta = deltas[r.below(deltas.length)];
      const snap = r.float();
      const velJ = r.float();
      const p = Math.min(1, dens * 3.2 * METER[st]);
      if (chance < p && st - last >= style.lead.minGap) {
        let m = origin + scaleNote(mel, idx + delta);
        idx += delta;
        if (hits.length === 0 || (st % 4 === 0 && snap < 0.65)) {
          m = nearestChordTone(m);
          idx = nearestIdx(mel, m - origin);
        }
        while (m > hi) {
          idx -= mel.length;
          m -= 12;
        }
        while (m < lo) {
          idx += mel.length;
          m += 12;
        }
        hits.push({ st, m, vel: style.lead.vel * (METER[st] > 0.5 ? 1 : 0.85) * (0.88 + velJ * 0.12) });
        last = st;
      }
    }
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      const next = i + 1 < hits.length ? hits[i + 1].st : 16;
      const len = Math.max(1, Math.min(next - h.st, 8) * 0.92);
      steps[h.st].push({ voice: 'lead', note: h.m, vel: h.vel, len });
      s.leadMidi = h.m;
    }
  }

  _planDrums(steps, s, j, lastBar, rr, hum) {
    const d = s.style.drums;
    const lvl = d.level;
    const g = s.groove;
    const add = (st, voice, note, vel, len) =>
      steps[st].push({ voice, note, vel: Math.min(1, vel * lvl * (0.93 + hum.float() * 0.07)), len: len || 1 });

    for (const st of g.kick) add(st, 'kick', 36, [0, 8].includes(st) || st % 4 === 0 ? 1.0 : 0.6);
    for (const st of g.snare) {
      if (lastBar && st === 12) continue;
      add(st, 'snare', 38, 0.85);
    }
    const hat = d.hat;
    if (hat === 'eighth') {
      for (let st = 0; st < 16; st += 2) add(st, 'hat', 42, st % 4 === 2 ? 0.55 : 0.35);
    } else if (hat === 'offbeat') {
      for (let st = 2; st < 16; st += 4) add(st, 'hat', 46, 0.5, 2);
    } else if (hat === 'sixteenth') {
      // Closed 16ths with an open hat on every off-beat eighth.
      for (let st = 0; st < 16; st++) {
        if (st % 4 === 2) add(st, 'hat', 46, 0.5, 2);
        else add(st, 'hat', 42, st % 2 ? 0.22 : 0.34);
      }
    } else if (hat === 'sparse') {
      for (let st = 0; st < 16; st += 2) if (rr.chance(0.35)) add(st, 'hat', 42, 0.3);
    }
    if (lastBar) {
      // Fill: snare roll, or toms when the style has no snare.
      if (d.snare && s.style.id !== 'epic') {
        for (let k = 0; k < 4; k++) add(12 + k, 'snare', 38, 0.5 + k * 0.14);
      } else {
        const toms = [50, 47, 45, 43];
        for (let k = 0; k < 4; k++) add(12 + k, 'tom', toms[k], 0.7 + k * 0.08, 2);
      }
    }
  }
}
