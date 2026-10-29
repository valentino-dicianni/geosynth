// Realtime engine: schedules composer events sample-accurately, renders the
// voices and effects, and applies master processing. Works identically inside
// an AudioWorklet and in Node (for offline tests).

import { Composer, STEPS_PER_BAR } from './composer.js';
import { PATCHES } from './patches.js';
import { SynthVoice, DrumVoice } from './voices.js';
import { PingPongDelay, Reverb } from './fx.js';
import { makeInstrument } from './instrument.js';
import { stream } from './rng.js';

// Generate instruments once up front so the first ones during playback are not
// slow (JIT warm-up, probe buffers): the generator renders a short probe note.
let warmed = false;
function warmInstruments() {
  if (warmed) return;
  warmed = true;
  for (let i = 0; i < 80; i++) makeInstrument(stream(i * 977 + 1, 901));
}

const MAX_CHUNK = 256;
const N_VOICES = 24;
const N_DRUMS = 8;

// Smooth saturator, tanh-shaped, in plain arithmetic (no builtin call, so it
// stays allocation-free in the audio thread). Exact tanh Pade-style rational
// approximation, clamped to +-1 outside |x| >= 3.
function softClip(x) {
  if (x > 3) return 1;
  if (x < -3) return -1;
  const x2 = x * x;
  return (x * (27 + x2)) / (27 + 9 * x2);
}

export class Engine {
  constructor(sr) {
    this.sr = sr;
    this.composer = new Composer();
    this.voices = [];
    for (let i = 0; i < N_VOICES; i++) this.voices.push(new SynthVoice(sr));
    this.drums = [];
    for (let i = 0; i < N_DRUMS; i++) this.drums.push(new DrumVoice(sr, 1000 + i * 7919));
    this.delay = new PingPongDelay(sr, 3.2);
    this.reverb = new Reverb(sr);

    const z = () => new Float32Array(MAX_CHUNK);
    this.bL = z();
    this.bR = z();
    this.bREV = z();
    this.bDLY = z();
    this.dL = z();
    this.dR = z();
    this.dREV = z();

    this.running = false;
    this.leadPatch = null;
    warmInstruments();
    this.volume = 0.8;
    this.volNow = 0.0;
    this.bright = 0.5;
    this.brightTarget = 0.5;
    this.trim = 1;
    this.trimTarget = 1;
    this.dlyLevel = 0;
    this.dlyTarget = 0;
    this.revLevel = 0;
    this.revTarget = 0;
    this.duck = 0;
    this.duckAmt = 0;
    this.duckCoef = Math.exp(-1 / (sr * 0.16));

    this.plan = null;
    this.stepIndex = 0;
    this.stepLen = (sr * 60) / 120 / 4;
    this.gridTime = 0;
    this.nextTrig = 0;
    this.samplePos = 0;
    this.phSeed = 12345;

    this.dcXl = 0;
    this.dcXr = 0;
    this.dcYl = 0;
    this.dcYr = 0;
    this.peak = 0;
    this.onBar = null;
  }

  setSeed(seed) {
    this.composer.setSeed(seed);
    if (!this.running) {
      this.running = true;
      this.stepIndex = 0;
      this.gridTime = this.samplePos;
      this.nextTrig = this.samplePos;
    }
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
  }

  // Tempo follows movement: 0..1 across the style's range, or null to use the
  // seed's tempo. Takes effect gradually from the next bar lines.
  setTempoFactor(f) {
    this.composer.setTempoFactor(f);
  }

  // Manual tempo in bpm (null = movement/seed tempo). Applies immediately,
  // mid-bar, so a slider feels direct.
  setTempoOverride(bpm) {
    this.composer.setTempoOverride(bpm);
    const b = this.composer.tempoOv;
    if (b !== null && this.plan) {
      this.stepLen = (this.sr * 60) / b / 4;
      this.delay.setTime((this.plan.fx.delayBeats * 60) / b);
    }
  }

  // Replace the lead voice with a named patch (and force the lead line on,
  // in that instrument's range). name = null restores the style's own lead.
  setLeadPatch(name, lo, hi) {
    // 'procedural': every place invents its own lead instrument.
    this.composer.setLeadProcedural(name === 'procedural');
    if (name === 'procedural') {
      this.leadPatch = null;
      this.composer.setLeadOverride(null);
      return;
    }
    const p = name ? PATCHES[name] : null;
    this.leadPatch = p || null;
    this.composer.setLeadOverride(p ? { lo: lo || 55, hi: hi || 88 } : null);
  }

  _rand() {
    this.phSeed = (Math.imul(this.phSeed, 1664525) + 1013904223) >>> 0;
    return this.phSeed / 4294967296;
  }

  _beginBar() {
    if (this.composer.hasPending()) {
      // New place: let the old harmony ring out naturally.
      for (const v of this.voices) if (v.active) v.release();
    }
    const plan = this.composer.nextBar();
    this.plan = plan;
    this.stepLen = (this.sr * 60) / plan.bpm / 4;
    const fx = plan.fx;
    this.delay.setTime((fx.delayBeats * 60) / plan.bpm);
    this.delay.setFeedback(fx.delayFb);
    this.reverb.setSize(fx.reverbSize);
    this.dlyTarget = fx.delayMix * 1.6;
    this.revTarget = fx.reverbMix * 3;
    this.brightTarget = plan.bright;
    this.trimTarget = plan.trim;
    this.duckAmt = plan.duck;
    if (this.onBar) this.onBar(plan, this.composer.info());
  }

  _trigger(ev) {
    const plan = this.plan;
    const v = ev.voice;
    if (v === 'kick' || v === 'snare' || v === 'hat' || v === 'tom') {
      let slot = null;
      for (const d of this.drums) {
        if (!d.active) {
          slot = d;
          break;
        }
      }
      if (!slot) {
        slot = this.drums[0];
        for (const d of this.drums) if (d.age > slot.age) slot = d;
      }
      slot.start(v, ev.note, ev.vel);
      if (v === 'kick') this.duck = 1;
      return;
    }
    const patch = (v === 'lead' && (plan.leadSynth || this.leadPatch)) || PATCHES[plan.patches[v]];
    if (!patch) return;
    let slot = null;
    for (const s of this.voices) {
      if (!s.active) {
        slot = s;
        break;
      }
    }
    if (!slot) {
      // Steal: quietest releasing voice, else the oldest.
      let best = null;
      for (const s of this.voices) {
        if (s.stage === 4 && (!best || s.env < best.env)) best = s;
      }
      if (!best) {
        best = this.voices[0];
        for (const s of this.voices) if (s.age > best.age) best = s;
      }
      slot = best;
    }
    const ph0 = this._rand();
    const pos = this._rand() * 2 - 1;
    slot.start(ev.note, ev.vel, ev.len * this.stepLen, patch, this.bright, pos, ph0);
  }

  _fireStep() {
    if (this.stepIndex === 0) this._beginBar();
    const evs = this.plan.steps[this.stepIndex];
    for (let i = 0; i < evs.length; i++) this._trigger(evs[i]);
    this.stepIndex++;
    if (this.stepIndex >= STEPS_PER_BAR) this.stepIndex = 0;
    this.gridTime += this.stepLen;
    // 16th-note swing delays odd steps; eighth-note swing delays the off-beat
    // eighths (steps 2, 6, 10, 14), e.g. a triplet feel for jazz.
    const si = this.stepIndex;
    const swingOff = ((si & 1 ? this.plan.swing : 0) + ((si & 3) === 2 ? this.plan.swing8 : 0)) * this.stepLen;
    this.nextTrig = this.gridTime + swingOff;
  }

  // Render n frames into outL/outR (Float32Array). Any n.
  render(outL, outR, n) {
    let done = 0;
    while (done < n) {
      const want = Math.min(n - done, MAX_CHUNK);
      let chunk = want;
      if (this.running) {
        // Fire all steps that are due at or before the chunk start.
        while (this.nextTrig <= this.samplePos) this._fireStep();
        const until = Math.ceil(this.nextTrig - this.samplePos);
        if (until < chunk) chunk = Math.max(1, until);
      }
      this._renderChunk(outL, outR, done, chunk);
      this.samplePos += chunk;
      done += chunk;
    }
  }

  _renderChunk(outL, outR, off, n) {
    const bL = this.bL;
    const bR = this.bR;
    const bREV = this.bREV;
    const bDLY = this.bDLY;
    const dL = this.dL;
    const dR = this.dR;
    const dREV = this.dREV;
    bL.fill(0, 0, n);
    bR.fill(0, 0, n);
    bREV.fill(0, 0, n);
    bDLY.fill(0, 0, n);
    dL.fill(0, 0, n);
    dR.fill(0, 0, n);
    dREV.fill(0, 0, n);

    // Time-based smoothing so the result does not depend on block size.
    const kSlow = 1 - Math.exp(-n / (this.sr * 0.5));
    const kFast = 1 - Math.exp(-n / (this.sr * 0.3));
    this.bright += (this.brightTarget - this.bright) * kSlow;
    this.dlyLevel += (this.dlyTarget - this.dlyLevel) * kFast;
    this.revLevel += (this.revTarget - this.revLevel) * kFast;
    this.trim += (this.trimTarget - this.trim) * kSlow;

    for (const v of this.voices) {
      if (!v.active) continue;
      if (v.stage !== 4) v.setBright(this.bright);
      v.render(n, 0, bL, bR, bREV, bDLY);
    }
    for (const d of this.drums) {
      if (d.active) d.render(n, 0, dL, dR, dREV);
    }

    // Sidechain-style duck of the synth bus on each kick.
    let duck = this.duck;
    const amt = this.duckAmt;
    const dc = this.duckCoef;
    for (let i = 0; i < n; i++) {
      const g = 1 - amt * duck;
      bL[i] *= g;
      bR[i] *= g;
      bREV[i] *= g;
      bDLY[i] *= g;
      bREV[i] += dREV[i];
      duck *= dc;
    }
    this.duck = duck;

    this.delay.process(n, 0, bDLY, bL, bR, this.dlyLevel);
    this.reverb.process(n, 0, bREV, bL, bR, this.revLevel);

    // Master: mix drums, volume, DC block, soft clip.
    const target = this.running ? this.volume * this.trim : 0;
    let vol = this.volNow;
    const vstep = (target - vol) / Math.max(1, this.sr * 0.05);
    let peak = this.peak * 0.9;
    // Filter state in locals: object-field double stores allocate in V8.
    let xl = this.dcXl;
    let xr = this.dcXr;
    let ylPrev = this.dcYl;
    let yrPrev = this.dcYr;
    for (let i = 0; i < n; i++) {
      vol += vstep;
      if ((vstep > 0 && vol > target) || (vstep < 0 && vol < target)) vol = target;
      const l = (bL[i] + dL[i]) * vol;
      const r = (bR[i] + dR[i]) * vol;
      const yl = l - xl + 0.995 * ylPrev;
      const yr = r - xr + 0.995 * yrPrev;
      xl = l;
      xr = r;
      ylPrev = yl;
      yrPrev = yr;
      const ol = softClip(yl);
      const or = softClip(yr);
      outL[off + i] = ol;
      outR[off + i] = or;
      const a = ol < 0 ? -ol : ol;
      const b = or < 0 ? -or : or;
      if (a > peak) peak = a;
      if (b > peak) peak = b;
    }
    this.dcXl = xl;
    this.dcXr = xr;
    this.dcYl = ylPrev + 1e-20;
    this.dcYr = yrPrev + 1e-20;
    this.volNow = vol;
    this.peak = peak;
  }
}
