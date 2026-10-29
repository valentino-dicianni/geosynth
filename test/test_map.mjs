// Map geometry (Web-Mercator) used by src/map.js. Run: node test/test_map.mjs
import assert from 'node:assert/strict';
import { mapToWorld, mapFromWorld } from '../src/map.js';

let n = 0;
const check = (name, fn) => {
  fn();
  console.log('  ok  ', ++n, name);
};

check('lat/lon -> world pixels -> lat/lon round trip, at any zoom', () => {
  for (const z of [1, 5.5, 12, 18]) {
    for (const [lat, lon] of [[47.3769, 8.5417], [-33.9249, 18.4241], [0, 0], [64.1466, -21.9426], [-0.1807, -78.4678], [84, 179.9]]) {
      const w = mapToWorld(lat, lon, z);
      const b = mapFromWorld(w.x, w.y, z);
      assert.ok(Math.abs(b.lat - lat) < 1e-7 && Math.abs(b.lon - lon) < 1e-7, `${lat},${lon} z${z}`);
    }
  }
});

check('tile numbers match the standard slippy-map formula (independent implementation)', () => {
  for (const [lat, lon, z] of [[47.3769, 8.5417, 12], [-33.9249, 18.4241, 9], [35.6762, 139.6503, 15], [64.1466, -21.9426, 6]]) {
    const r = (lat * Math.PI) / 180;
    const tx = Math.floor(((lon + 180) / 360) * 2 ** z);
    const ty = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
    const w = mapToWorld(lat, lon, z);
    assert.equal(Math.floor(w.x / 256), tx);
    assert.equal(Math.floor(w.y / 256), ty);
  }
});

check('one zoom level doubles the world size; the equator/prime meridian sit mid-world', () => {
  const a = mapToWorld(0, 0, 3);
  assert.deepEqual([a.x, a.y], [1024, 1024]);
  const b = mapToWorld(10, 20, 4);
  const c = mapToWorld(10, 20, 5);
  assert.ok(Math.abs(c.x - 2 * b.x) < 1e-6 && Math.abs(c.y - 2 * b.y) < 1e-6);
});

check('a pixel at zoom 18 near 47 N is about 0.4 m (so a 250 m style area is ~600 px)', () => {
  const a = mapToWorld(47, 8, 18);
  const b = mapFromWorld(a.x + 600, a.y, 18);
  const m = (b.lon - 8) * 111195 * Math.cos((47 * Math.PI) / 180);
  assert.ok(m > 230 && m < 270, 'metres: ' + m);
});

console.log(`\nMap geometry tests passed (${n} checks)`);
