// Effects: tempo-synced ping-pong delay and a Freeverb-style stereo reverb.

export class PingPongDelay {
  constructor(sr, maxSec) {
    this.sr = sr;
    this.size = Math.ceil(sr * (maxSec || 3)) + 4;
    this.bufL = new Float32Array(this.size);
    this.bufR = new Float32Array(this.size);
    this.w = 0;
    this.delay = sr * 0.4;
    this.target = this.delay;
    this.fb = 0.4;
    this.fbTarget = 0.4;
    this.lpL = 0;
    this.lpR = 0;
    this.lpA = 0.42; // feedback low-pass amount (higher = darker)
  }

  setTime(sec) {
    this.target = Math.max(32, Math.min(this.size - 8, sec * this.sr));
  }

  setFeedback(fb) {
    this.fbTarget = Math.min(0.75, Math.max(0, fb));
  }

  // Adds wet signal to outL/outR scaled by `level`.
  process(n, o, inp, outL, outR, level) {
    const size = this.size;
    const bufL = this.bufL;
    const bufR = this.bufR;
    let w = this.w;
    let d = this.delay;
    let lpL = this.lpL;
    let lpR = this.lpR;
    const a = this.lpA;
    const target = this.target;
    let fb = this.fb;
    const fbT = this.fbTarget;
    for (let i = 0; i < n; i++) {
      d += (target - d) * 0.0002;
      fb += (fbT - fb) * 0.001;
      let r = w - d;
      if (r < 0) r += size;
      const i0 = Math.floor(r);
      const fr = r - i0;
      const i1 = i0 + 1 >= size ? 0 : i0 + 1;
      const dl = bufL[i0] * (1 - fr) + bufL[i1] * fr;
      const dr = bufR[i0] * (1 - fr) + bufR[i1] * fr;
      lpL += (1 - a) * (dl - lpL);
      lpR += (1 - a) * (dr - lpR);
      bufL[w] = inp[o + i] + fb * lpR;
      bufR[w] = fb * lpL;
      w++;
      if (w >= size) w = 0;
      outL[o + i] += dl * level;
      outR[o + i] += dr * level;
    }
    this.w = w;
    this.delay = d;
    this.fb = fb;
    this.lpL = lpL + 1e-20;
    this.lpR = lpR + 1e-20;
  }
}

const COMB = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const ALLP = [556, 441, 341, 225];
const SPREAD = 23;

export class Reverb {
  constructor(sr) {
    const sc = sr / 44100;
    this.combL = [];
    this.combR = [];
    this.apL = [];
    this.apR = [];
    for (const len of COMB) {
      this.combL.push({ buf: new Float32Array(Math.round(len * sc)), i: 0, f: 0 });
      this.combR.push({ buf: new Float32Array(Math.round((len + SPREAD) * sc)), i: 0, f: 0 });
    }
    for (const len of ALLP) {
      this.apL.push({ buf: new Float32Array(Math.round(len * sc)), i: 0 });
      this.apR.push({ buf: new Float32Array(Math.round((len + SPREAD) * sc)), i: 0 });
    }
    this.fb = 0.85;
    this.fbTarget = 0.85;
    this.damp = 0.28;
  }

  setSize(size) {
    this.fbTarget = 0.72 + 0.24 * Math.min(1, Math.max(0, size));
  }

  process(n, o, inp, outL, outR, level) {
    const damp = this.damp;
    const g = 0.03;
    const combL = this.combL;
    const combR = this.combR;
    const apL = this.apL;
    const apR = this.apR;
    let fb = this.fb;
    const fbT = this.fbTarget;
    for (let s = 0; s < n; s++) {
      fb += (fbT - fb) * 0.0005;
      const x = inp[o + s] * g;
      let accL = 0;
      let accR = 0;
      for (let c = 0; c < 8; c++) {
        const cl = combL[c];
        const bl = cl.buf;
        const ol = bl[cl.i];
        cl.f = ol * (1 - damp) + cl.f * damp;
        bl[cl.i] = x + cl.f * fb;
        if (++cl.i >= bl.length) cl.i = 0;
        accL += ol;

        const cr = combR[c];
        const br = cr.buf;
        const or = br[cr.i];
        cr.f = or * (1 - damp) + cr.f * damp;
        br[cr.i] = x + cr.f * fb;
        if (++cr.i >= br.length) cr.i = 0;
        accR += or;
      }
      for (let a = 0; a < 4; a++) {
        const al = apL[a];
        const bo = al.buf[al.i];
        const outl = -accL + bo;
        al.buf[al.i] = accL + bo * 0.5;
        if (++al.i >= al.buf.length) al.i = 0;
        accL = outl;

        const ar = apR[a];
        const bor = ar.buf[ar.i];
        const outr = -accR + bor;
        ar.buf[ar.i] = accR + bor * 0.5;
        if (++ar.i >= ar.buf.length) ar.i = 0;
        accR = outr;
      }
      outL[o + s] += accL * level;
      outR[o + s] += accR * level;
    }
    this.fb = fb;
  }
}
