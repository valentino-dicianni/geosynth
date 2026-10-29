// GPS fix -> seed. Two grid levels:
//   coarse (~250 m): style, key, mode, tempo (a new style every few minutes of walking)
//   fine   (~60 m):  progression, melodies, arrangement
// Hysteresis (wider when the fix is inaccurate) stops boundary flapping, the lon
// step is scaled by latitude so cells stay roughly square, and updates are rate
// limited so driving does not re-roll the music every few seconds.

import { hash3 } from '../engine/rng.js';

const SALT_COARSE = 0x434f4152; // 'COAR'
const SALT_FINE = 0x46494e45; // 'FINE'
export const M_PER_DEG = 111195;

function snap(prev, x, step, hyst) {
  const u = x / step;
  if (prev === null) return Math.floor(u);
  const f = u - prev;
  if (f >= -hyst && f < 1 + hyst) return prev;
  return Math.floor(u);
}

// Quantised so every device derives identical cell edges.
function lonScale(latDeg) {
  const c = Math.cos((latDeg * Math.PI) / 180);
  return Math.round(Math.max(0.2, c) * 100) / 100;
}

export class GeoSeeder {
  constructor(opts) {
    const o = opts || {};
    this.coarseDeg = o.coarseDeg || 0.00225; // ~250 m
    this.fineDeg = o.fineDeg || 0.00054; // ~60 m
    this.hyst = o.hyst === undefined ? 0.2 : o.hyst;
    this.minFineHoldMs = o.minFineHoldMs === undefined ? 20000 : o.minFineHoldMs;
    this.minCoarseHoldMs = o.minCoarseHoldMs === undefined ? 0 : o.minCoarseHoldMs;
    this.maxAccuracyM = o.maxAccuracyM || 30000;
    this.fineAccuracyM = o.fineAccuracyM || 400;
    this.cLat = null;
    this.cLon = null;
    this.fLat = null;
    this.fLon = null;
    this.lastFineChange = -Infinity;
    this.lastCoarseChange = -Infinity;
    this.seed = null;
  }

  // Hysteresis as a fraction of a cell: at least `hyst`, and about 1.5x the
  // fix accuracy so GPS jitter cannot flip a cell near its edge.
  _hyst(accuracyM, stepDeg) {
    return Math.max(this.hyst, Math.min(0.8, (1.5 * accuracyM) / (stepDeg * M_PER_DEG)));
  }

  // Returns a new { coarse, fine, ... } seed object when the seed changed,
  // otherwise null. Position is always accepted; `nowMs` drives rate limiting.
  update(lat, lon, accuracyM, nowMs) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    const acc = Number.isFinite(accuracyM) ? accuracyM : 0;
    if (acc > this.maxAccuracyM) return null;
    const now = Number.isFinite(nowMs) ? nowMs : 0;
    const first = this.seed === null;

    const hC = this._hyst(acc, this.coarseDeg);
    let cLat = snap(this.cLat, lat, this.coarseDeg, hC);
    let ls = lonScale((cLat + 0.5) * this.coarseDeg);
    let cLon = snap(this.cLon, lon, this.coarseDeg / ls, hC);
    let coarseChanged = cLat !== this.cLat || cLon !== this.cLon;
    if (coarseChanged && !first && now - this.lastCoarseChange < this.minCoarseHoldMs) {
      // Moving fast (driving): keep the current style for now. The change is
      // not lost: it is detected again and applied once the hold has passed.
      cLat = this.cLat;
      cLon = this.cLon;
      coarseChanged = false;
      ls = lonScale((cLat + 0.5) * this.coarseDeg);
    }

    let fLat = this.fLat;
    let fLon = this.fLon;
    let fineChanged = false;
    const fineOk = acc <= this.fineAccuracyM;
    if (coarseChanged || first || (fineOk && now - this.lastFineChange >= this.minFineHoldMs)) {
      const hF = this._hyst(acc, this.fineDeg);
      const nLat = snap(coarseChanged ? null : this.fLat, lat, this.fineDeg, hF);
      const nLon = snap(coarseChanged ? null : this.fLon, lon, this.fineDeg / ls, hF);
      if (nLat !== this.fLat || nLon !== this.fLon || coarseChanged) {
        fLat = nLat;
        fLon = nLon;
        fineChanged = true;
      }
    }

    if (!coarseChanged && !fineChanged && !first) return null;

    this.cLat = cLat;
    this.cLon = cLon;
    this.fLat = fLat;
    this.fLon = fLon;
    if (fineChanged || first) this.lastFineChange = now;
    if (coarseChanged || first) this.lastCoarseChange = now;

    const coarse = hash3(cLat, cLon, SALT_COARSE);
    const fine = hash3(fLat, fLon, SALT_FINE);
    this.seed = { coarse, fine, cLat, cLon, fLat, fLon, coarseChanged, fineChanged };
    return this.seed;
  }
}

// Approximate metres between two lat/lon points (small distances).
export function distanceM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Movement speed from successive position updates, for tempo.
// - A GPS-reported speed (m/s) is used when present, since it is Doppler based
//   and does not jitter; otherwise speed = distance / time between updates.
// - Displacement over ~10 s below twice the accuracy radius counts as standing still.
// - Smoothed over ~tau seconds and decays towards 0 when updates stop, so
//   stopping slows the music down and an idle Manual mode settles on the
//   slowest tempo. Jumping to a far-away place in Manual mode reads as very
//   fast movement and then calms down.
// Speed ceiling for tempo: anything at or above 100 km/h counts as 100 km/h.
export const MAX_SPEED_KMH = 100;
export const MAX_SPEED_MS = MAX_SPEED_KMH / 3.6;

export class SpeedTracker {
  constructor(opts) {
    const o = opts || {};
    this.tau = o.tau || 4; // smoothing time constant, seconds
    this.windowMs = o.windowMs || 10000; // displacement baseline
    this.hist = [];
    this.decayTau = o.decayTau || 10; // decay when no updates arrive
    this.vMax = o.vMax || MAX_SPEED_MS; // m/s at which tempo tops out (100 km/h)
    this.vCap = o.vCap || MAX_SPEED_MS; // hard clamp: the measured speed never exceeds this
    this.idleAfterMs = o.idleAfterMs || 3000;
    this.last = null;
    this.v = 0;
    this.lastTick = null;
  }

  // lat/lon degrees, acc metres (0 if unknown), tMs timestamp, gpsSpeed m/s or undefined.
  update(lat, lon, acc, tMs, gpsSpeed) {
    const last = this.last;
    const cur = { lat, lon, acc: acc || 0, t: tMs };
    this.last = cur;
    this.lastTick = tMs;
    // Keep ~windowMs of history, but always the previous fix.
    this.hist.push(cur);
    while (this.hist.length > 2 && tMs - this.hist[0].t > this.windowMs) this.hist.shift();
    if (!last) return;
    const dtStep = (tMs - last.t) / 1000;
    if (dtStep < 0.05) return;

    let inst;
    if (Number.isFinite(gpsSpeed) && gpsSpeed >= 0) {
      inst = gpsSpeed;
    } else {
      // Displacement over the window, not fix to fix: at walking pace one fix
      // moves less than the GPS accuracy, and jitter alone can exceed it.
      const ref = this.hist[0];
      const dt = (tMs - ref.t) / 1000;
      const d = distanceM(ref.lat, ref.lon, lat, lon);
      const thresh = 2 * Math.max(cur.acc, ref.acc);
      inst = dt >= 0.05 && d > thresh ? d / dt : 0;
    }
    inst = Math.min(this.vCap, inst);
    const a = 1 - Math.exp(-dtStep / this.tau);
    this.v += (inst - this.v) * a;
  }

  // Call about once a second; decays the speed while no updates arrive.
  tick(tMs) {
    if (this.lastTick === null) {
      this.lastTick = tMs;
      return;
    }
    const idle = tMs - (this.last ? this.last.t : this.lastTick);
    const dt = Math.max(0, (tMs - this.lastTick) / 1000);
    this.lastTick = tMs;
    if (this.last && idle > this.idleAfterMs) this.v *= Math.exp(-dt / this.decayTau);
  }

  get speed() {
    return this.v;
  }

  // 0..1 on a log scale: ~0.26 walking, ~0.57 cycling, ~0.8 driving, 1 at vMax (100 km/h).
  get factor() {
    const f = Math.log10(1 + this.v) / Math.log10(1 + this.vMax);
    return f < 0 ? 0 : f > 1 ? 1 : f;
  }
}
