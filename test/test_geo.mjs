// Run: node test/test_geo.mjs
import assert from 'node:assert/strict';
import { GeoSeeder, SpeedTracker, MAX_SPEED_MS, distanceM } from '../src/geo.js';

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log('  ok  ', name);
  } catch (e) {
    failures++;
    console.log('  FAIL', name, '\n      ', e.message);
  }
}

const M_PER_DEG = 111195;

check('first fix always yields a seed; identical fix yields none', () => {
  const g = new GeoSeeder();
  const s = g.update(47.3769, 8.5417, 10, 0);
  assert.ok(s && s.coarse > 0 && s.fine > 0);
  assert.equal(g.update(47.3769, 8.5417, 10, 1000), null);
});

check('same coordinates on a fresh instance give the same seed', () => {
  const a = new GeoSeeder();
  const c = new GeoSeeder();
  const sa = a.update(-33.8688, 151.2093, 8, 0);
  const sc = c.update(-33.8688, 151.2093, 8, 0);
  assert.equal(sa.coarse, sc.coarse);
  assert.equal(sa.fine, sc.fine);
});

check('hysteresis: a point just inside the neighbour cell keeps the old cell until 20% past the edge', () => {
  const g = new GeoSeeder({ minFineHoldMs: 0 });
  const s0 = g.update(47.5005, 8.0005, 5, 0); // fine cell lat index 47500
  assert.equal(g.update(47.50105, 8.0005, 5, 1000), null, '5% past the edge: stay');
  assert.ok(g.update(47.50125, 8.0005, 5, 2000), '25% past the edge: switch');
  assert.notEqual(g.seed.fine, s0.fine);
});

check('GPS jitter (+-15 m) around a fine-cell border does not flip the seed', () => {
  const g = new GeoSeeder({ minFineHoldMs: 0 });
  const border = 47.1235; // exactly on a 0.001 degree edge in latitude
  g.update(border + 0.00002, 8.0005, 5, 0);
  let flips = 0;
  for (let t = 1; t < 400; t++) {
    const jitter = (((t * 7919) % 31) - 15) / 15; // +-1
    const s = g.update(border + jitter * 0.00014, 8.0005, 5, t * 1000); // +-15 m
    if (s) flips++;
  }
  assert.equal(flips, 0, 'flips: ' + flips);
});

check('walking 300 m changes the fine seed but not the coarse seed', () => {
  const g = new GeoSeeder({ minFineHoldMs: 0 });
  const s0 = g.update(48.0, 11.0, 5, 0);
  const s1 = g.update(48.0 + 300 / M_PER_DEG, 11.0, 5, 60000);
  assert.ok(s1, 'fine seed should change');
  assert.equal(s1.coarse, s0.coarse);
  assert.notEqual(s1.fine, s0.fine);
  assert.ok(s1.fineChanged && !s1.coarseChanged);
});

check('driving 25 km changes the coarse seed', () => {
  const g = new GeoSeeder({ minFineHoldMs: 0 });
  const s0 = g.update(48.0, 11.0, 5, 0);
  const s1 = g.update(48.0 + 25000 / M_PER_DEG, 11.0, 5, 1000);
  assert.ok(s1 && s1.coarseChanged);
  assert.notEqual(s1.coarse, s0.coarse);
});

check('fine updates are rate limited, coarse updates are not', () => {
  const g = new GeoSeeder({ minFineHoldMs: 20000 });
  g.update(48.0, 11.0, 5, 0);
  assert.equal(g.update(48.0 + 400 / M_PER_DEG, 11.0, 5, 5000), null, 'held back');
  assert.ok(g.update(48.0 + 400 / M_PER_DEG, 11.0, 5, 21000), 'released after hold');
  const far = g.update(49.0, 11.0, 5, 21100);
  assert.ok(far && far.coarseChanged, 'coarse change immediate');
});

check('poor accuracy (indoors, 800 m) holds the fine seed, still tracks coarse', () => {
  const g = new GeoSeeder({ minFineHoldMs: 0 });
  const s0 = g.update(48.0, 11.0, 5, 0);
  assert.equal(g.update(48.0 + 600 / M_PER_DEG, 11.0, 800, 60000), null);
  const s1 = g.update(48.0 + 600 / M_PER_DEG, 11.0, 5, 120000);
  assert.ok(s1 && s1.fine !== s0.fine);
});

check('invalid input is ignored', () => {
  const g = new GeoSeeder();
  assert.equal(g.update(NaN, 8, 5, 0), null);
  assert.equal(g.update(91, 8, 5, 0), null);
  assert.equal(g.update(40, 8, 99999999, 0), null);
});

check('longitude step is latitude-corrected: ~110 m cells at 60 N and at the equator', () => {
  const widthAt = (lat) => {
    const g = new GeoSeeder({ minFineHoldMs: 0, hyst: 0 });
    let prev = g.update(lat, 10.0, 5, 0).fine;
    let startLon = null;
    const widths = [];
    for (let i = 0; i < 6000; i++) {
      const lon = 10.0 + i * 0.00001;
      const s = g.update(lat, lon, 5, i);
      if (s && s.fine !== prev) {
        if (startLon !== null) widths.push(distanceM(lat, startLon, lat, lon));
        startLon = lon;
        prev = s.fine;
      }
    }
    return widths.length ? widths.reduce((a, b) => a + b) / widths.length : NaN;
  };
  const eq = widthAt(0.0005);
  const hi = widthAt(60.0005);
  assert.ok(Math.abs(eq - 111) < 12, 'equator width ' + eq);
  assert.ok(Math.abs(hi - 111) < 20, '60N width ' + hi);
});

check('southern/western hemispheres work (negative cell indices)', () => {
  const g = new GeoSeeder({ minFineHoldMs: 0 });
  const s0 = g.update(-33.8688, -70.6483, 5, 0);
  const s1 = g.update(-33.8688 - 400 / M_PER_DEG, -70.6483, 5, 1000);
  assert.ok(s0 && s1 && s0.fine !== s1.fine);
});

console.log('SpeedTracker');
const walk = (tr, mps, secs, acc, lat0 = 48.0) => {
  for (let t = 0; t <= secs; t++) tr.update(lat0 + (mps * t) / M_PER_DEG, 11.0, acc, t * 1000);
};

check('standing still with GPS jitter (+-6 m, acc 10) reads as ~0 speed', () => {
  const tr = new SpeedTracker();
  for (let t = 0; t < 120; t++) tr.update(48.0 + (((t * 37) % 13) - 6) / M_PER_DEG, 11.0 + (((t * 53) % 11) - 5) / (M_PER_DEG * 0.67), 10, t * 1000);
  assert.ok(tr.speed < 0.2, 'speed ' + tr.speed);
  assert.ok(tr.factor < 0.1);
});

check('walking 1.4 m/s, cycling 6 m/s, driving 15 m/s settle near their speeds and order the tempo factor', () => {
  const f = [];
  for (const v of [1.4, 6, 15]) {
    const tr = new SpeedTracker();
    walk(tr, v, 60, 5);
    assert.ok(Math.abs(tr.speed - v) < v * 0.1, `${v}: measured ${tr.speed.toFixed(2)}`);
    f.push(tr.factor);
  }
  assert.ok(f[0] < f[1] && f[1] < f[2], 'factors ' + f.map((x) => x.toFixed(2)).join(','));
  assert.ok(f[0] > 0.15 && f[0] < 0.35 && f[2] > 0.7, 'factors ' + f.map((x) => x.toFixed(2)).join(','));
});

check('reported GPS speed is preferred over computed displacement', () => {
  const tr = new SpeedTracker();
  for (let t = 0; t < 40; t++) tr.update(48.0, 11.0, 5, t * 1000, 9);
  assert.ok(Math.abs(tr.speed - 9) < 0.9, 'speed ' + tr.speed);
});

check('speed decays towards 0 after movement stops (no updates)', () => {
  const tr = new SpeedTracker();
  walk(tr, 15, 40, 5);
  const v0 = tr.speed;
  for (let t = 41; t < 100; t++) tr.tick(t * 1000);
  assert.ok(tr.speed < v0 * 0.05, `from ${v0.toFixed(1)} to ${tr.speed.toFixed(2)}`);
});

check('Manual mode: a jump to a far place reads as fast, then calms down; idle settles at 0', () => {
  const tr = new SpeedTracker();
  tr.update(47.3769, 8.5417, 0, 0);
  tr.update(35.6762, 139.6503, 0, 10000); // Zurich -> Tokyo, 10 s later
  assert.ok(tr.factor > 0.9, 'factor ' + tr.factor);
  assert.ok(tr.speed <= MAX_SPEED_MS + 1e-9);
  for (let t = 11; t < 120; t++) tr.tick(t * 1000);
  assert.ok(tr.factor < 0.1, 'factor after idle ' + tr.factor);
});

check('speed is capped at 100 km/h, however fast the position moves or the GPS reports', () => {
  assert.ok(Math.abs(MAX_SPEED_MS * 3.6 - 100) < 1e-9);
  const fast = new SpeedTracker();
  walk(fast, 250, 60, 5); // 900 km/h by displacement
  assert.ok(fast.speed <= MAX_SPEED_MS + 1e-9 && fast.speed > MAX_SPEED_MS * 0.98, 'speed ' + fast.speed);
  assert.ok(fast.factor > 0.98, 'factor ' + fast.factor);
  const reported = new SpeedTracker();
  for (let t = 0; t < 60; t++) reported.update(48.0, 11.0, 5, t * 1000, 90); // GPS says 324 km/h
  assert.ok(reported.speed <= MAX_SPEED_MS + 1e-9, 'speed ' + reported.speed);
  const slower = new SpeedTracker();
  walk(slower, 20, 60, 5); // 72 km/h is not capped
  assert.ok(Math.abs(slower.speed - 20) < 2, 'speed ' + slower.speed);
});

check('first fix, tiny dt and missing accuracy are handled', () => {
  const tr = new SpeedTracker();
  tr.update(1, 1, undefined, 0);
  assert.equal(tr.speed, 0);
  tr.update(1.001, 1, undefined, 10); // 10 ms later: ignored
  assert.equal(tr.speed, 0);
  assert.equal(tr.factor, 0);
});

console.log(failures ? `\n${failures} test(s) FAILED` : '\nAll geo tests passed');
process.exit(failures ? 1 : 0);
