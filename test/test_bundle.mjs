// Verifies worklet.bundle.js behaves exactly like the module engine, using a
// fake AudioWorklet global scope. Run: node tools/build.mjs && node test/test_bundle.mjs
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Engine } from '../engine/engine.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = readFileSync(join(root, 'worklet.bundle.js'), 'utf8');

const SR = 48000;
const messages = [];
let Registered = null;

class AudioWorkletProcessor {
  constructor() {
    this.port = { postMessage: (m) => messages.push(m), onmessage: null };
  }
}
const sandbox = {
  AudioWorkletProcessor,
  registerProcessor: (name, cls) => {
    assert.equal(name, 'geosynth');
    Registered = cls;
  },
  sampleRate: SR,
  Math,
  Float32Array,
  Number,
  Infinity,
  NaN,
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'worklet.bundle.js' });
assert.ok(Registered, 'processor registered');

const proc = new Registered();
const seed = { style: 3, coarse: 123456, fine: 654321 };
proc.port.onmessage({ data: { type: 'seed', seed } });

const ref = new Engine(SR);
ref.setSeed(seed);

const blocks = Math.floor((SR * 15) / 128);
const a = new Float32Array(128);
const b = new Float32Array(128);
const ra = new Float32Array(128);
const rb = new Float32Array(128);
let maxDiff = 0;
let peak = 0;
for (let i = 0; i < blocks; i++) {
  a.fill(0);
  b.fill(0);
  proc.process([[]], [[a, b]]);
  ref.render(ra, rb, 128);
  for (let j = 0; j < 128; j++) {
    maxDiff = Math.max(maxDiff, Math.abs(a[j] - ra[j]), Math.abs(b[j] - rb[j]));
    peak = Math.max(peak, Math.abs(a[j]));
  }
}
assert.equal(maxDiff, 0, 'bundle output differs from module engine: ' + maxDiff);
assert.ok(peak > 0.05, 'bundle is audible, peak ' + peak);
const bars = messages.filter((m) => m.type === 'bar');
assert.ok(messages.some((m) => m.type === 'ready'));
assert.ok(bars.length >= 5, 'bar messages: ' + bars.length);
assert.equal(bars[0].info.styleName, 'Glass');
assert.ok(Object.keys(bars[0].layers).length === 5);

// Mono output buffer (one channel) must not throw.
proc.process([[]], [[a]]);

console.log(`bundle ok: bit-identical to module engine over 15 s, ${bars.length} bar messages, peak ${peak.toFixed(3)}`);
