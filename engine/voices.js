// Realtime voices: a subtractive/FM synth voice and four drum voices.
// No allocation after construction. All state is plain numbers.

const TWO_PI = 2 * Math.PI;
const DENORM = 1e-20;

function polyBlep(t, dt) {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

export function midiToHz(n) {
  return 440 * Math.pow(2, (n - 69) / 12);
}

// ---------------------------------------------------------------------------

export class SynthVoice {
  constructor(sr) {
    this.sr = sr;
    this.active = false;
    this.p = null;
    this.age = 0;
    this.stage = 0; // 1 attack, 2 decay/sustain, 4 release
    this.env = 0;
    this.note = 0;
    this.tick = 0;
    // Wind/brass/choir features. Typed arrays: element writes do not allocate.
    this.fc = new Float64Array(12); // per formant: a1, a2, a3, gain*k
    this.fs = new Float64Array(6); // per formant: ic1, ic2
    this.nf = 0;
    this.dry = 1;
    this.breath = 0;
    this.nrng = 1;
    this.lpN = 0;
    this.be = 0;
    this.beCoef = 0;
    this.fRise = false;
    this.feCoefRise = 0;
    this.scoopNow = 0;
    this.scoopCoef = 0;
  }

  // bright: 0..1 macro. pos: -1..1 pan position. ph0: 0..1 start phase.
  start(note, vel, lenSamples, patch, bright, pos, ph0) {
    const sr = this.sr;
    const p = patch;
    this.p = p;
    this.active = true;
    this.note = note;
    this.age = 0;
    this.vel = vel;
    this.freq = 440 * Math.pow(2, (note - 69) / 12);
    this.gate = lenSamples;
    this.stage = 1;
    this.env = 0;
    this.atkInc = 1 / Math.max(1, p.a * sr);
    this.decCoef = Math.exp(-4.6 / (sr * Math.max(0.005, p.d)));
    this.relCoef = Math.exp(-4.6 / (sr * Math.max(0.005, p.r)));
    this.sustain = p.s;

    const spread = p.detune || 0;
    this.mul1 = p.osc2 ? Math.pow(2, -spread / 2400) : 1;
    this.mul2 = Math.pow(2, spread / 2400);
    this.ph1 = ph0;
    this.ph2 = (ph0 * 7.31) % 1;
    this.phs = 0;
    this.phm = 0;
    this.lfo = ph0;
    this.pwmPh = ph0;

    this.fe = 1;
    this.feCoefBlock = Math.exp(-16 / (sr * Math.max(0.01, p.fdec || 1)));
    this.fmE = 1;
    this.fmCoef = Math.exp(-4.6 / (sr * Math.max(0.05, p.fmDecay || 1)));

    // Filter envelope that rises instead of falling (brass "blat").
    this.fRise = (p.fRise || 0) > 0;
    this.feCoefRise = Math.exp(-16 / (sr * Math.max(0.005, p.fRise || 1)));
    if (this.fRise) this.fe = 0;
    // Pitch scoop into the note, in cents, settling over scoopDec seconds.
    this.scoopNow = p.scoop || 0;
    this.scoopCoef = Math.exp(-16 / (sr * Math.max(0.005, p.scoopDec || 0.06)));
    // Breath noise: deterministic seed from note and start phase.
    this.breath = p.breath || 0;
    this.nrng = (Math.imul(note + 1, 2654435761) ^ Math.floor(ph0 * 4294967295)) | 1;
    this.lpN = 0;
    this.be = 1;
    this.beCoef = Math.exp(-1 / (sr * 0.09));
    // Parallel formant (band-pass) bank, coefficients fixed for the note.
    const F = p.formants;
    this.nf = F ? Math.min(3, F.length) : 0;
    this.dry = p.dry === undefined ? 1 : p.dry;
    this.fs.fill(0);
    for (let q = 0; q < this.nf; q++) {
      const g = Math.tan((Math.PI * Math.min(F[q][0], sr * 0.4)) / sr);
      const kq = 1 / F[q][1];
      const a1f = 1 / (1 + g * (g + kq));
      this.fc[q * 4] = a1f;
      this.fc[q * 4 + 1] = g * a1f;
      this.fc[q * 4 + 2] = g * g * a1f;
      this.fc[q * 4 + 3] = F[q][2] * kq;
    }

    // Cutoff base: bright macro moves it by +-1.5 octaves.
    const track = Math.pow(this.freq / 261.63, p.key || 0);
    this.cutBase = p.cut * Math.pow(2, (bright - 0.5) * 3) * track;
    this.res = Math.min(0.95, p.res || 0);
    this.ic1 = 0;
    this.ic2 = 0;
    this.a1 = this.a2 = this.a3 = 0;
    this.tick = 0;
    this.vibMul = 1;
    this.pw = p.pw || 0.5;

    const ang = (pos * (p.pan || 0) + 1) * (Math.PI / 4);
    this.gL = Math.cos(ang) * 1.3;
    this.gR = Math.sin(ang) * 1.3;
    this.gain = p.gain * (0.35 + 0.65 * vel);
  }

  setBright(bright) {
    // Applied lazily to cutoff at next control tick for sustained voices.
    const p = this.p;
    if (!p) return;
    const track = Math.pow(this.freq / 261.63, p.key || 0);
    this.cutBase = p.cut * Math.pow(2, (bright - 0.5) * 3) * track;
  }

  release() {
    if (this.stage !== 4) this.stage = 4;
  }

  // Adds into L/R (dry), REV and DLY (mono sends). Frames [o, o+n).
  render(n, o, L, R, REV, DLY) {
    const p = this.p;
    const sr = this.sr;
    const wave = p.wave;
    const isFM = wave === 'fm';
    const isSaw = wave === 'saw';
    const isPulse = wave === 'pulse';
    const isTri = wave === 'tri';
    const isReed = wave === 'reed';
    const isOrgan = wave === 'organ';
    const two = !!p.osc2;
    const nf = this.nf;
    const fc = this.fc;
    const fs = this.fs;
    const dry = this.dry;
    const breath = this.breath;
    const beCoef = this.beCoef;
    const rise = this.fRise;
    const scoop = p.scoop || 0;
    const vibD = p.vibDelay ? p.vibDelay * sr : 0;
    const vibR = p.vibDelay ? 0.3 * sr : 0.15 * sr;
    const sub = p.sub || 0;
    const fenv = p.fenv || 0;
    const vibDepth = p.vib || 0;
    const vibInc = ((p.vibRate || 5) * 16) / sr;
    const pwmDepth = p.pwm || 0;
    const pwmInc = ((p.pwmRate || 1) * 16) / sr;
    const fmRatio = p.fmRatio || 1;
    const fmIndex = p.fmIndex || 0;
    const revS = p.rev || 0;
    const dlyS = p.dly || 0;
    const nyq = sr * 0.45;
    const oscGain = two ? 0.6 : 1;

    let env = this.env;
    let stage = this.stage;
    let ph1 = this.ph1;
    let ph2 = this.ph2;
    let phs = this.phs;
    let phm = this.phm;
    let ic1 = this.ic1;
    let ic2 = this.ic2;
    let a1 = this.a1;
    let a2 = this.a2;
    let a3 = this.a3;
    let k = 2 - 2 * this.res;
    let fmE = this.fmE;
    let gate = this.gate;
    let tick = this.tick;
    const freq = this.freq;
    let pw = this.pw;
    let vibMul = this.vibMul;
    let nr = this.nrng;
    let lpN = this.lpN;
    let be = this.be;

    for (let i = 0; i < n; i++) {
      if ((tick & 15) === 0) {
        // Control-rate update every 16 samples.
        if (rise) this.fe = 1 - (1 - this.fe) * this.feCoefRise;
        else this.fe *= this.feCoefBlock;
        let fc = this.cutBase + fenv * this.fe;
        if (fc > nyq) fc = nyq;
        if (fc < 20) fc = 20;
        const g = Math.tan((Math.PI * fc) / sr);
        a1 = 1 / (1 + g * (g + k));
        a2 = g * a1;
        a3 = g * a2;
        this.lfo += vibInc;
        if (this.lfo >= 1) this.lfo -= 1;
        if (vibDepth || scoop) {
          let cents = 0;
          if (vibDepth) {
            let fade = (this.age - vibD) / vibR;
            fade = fade < 0 ? 0 : fade > 1 ? 1 : fade;
            cents = vibDepth * fade * Math.sin(TWO_PI * this.lfo);
          }
          if (scoop) {
            this.scoopNow *= this.scoopCoef;
            cents -= this.scoopNow;
          }
          vibMul = Math.pow(2, cents / 1200);
        }
        if (pwmDepth) {
          this.pwmPh += pwmInc;
          if (this.pwmPh >= 1) this.pwmPh -= 1;
          pw = (p.pw || 0.5) + pwmDepth * Math.sin(TWO_PI * this.pwmPh);
          if (pw < 0.08) pw = 0.08;
          if (pw > 0.92) pw = 0.92;
        }
      }
      tick++;

      // Oscillators
      let x;
      const f1 = freq * this.mul1 * vibMul;
      if (isFM) {
        const dtc = f1 / sr;
        ph1 += dtc;
        if (ph1 >= 1) ph1 -= 1;
        phm += dtc * fmRatio;
        if (phm >= 1) phm -= 1;
        fmE *= this.fmCoef;
        x = Math.sin(TWO_PI * (ph1 + fmIndex * (0.25 + 0.75 * fmE) * this.vel * Math.sin(TWO_PI * phm)));
      } else {
        const dt1 = f1 / sr;
        ph1 += dt1;
        if (ph1 >= 1) ph1 -= 1;
        if (isSaw) {
          x = 2 * ph1 - 1 - polyBlep(ph1, dt1);
        } else if (isPulse) {
          x = ph1 < pw ? 1 : -1;
          x += polyBlep(ph1, dt1);
          let t2 = ph1 - pw;
          if (t2 < 0) t2 += 1;
          x -= polyBlep(t2, dt1);
        } else if (isReed) {
          // Saw plus a narrow pulse: buzzy, even and odd harmonics.
          let q = ph1 < 0.38 ? 1 : -1;
          q += polyBlep(ph1, dt1);
          let t3 = ph1 - 0.38;
          if (t3 < 0) t3 += 1;
          q -= polyBlep(t3, dt1);
          x = 0.6 * (2 * ph1 - 1 - polyBlep(ph1, dt1)) + 0.4 * q;
        } else if (isOrgan) {
          x =
            0.45 * Math.sin(TWO_PI * ph1) +
            0.3 * Math.sin(TWO_PI * 2 * ph1) +
            0.2 * Math.sin(TWO_PI * 3 * ph1) +
            0.12 * Math.sin(TWO_PI * 4 * ph1);
        } else if (isTri) {
          x = 4 * Math.abs(ph1 - 0.5) - 1;
        } else {
          x = Math.sin(TWO_PI * ph1);
        }
        if (two) {
          const dt2 = (freq * this.mul2 * vibMul) / sr;
          ph2 += dt2;
          if (ph2 >= 1) ph2 -= 1;
          let y;
          if (isSaw) {
            y = 2 * ph2 - 1 - polyBlep(ph2, dt2);
          } else if (isPulse) {
            y = ph2 < pw ? 1 : -1;
            y += polyBlep(ph2, dt2);
            let t2 = ph2 - pw;
            if (t2 < 0) t2 += 1;
            y -= polyBlep(t2, dt2);
          } else {
            y = Math.sin(TWO_PI * ph2);
          }
          x += y;
        }
        x *= oscGain;
      }
      if (sub) {
        phs += (freq * 0.5) / sr;
        if (phs >= 1) phs -= 1;
        x += sub * Math.sin(TWO_PI * phs);
      }

      // State-variable lowpass (TPT)
      const v3 = x - ic2;
      const v1 = a1 * ic1 + a2 * v3;
      const v2 = ic2 + a2 * ic1 + a3 * v3;
      ic1 = 2 * v1 - ic1;
      ic2 = 2 * v2 - ic2;

      // Optional formant bank (parallel band-passes) and breath noise.
      let sig = v2;
      if (nf > 0) {
        let acc = v2 * dry;
        for (let q = 0; q < nf; q++) {
          const b = q * 4;
          const s = q * 2;
          const f1c = fs[s];
          const f2c = fs[s + 1];
          const v3f = v2 - f2c;
          const v1f = fc[b] * f1c + fc[b + 1] * v3f;
          const v2f = f2c + fc[b + 1] * f1c + fc[b + 2] * v3f;
          fs[s] = 2 * v1f - f1c;
          fs[s + 1] = 2 * v2f - f2c;
          acc += fc[b + 3] * v1f;
        }
        sig = acc;
      }
      if (breath > 0) {
        nr = (Math.imul(nr, 1664525) + 1013904223) | 0;
        const nz = nr / 2147483648;
        lpN += 0.3 * (nz - lpN);
        be *= beCoef;
        sig += breath * (0.35 + 0.65 * be) * (nz - lpN);
      }

      // Amp envelope
      if (stage === 1) {
        env += this.atkInc;
        if (env >= 1) {
          env = 1;
          stage = 2;
        }
      } else if (stage === 2) {
        env = this.sustain + (env - this.sustain) * this.decCoef;
        if (env < 1e-4 && this.sustain < 1e-4) {
          this.active = false;
          break;
        }
      } else {
        env *= this.relCoef;
        if (env < 1e-4) {
          this.active = false;
          break;
        }
      }
      if (stage !== 4) {
        gate -= 1;
        if (gate <= 0) stage = 4;
      }

      const out = sig * env * this.gain;
      const idx = o + i;
      L[idx] += out * this.gL;
      R[idx] += out * this.gR;
      REV[idx] += out * revS;
      DLY[idx] += out * dlyS;
    }

    this.env = env;
    this.stage = stage;
    this.ph1 = ph1;
    this.ph2 = ph2;
    this.phs = phs;
    this.phm = phm;
    this.ic1 = ic1 + DENORM;
    this.ic2 = ic2 + DENORM;
    this.a1 = a1;
    this.a2 = a2;
    this.a3 = a3;
    this.fmE = fmE;
    this.gate = gate;
    this.tick = tick;
    this.pw = pw;
    this.vibMul = vibMul;
    this.nrng = nr;
    this.lpN = lpN;
    this.be = be;
    this.age += n;
  }
}

// ---------------------------------------------------------------------------

const K_KICK = 1;
const K_SNARE = 2;
const K_HAT = 3;
const K_TOM = 4;

// All per-sample state lives in locals inside render() and is written back
// once per call: object-field double stores allocate in V8 and would feed the
// garbage collector from the audio thread.
export class DrumVoice {
  constructor(sr, seed) {
    this.sr = sr;
    this.active = false;
    this.kind = 0;
    this.rng = (seed | 0) || 12345;
    this.age = 0;
    this.vel = 0;
    this.ph = 0;
    this.lp1 = 0;
    this.lp2 = 0;
    this.env = 0;
    this.pitchEnv = 0;
    this.toneEnv = 0;
    this.ampCoef = 0;
    this.pitchCoef = 0;
    this.toneCoef = 0;
    this.hpA = 0;
    this.f0 = 0;
    this.fSpan = 0;
    this.rev = 0;
  }

  start(voice, note, vel) {
    const sr = this.sr;
    this.active = true;
    this.age = 0;
    this.vel = vel;
    this.ph = 0;
    this.lp1 = 0;
    this.lp2 = 0;
    this.env = 1;
    this.pitchEnv = 1;
    this.toneEnv = 1;
    this.toneCoef = 0;
    this.pitchCoef = 0;
    this.hpA = 0;
    this.f0 = 0;
    this.fSpan = 0;
    if (voice === 'kick') {
      this.kind = K_KICK;
      this.ampCoef = Math.exp(-1 / (sr * 0.075));
      this.pitchCoef = Math.exp(-1 / (sr * 0.028));
      this.f0 = 44;
      this.fSpan = 150;
      this.rev = 0;
    } else if (voice === 'snare') {
      this.kind = K_SNARE;
      this.ampCoef = Math.exp(-1 / (sr * 0.075));
      this.toneCoef = Math.exp(-1 / (sr * 0.045));
      this.pitchCoef = Math.exp(-1 / (sr * 0.02));
      this.hpA = 1 - Math.exp((-TWO_PI * 1400) / sr);
      this.rev = 0.22;
    } else if (voice === 'hat') {
      this.kind = K_HAT;
      const open = note === 46;
      this.ampCoef = Math.exp(-1 / (sr * (open ? 0.11 : 0.022)));
      this.hpA = 1 - Math.exp((-TWO_PI * 7000) / sr);
      this.rev = 0.12;
    } else {
      this.kind = K_TOM;
      this.ampCoef = Math.exp(-1 / (sr * 0.17));
      this.pitchCoef = Math.exp(-1 / (sr * 0.05));
      this.f0 = 440 * Math.pow(2, (note - 69) / 12);
      this.fSpan = this.f0 * 0.8;
      this.rev = 0.3;
    }
  }

  // Adds to L/R (centre) and REV for frames [o, o+n).
  render(n, o, L, R, REV) {
    const kind = this.kind;
    const sr = this.sr;
    const gain = this.vel * 0.55;
    const rev = this.rev;
    const ampCoef = this.ampCoef;
    const pitchCoef = this.pitchCoef;
    const toneCoef = this.toneCoef;
    const hpA = this.hpA;
    const f0 = this.f0;
    const fSpan = this.fSpan;
    let env = this.env;
    let pe = this.pitchEnv;
    let te = this.toneEnv;
    let ph = this.ph;
    let lp1 = this.lp1;
    let lp2 = this.lp2;
    let rng = this.rng;
    const age = this.age;
    let done = false;
    let i = 0;
    for (; i < n; i++) {
      let out;
      if (kind === K_KICK) {
        pe *= pitchCoef;
        ph += (f0 + fSpan * pe) / sr;
        if (ph >= 1) ph -= 1;
        let click = 0;
        if (age + i < 40) {
          rng = (Math.imul(rng, 1664525) + 1013904223) | 0;
          click = (rng / 2147483648) * 0.25;
        }
        out = Math.tanh(1.8 * Math.sin(TWO_PI * ph)) * env * 0.9 + click * env;
      } else if (kind === K_SNARE) {
        rng = (Math.imul(rng, 1664525) + 1013904223) | 0;
        const nz = rng / 2147483648;
        lp1 += hpA * (nz - lp1);
        pe *= pitchCoef;
        ph += (175 + 70 * pe) / sr;
        if (ph >= 1) ph -= 1;
        te *= toneCoef;
        out = (nz - lp1) * env * 0.7 + Math.sin(TWO_PI * ph) * te * 0.45;
      } else if (kind === K_HAT) {
        rng = (Math.imul(rng, 1664525) + 1013904223) | 0;
        const nz = rng / 2147483648;
        lp1 += hpA * (nz - lp1);
        const h1 = nz - lp1;
        lp2 += hpA * (h1 - lp2);
        out = (h1 - lp2) * env * 0.9;
      } else {
        pe *= pitchCoef;
        ph += (f0 + fSpan * pe) / sr;
        if (ph >= 1) ph -= 1;
        out = Math.sin(TWO_PI * ph) * env * 0.9;
      }
      env *= ampCoef;
      out *= gain;
      const idx = o + i;
      L[idx] += out;
      R[idx] += out;
      REV[idx] += out * rev;
      if (env < 1e-4) {
        done = true;
        i++;
        break;
      }
    }
    if (done) this.active = false;
    this.env = env;
    this.pitchEnv = pe;
    this.toneEnv = te;
    this.ph = ph;
    this.lp1 = lp1;
    this.lp2 = lp2;
    this.rng = rng;
    this.age = age + i;
  }
}
