// Runs geosynth.html (the single-file build) in jsdom with scripts enabled.
// Needs jsdom. Run: node tools/build.mjs && node tools/build-single.mjs && node test/test_single.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const page = readFileSync(new URL('../geosynth.html', import.meta.url), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeDom({ workletWorks, fullPage, geo }) {
  const ctxLog = { sp: null, modules: [], nodes: [] };
  const vc = new VirtualConsole();
  const errors = [];
  // jsdom has no canvas implementation; the app handles a null context.
  vc.on('jsdomError', (e) => {
    if (!/getContext/.test(e.message)) errors.push(e.message);
  });
  const dom = new JSDOM(
    fullPage || '<!doctype html><html><head><meta charset="utf-8"></head><body>' + page.replace('<title>GeoSynth</title>', '') + '</body></html>',
    {
      url: 'https://artifact.example/',
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      virtualConsole: vc,
      beforeParse(w) {
        w.isSecureContext = true;
        if (geo) {
          Object.defineProperty(w.navigator, 'geolocation', {
            value: { watchPosition: (ok, err, opts) => { geo.watch = { ok, err, opts }; return 1; }, clearWatch() {} },
            configurable: true,
          });
        }
        w.URL.createObjectURL = () => 'blob:fake';
        const node = () => ({ connect() { return this; }, disconnect() {} });
        class Ctx {
          constructor() {
            this.state = 'running';
            this.sampleRate = 48000;
            this.destination = node();
            this.audioWorklet = {
              addModule: async (u) => {
                ctxLog.modules.push(u);
                if (!workletWorks) throw new Error('blocked by CSP');
              },
            };
          }
          createAnalyser() { return { ...node(), frequencyBinCount: 256, getByteFrequencyData() {} }; }
          createMediaStreamDestination() { return { ...node(), stream: {} }; }
          createScriptProcessor(size, i, o) { ctxLog.sp = { ...node(), size, onaudioprocess: null }; return ctxLog.sp; }
          async resume() {}
          async suspend() {}
        }
        w.AudioContext = Ctx;
        class WNode {
          constructor() { this.port = { postMessage: (m) => ctxLog.nodes.push(m), onmessage: null }; }
          connect() { return this; }
          disconnect() {}
        }
        w.AudioWorkletNode = WNode;
        w.HTMLMediaElement.prototype.play = async () => {};
        w.HTMLMediaElement.prototype.pause = () => {};
      },
    }
  );
  return { dom, ctxLog, errors };
}

let n = 0;
const ok = (m) => console.log('  ok  ', ++n, m);

// ---- Scenario 1: AudioWorklet blocked -> main-thread engine produces sound
{
  const { dom, ctxLog, errors } = makeDom({ workletWorks: false });
  const w = dom.window;
  const $ = (id) => w.document.getElementById(id);
  assert.deepEqual(errors, [], 'no script errors on load: ' + errors.join('; '));
  assert.equal(w.GEOSYNTH_WORKLET_URL, 'blob:fake');
  assert.ok($('source').querySelector('[data-src="gps"]').hidden, 'GPS button hidden');
  assert.equal(w.__geosynth.source, 'manual');
  assert.equal($('posBanner').dataset.gps, 'off');
  assert.equal($('bannerTitle').textContent, 'Not using GPS');
  assert.match($('bannerDetail').textContent, /manual position .* GPS is blocked on this page/);
  ok('page scripts run cleanly; GPS hidden; default source is Manual; worklet blob URL created; banner says GPS is not in use');

  $('startBtn').click();
  await sleep(100);
  assert.equal(w.__geosynth.engineMode, 'main-thread');
  assert.deepEqual(ctxLog.modules, ['blob:fake']);
  assert.ok(ctxLog.sp && ctxLog.sp.onaudioprocess, 'ScriptProcessor installed');
  assert.equal($('player').hidden, false);
  ok('worklet failure falls back to the main-thread engine');

  // Pull ~12 s of audio the way the browser would (2048-frame callbacks).
  let peak = 0;
  let sum = 0;
  let count = 0;
  const L = new Float32Array(2048);
  const R = new Float32Array(2048);
  const outputBuffer = { length: 2048, getChannelData: (c) => (c ? R : L) };
  for (let i = 0; i < Math.ceil((48000 * 12) / 2048); i++) {
    ctxLog.sp.onaudioprocess({ outputBuffer });
    for (let j = 0; j < 2048; j++) {
      const a = Math.abs(L[j]);
      peak = Math.max(peak, a);
      sum += L[j] * L[j];
      count++;
      assert.ok(Number.isFinite(L[j]) && Number.isFinite(R[j]));
    }
  }
  const rmsDb = 10 * Math.log10(sum / count + 1e-12);
  assert.ok(peak > 0.05 && peak <= 1, 'peak ' + peak);
  assert.ok(rmsDb > -40, 'rms ' + rmsDb.toFixed(1));
  ok(`fallback renders audible audio (peak ${peak.toFixed(2)}, rms ${rmsDb.toFixed(1)} dBFS)`);

  assert.notEqual($('styleName').textContent, '-');
  assert.match($('keyInfo').textContent, /bpm/);
  assert.match($('posText').textContent, /47\.37690.N/);
  ok('UI shows the style/key/bpm and Zurich position from the bar callbacks');

  // Choose Tokyo; music must change region seed -> different key/style info eventually.
  const first = $('styleName').textContent + $('keyInfo').textContent;
  [...$('presets').children].find((b) => b.textContent === 'Tokyo').click();
  for (let i = 0; i < Math.ceil((48000 * 12) / 2048); i++) ctxLog.sp.onaudioprocess({ outputBuffer });
  const second = $('styleName').textContent + $('keyInfo').textContent;
  assert.notEqual(first, second, 'Tokyo should sound different from Zurich');
  // Sax on the main-thread fallback engine: audible, finite, and the lead line is forced on.
  $('leadChips').querySelector('[data-lead="sax"]').click();
  let p2 = 0;
  for (let i = 0; i < Math.ceil((48000 * 10) / 2048); i++) {
    ctxLog.sp.onaudioprocess({ outputBuffer });
    for (let j = 0; j < 2048; j++) {
      assert.ok(Number.isFinite(L[j]) && Number.isFinite(R[j]));
      p2 = Math.max(p2, Math.abs(L[j]));
    }
  }
  assert.ok(p2 > 0.05, 'audible with sax lead: ' + p2);
  assert.equal([...w.document.querySelectorAll('#layers .on')].some((e) => e.dataset.layer === 'lead'), true);
  ok('fallback engine: lead instrument and tempo messages are handled (sax forces the lead layer on)');
  // Hand-set tempo reaches the main-thread engine.
  $('bpmSlider').value = '70';
  $('bpmSlider').dispatchEvent(new w.Event('input'));
  for (let i = 0; i < Math.ceil((48000 * 8) / 2048); i++) ctxLog.sp.onaudioprocess({ outputBuffer });
  assert.match($('keyInfo').textContent, /70 bpm/);
  ok('fallback engine: the BPM slider sets the tempo');
  ok(`switching Zurich -> Tokyo changes the music (${first.replace(/\s+/g, ' ')} -> ${second.replace(/\s+/g, ' ')})`);
}

// ---- Scenario 2: AudioWorklet available -> uses it
{
  const { dom, ctxLog, errors } = makeDom({ workletWorks: true });
  const w = dom.window;
  w.document.getElementById('startBtn').click();
  await sleep(100);
  assert.equal(w.__geosynth.engineMode, 'worklet');
  assert.equal(ctxLog.sp, null, 'no ScriptProcessor when the worklet works');
  assert.ok(ctxLog.nodes.some((m) => m.type === 'seed'), 'seed posted to the worklet');
  assert.deepEqual(errors, []);
  ok('worklet path is used when available and receives the seed');
}

// ---- Scenario 3: site/index.html, the page for your own HTTPS hosting (GPS on)
{
  const site = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
  const version = /VERSION = '(\d+\.\d+)'/.exec(readFileSync(new URL('../src/version.js', import.meta.url), 'utf8'))[1];
  assert.match(site, /^<!doctype html>/i);
  assert.match(site, /rel="apple-touch-icon" href="apple-touch-icon.png"/);
  assert.match(site, /apple-mobile-web-app-capable/);
  const geo = { watch: null };
  const { dom, errors } = makeDom({ workletWorks: true, fullPage: site, geo });
  const w = dom.window;
  const $ = (id) => w.document.getElementById(id);
  assert.deepEqual(errors, [], errors.join('; '));
  assert.equal($('source').querySelector('[data-src="gps"]').hidden, false, 'GPS button visible');
  assert.equal(w.__geosynth.source, 'gps');
  assert.equal($('version').textContent, 'v' + version);
  assert.equal($('bannerTitle').textContent, 'GPS selected');
  $('startBtn').click();
  await sleep(100);
  assert.ok(geo.watch && geo.watch.opts.enableHighAccuracy, 'GPS watch started');
  assert.equal($('bannerTitle').textContent, 'Waiting for a GPS fix');
  geo.watch.ok({ coords: { latitude: 47.3769, longitude: 8.5417, accuracy: 9, speed: null } });
  assert.equal($('posBanner').dataset.gps, 'live');
  assert.equal($('bannerTitle').textContent, 'Using live GPS position');
  ok(`hosted page: GPS enabled and starts a watch, banner goes live on a fix, footer shows v${version}`);
}

console.log(`\nSingle-file build passed (${n} checks)`);
process.exit(0);
