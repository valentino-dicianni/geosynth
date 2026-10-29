// Deterministic integer hashing and PRNG.
// Everything here is 32-bit integer math (Math.imul), so the same seed gives
// the same sequence on every JS engine. No Math.random anywhere in the engine.

export function mix32(x) {
  x = x >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

// Hash two signed 32-bit ints plus a salt into one u32.
export function hash3(a, b, salt) {
  let h = mix32(salt ^ 0x9e3779b9);
  h = mix32(h ^ mix32(a | 0));
  h = mix32(h ^ Math.imul(mix32(b | 0), 0x27d4eb2f));
  return h >>> 0;
}

// sfc32: small, fast, good quality.
export class Rng {
  constructor(seed) {
    this.reseed(seed);
  }

  reseed(seed) {
    const s = seed >>> 0;
    this.a = mix32(s ^ 0x243f6a88);
    this.b = mix32(s ^ 0x85a308d3);
    this.c = mix32(s ^ 0x13198a2e);
    this.d = 1;
    for (let i = 0; i < 12; i++) this.next();
  }

  next() {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  // Uniform integer in [0, n). Exact for n < 2^21.
  below(n) {
    return Math.floor((this.next() / 4294967296) * n);
  }

  // Uniform float in [0, 1).
  float() {
    return this.next() / 4294967296;
  }

  // True with probability p (0..1).
  chance(p) {
    return this.float() < p;
  }

  // Integer in [lo, hi] inclusive.
  range(lo, hi) {
    return lo + this.below(hi - lo + 1);
  }

  pick(arr) {
    return arr[this.below(arr.length)];
  }

  // Weighted pick: weights is an array of non-negative numbers.
  weighted(weights) {
    let total = 0;
    for (let i = 0; i < weights.length; i++) total += weights[i];
    let r = this.float() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) return i;
    }
    return weights.length - 1;
  }
}

// Derive an independent stream from a base seed and a salt.
export function stream(seed, salt) {
  return new Rng(mix32((seed >>> 0) ^ Math.imul(salt | 0, 0x9e3779b1)));
}
