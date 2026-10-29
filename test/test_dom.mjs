// Needs jsdom: npm install (devDependency). Run: node test/test_dom.mjs
// DOM wiring smoke test for src/main.js using jsdom + fake Web Audio / Geolocation.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const html = readFileSync(ROOT + '/index.html', 'utf8').replace(/<script[^>]*><\/script>/, '');
const vc = new VirtualConsole(); // swallow "not implemented" noise
const dom = new JSDOM(html, { url: 'https://localhost/', pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window;
w.isSecureContext = true;

const log = { addModule: [], messages: [], suspended: 0, resumed: 0, watch: null, cleared: [], played: 0 };

class FakeParam {}
class FakeNode {
  connect() { return this; }
  disconnect() {}
}
class FakeCtx {
  constructor() { this.state = 'suspended'; this.destination = new FakeNode(); this.audioWorklet = { addModule: async (p) => { log.addModule.push(p); } }; }
  createAnalyser() { const n = new FakeNode(); n.frequencyBinCount = 256; n.getByteFrequencyData = () => {}; return n; }
  createMediaStreamDestination() { const n = new FakeNode(); n.stream = {}; return n; }
  async resume() { this.state = 'running'; log.resumed++; }
  async suspend() { this.state = 'suspended'; log.suspended++; }
}
Object.defineProperty(FakeCtx.prototype, 'audioWorklet', { get() { return this._aw || (this._aw = { addModule: async (p) => { log.addModule.push(p); } }); }, set(v) { this._aw = v; }, configurable: true });
class FakeWorkletNode extends FakeNode {
  constructor(ctx, name, opts) { super(); this.name = name; this.opts = opts; this.port = { postMessage: (m) => log.messages.push(m), onmessage: null }; FakeWorkletNode.last = this; }
}
w.AudioContext = FakeCtx;
w.HTMLMediaElement.prototype.play = async function () { log.played++; };
w.HTMLMediaElement.prototype.pause = function () {};
Object.defineProperty(w.navigator, 'geolocation', {
  value: { watchPosition: (ok, err, opts) => { log.watch = { ok, err, opts }; return 7; }, clearWatch: (id) => log.cleared.push(id) },
  configurable: true,
});

globalThis.window = w;
globalThis.document = w.document;
Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
globalThis.localStorage = w.localStorage;
globalThis.requestAnimationFrame = w.requestAnimationFrame.bind(w);
globalThis.AudioWorkletNode = FakeWorkletNode;

const $ = (id) => w.document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const seeds = () => log.messages.filter((m) => m.type === 'seed').map((m) => m.seed);
let n = 0;
const ok = (name) => console.log('  ok  ', ++n, name);

await import(pathToFileURL(ROOT + '/src/main.js').href);
const state = w.__geosynth;

assert.equal($('styleChips').children.length, 11);
assert.equal($('leadChips').children.length, 9);
assert.equal($('presets').children.length, 7);
assert.equal($('player').hidden, true);
assert.ok([...$('styleChips').children].some((b) => b.textContent === 'Techno'));
ok('init builds 11 style chips (Auto + 10, incl. Techno), 9 lead instruments (incl. Procedural) and 7 presets; player hidden');

const banner = () => ({ mode: $('posBanner').dataset.gps, title: $('bannerTitle').textContent, detail: $('bannerDetail').textContent });
assert.deepEqual([banner().mode, banner().title], ['wait', 'GPS selected']);
ok('banner before Start: GPS selected, not yet running');

$('startBtn').click();
await sleep(50);
assert.equal($('start').hidden, true);
assert.equal($('player').hidden, false);
assert.deepEqual(log.addModule, ['worklet.bundle.js']);
assert.equal(FakeWorkletNode.last.name, 'geosynth');
assert.deepEqual(FakeWorkletNode.last.opts.outputChannelCount, [2]);
assert.ok(log.messages.some((m) => m.type === 'volume' && m.value === 0.8));
assert.equal(seeds().length, 1, 'placeholder seed sent immediately');
assert.ok(log.watch && log.watch.opts.enableHighAccuracy);
assert.ok(log.played >= 1, 'media element route started');
ok('start: worklet loaded, placeholder seed sent, GPS watch started, media element route');

assert.deepEqual([banner().mode, banner().title], ['wait', 'Waiting for a GPS fix']);
log.watch.ok({ coords: { latitude: 47.3769, longitude: 8.5417, accuracy: 12 } });
assert.deepEqual([banner().mode, banner().title], ['live', 'Using live GPS position']);
assert.match(banner().detail, /accuracy .12 m/);
state.gpsFixAt = performance.now() - 31000;
await sleep(1100);
assert.equal(banner().mode, 'wait');
assert.equal(banner().title, 'GPS: no new fix');
assert.match(banner().detail, /3\d s ago/);
log.watch.ok({ coords: { latitude: 47.3769, longitude: 8.5417, accuracy: 12 } });
assert.equal(banner().mode, 'live');
ok('banner: waiting for a fix -> using live GPS (with accuracy) -> flags a stale GPS -> live again');
assert.match($('posText').textContent, /47\.37690.N\s+8\.54170.E\s+.12 m/);
let s = seeds();
assert.equal(s.length, 2);
assert.equal(s[1].style, -1);
assert.ok(Number.isInteger(s[1].coarse) && Number.isInteger(s[1].fine));
assert.match($('cellText').textContent, /region [0-9a-f]{8}\s+.\s+spot [0-9a-f]{8}/);
ok('GPS fix updates the readout and posts a seed');

FakeWorkletNode.last.port.onmessage({
  data: { type: 'bar', info: { style: 2, styleName: 'Pulse', key: 'A', scale: 'phrygian', bpm: 128 }, layers: { pad: true, bass: false, arp: true, lead: false, drums: true } },
});
assert.equal($('styleName').textContent, 'Pulse');
assert.match($('keyInfo').textContent, /A phrygian.*128 bpm/);
assert.equal(w.document.documentElement.style.getPropertyValue('--hue'), '275');
const on = [...w.document.querySelectorAll('#layers .on')].map((e) => e.dataset.layer).sort();
assert.deepEqual(on, ['arp', 'drums', 'pad']);
ok('bar message updates style, key, tempo, hue and layer chips');

const before = seeds().length;
w.document.querySelector('#styleChips [data-style="1"]').click();
s = seeds();
assert.equal(s.length, before + 1);
assert.equal(s.at(-1).style, 1);
assert.equal(s.at(-1).coarse, s[1].coarse);
assert.equal(s.at(-1).fine, s[1].fine);
assert.equal(w.document.querySelector('#styleChips [data-style="1"]').getAttribute('aria-pressed'), 'true');
ok('choosing a style re-sends the same location seed with the override');

w.document.querySelector('#source [data-src="manual"]').click();
assert.equal($('manualPanel').hidden, false);
assert.ok(log.cleared.includes(7), 'GPS watch cleared');
const tokyo = [...$('presets').children].find((b) => b.textContent === 'Tokyo');
const nBefore = seeds().length;
tokyo.click();
s = seeds();
assert.equal(s.length, nBefore + 1);
assert.notEqual(s.at(-1).coarse, s[1].coarse);
assert.match($('posText').textContent, /35\.67620.N\s+139\.65030.E/);
assert.deepEqual([banner().mode, banner().title, banner().detail], ['off', 'Not using GPS', 'manual position']);
ok('manual source: preset city produces a different region seed; GPS watch was cleared; banner says not using GPS');

$('latIn').value = '123';
$('applyPos').click();
assert.match($('status').textContent, /Latitude must be/);
assert.equal(seeds().length, nBefore + 1, 'invalid input sends nothing');
ok('invalid manual coordinates are rejected with a message');

w.document.querySelector('#source [data-src="demo"]').click();
assert.equal($('demoPanel').hidden, false);
assert.ok(state.demoTimer);
assert.deepEqual([banner().mode, banner().title, banner().detail], ['off', 'Not using GPS', 'simulated walk']);
const d0 = seeds().length;
await sleep(2000);
assert.equal(seeds().length, d0, 'fine updates held back inside the 3 s rate limit');
await sleep(2600);
assert.ok(seeds().length > d0, 'demo walk produced seeds after the hold expired');
w.document.querySelector('#source [data-src="manual"]').click();
assert.equal(state.demoTimer, null, 'demo timer stopped on switch');
ok('demo walk emits seeds over time and stops when the source changes');

$('hold').checked = true;
$('hold').dispatchEvent(new w.Event('change'));
const h0 = seeds().length;
$('latIn').value = '-33.8688';
$('lonIn').value = '151.2093';
$('applyPos').click();
assert.equal(seeds().length, h0, 'hold ignores new positions');
assert.match($('posText').textContent, /33\.86880.S/);
assert.match(banner().detail, /music held/);
$('hold').checked = false;
$('hold').dispatchEvent(new w.Event('change'));
assert.doesNotMatch(banner().detail, /held/);
ok('hold keeps the current music while the readout still tracks the position');

$('playBtn').click();
await sleep(20);
assert.equal(log.suspended, 1);
assert.equal($('playBtn').textContent, 'Play');
$('playBtn').click();
await sleep(20);
assert.equal($('playBtn').textContent, 'Pause');
ok('pause/play suspend and resume the audio context');

w.document.querySelector('#source [data-src="gps"]').click();
log.watch.err({ code: 1, message: 'denied' });
assert.equal(state.source, 'manual');
assert.match($('status').textContent, /permission denied/i);
assert.equal(banner().mode, 'off');
assert.match(banner().detail, /manual position .* location permission denied/);
assert.equal(JSON.parse(w.localStorage.getItem('geosynth.source')), 'gps', 'denied fallback is not persisted as preference');
ok('GPS permission denied falls back to manual with a message, without overwriting the saved preference');

$('volume').value = '0.3';
$('volume').dispatchEvent(new w.Event('input'));
assert.ok(log.messages.some((m) => m.type === 'volume' && m.value === 0.3));
$('route').value = 'direct';
$('route').dispatchEvent(new w.Event('change'));
await sleep(20);
assert.equal(state.route, 'direct');
ok('volume and audio-route controls work');

// ---- tempo follows movement + lead instrument
{
  const tempos = () => log.messages.filter((m) => m.type === 'tempo');
  const leads = () => log.messages.filter((m) => m.type === 'lead');
  assert.ok(tempos().length >= 1, 'tempo message sent at start');
  assert.equal(leads().at(0).patch, 'procedural', 'start sends the default lead: procedural');
  FakeWorkletNode.last.port.onmessage({ data: { type: 'bar', info: { style: 2, styleName: 'Pulse', key: 'A', scale: 'phrygian', bpm: 128, leadName: 'plucked FM bell, airy' }, layers: {} } });
  assert.equal($('leadNow').textContent, 'Instrument here: plucked FM bell, airy');
  w.document.querySelector('#source [data-src="demo"]').click();
  await sleep(3300);
  assert.ok(state.speed.factor > 0.5, 'demo walk reads as fast: ' + state.speed.factor);
  assert.ok(tempos().at(-1).factor > 0.5, 'tempo message follows speed: ' + tempos().at(-1).factor);
  assert.match($('speedText').textContent, /km\/h/);
  assert.ok(state.speed.speed <= 100 / 3.6 + 1e-9, 'speed capped at 100 km/h: ' + state.speed.speed);
  ok('tempo factor follows the measured speed of the demo walk and is sent to the engine');

  $('tempoFollow').checked = false;
  $('tempoFollow').dispatchEvent(new w.Event('change'));
  assert.equal(tempos().at(-1).factor, null);
  assert.match($('speedText').textContent, /set by the place/);
  $('tempoFollow').checked = true;
  $('tempoFollow').dispatchEvent(new w.Event('change'));
  assert.ok(tempos().at(-1).factor !== null);
  ok('tempo-follow toggle switches between speed-driven and seed tempo');

  // Manual BPM slider
  {
    const bpms = () => log.messages.filter((m) => m.type === 'bpm');
    assert.equal(bpms().at(-1).bpm, null, 'start sends no manual tempo');
    FakeWorkletNode.last.port.onmessage({ data: { type: 'bar', info: { style: 2, styleName: 'Pulse', key: 'A', scale: 'phrygian', bpm: 128 }, layers: {} } });
    assert.equal($('bpmSlider').value, '128', 'slider shows the playing tempo while automatic');
    assert.equal($('bpmOut').textContent, '128 bpm');
    assert.equal($('bpmMode').textContent, 'automatic');
    $('bpmSlider').value = '90';
    $('bpmSlider').dispatchEvent(new w.Event('input'));
    assert.equal(bpms().at(-1).bpm, 90);
    assert.equal($('bpmManual').checked, true, 'moving the slider takes over');
    assert.equal($('bpmOut').textContent, '90 bpm');
    assert.equal($('bpmMode').textContent, 'set by hand');
    assert.match($('speedText').textContent, /set by hand/);
    FakeWorkletNode.last.port.onmessage({ data: { type: 'bar', info: { style: 2, styleName: 'Pulse', key: 'A', scale: 'phrygian', bpm: 90 }, layers: {} } });
    assert.equal($('bpmSlider').value, '90');
    assert.equal(JSON.parse(w.localStorage.getItem('geosynth.bpm')), 90);
    $('bpmManual').checked = false;
    $('bpmManual').dispatchEvent(new w.Event('change'));
    assert.equal(bpms().at(-1).bpm, null, 'unchecking returns to automatic tempo');
    $('bpmManual').checked = true;
    $('bpmManual').dispatchEvent(new w.Event('change'));
    assert.equal(bpms().at(-1).bpm, 90, 'switching on starts from the tempo that is playing');
    $('bpmManual').checked = false;
    $('bpmManual').dispatchEvent(new w.Event('change'));
    ok('BPM slider: shows the playing tempo, takes over when moved, sends bpm, releases when unchecked, remembers the value');
  }

  w.document.querySelector('#source [data-src="manual"]').click();
  await sleep(50);
  const idle = state.speed.factor;
  assert.ok(idle < 0.05, 'a fresh Manual session starts calm: ' + idle);
  ok('switching source resets the speed estimate');

  w.document.querySelector('#leadChips [data-lead="sax"]').click();
  const l = leads().at(-1);
  assert.deepEqual([l.patch, l.lo, l.hi], ['leadSax', 55, 81]);
  assert.equal(w.document.querySelector('#leadChips [data-lead="sax"]').getAttribute('aria-pressed'), 'true');
  assert.equal(JSON.parse(w.localStorage.getItem('geosynth.leadPick')), 'sax');
  w.document.querySelector('#leadChips [data-lead="auto"]').click();
  assert.equal(leads().at(-1).patch, null);
  ok('lead instrument picker sends the patch and its range, and remembers the choice');
}

console.log(`\nDOM smoke test passed (${n} checks)`);
process.exit(0);
