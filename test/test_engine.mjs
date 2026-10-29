// Offline engine tests. Run: node test/test_engine.mjs
import assert from 'node:assert/strict';
import { Engine } from '../engine/engine.js';
import { Composer } from '../engine/composer.js';
import { STYLES } from '../engine/theory.js';
import { PATCHES, LEAD_INSTRUMENTS } from '../engine/patches.js';
import { SynthVoice } from '../engine/voices.js';

const SR = 48000;
const BLOCK = 128;

function render(engine, seconds) {
  const n = Math.floor(seconds * SR);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const bl = new Float32Array(BLOCK);
  const br = new Float32Array(BLOCK);
  for (let i = 0; i < n; i += BLOCK) {
    const m = Math.min(BLOCK, n - i);
    engine.render(bl, br, m);
    L.set(bl.subarray(0, m), i);
    R.set(br.subarray(0, m), i);
  }
  return { L, R };
}

function fnv(arr) {
  const u = new Uint32Array(arr.buffer, arr.byteOffset, arr.length);
  let h = 2166136261;
  for (let i = 0; i < u.length; i++) {
    h ^= u[i];
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function stats(L, R, from, to) {
  let peak = 0;
  let sum = 0;
  let bad = 0;
  for (let i = from; i < to; i++) {
    const a = L[i];
    const b = R[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) bad++;
    peak = Math.max(peak, Math.abs(a), Math.abs(b));
    sum += a * a + b * b;
  }
  const rms = Math.sqrt(sum / (2 * (to - from)));
  return { peak, rmsDb: 20 * Math.log10(rms + 1e-12), bad };
}

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

console.log('Composer');
check('same seed gives identical events; different fine seed differs', () => {
  const dump = (fine) => {
    const c = new Composer();
    c.setSeed({ style: 1, coarse: 777, fine });
    const out = [];
    for (let b = 0; b < 32; b++) out.push(c.nextBar().steps);
    return JSON.stringify(out);
  };
  assert.equal(dump(42), dump(42));
  assert.notEqual(dump(42), dump(43));
});

check('auto style maps coarse seed to a valid style', () => {
  const seen = new Set();
  for (let c = 0; c < 400; c++) {
    const comp = new Composer();
    comp.setSeed({ style: -1, coarse: c * 7919, fine: 1 });
    comp.nextBar();
    seen.add(comp.info().style);
  }
  assert.equal(seen.size, STYLES.length, 'all styles reachable, got ' + seen.size);
});

console.log('Engine');
const rows = [];
for (let si = 0; si < STYLES.length; si++) {
  const e = new Engine(SR);
  e.setSeed({ style: si, coarse: 4242 + si * 31, fine: 99991 });
  const t0 = process.hrtime.bigint();
  const { L, R } = render(e, 40);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const st = stats(L, R, SR * 5, 40 * SR);
  rows.push({ style: STYLES[si].name, ...st, rt: 40000 / ms });
  check(`${STYLES[si].name}: finite, not clipping hard, audible`, () => {
    assert.equal(st.bad, 0, 'non-finite samples');
    assert.ok(st.peak <= 1.0, 'peak ' + st.peak);
    assert.ok(st.rmsDb > -38 && st.rmsDb < -8, 'rms ' + st.rmsDb.toFixed(1) + ' dBFS');
  });
}

console.log('\n  style     peak   rms(dBFS)  x-realtime');
for (const r of rows) {
  console.log(
    '  ' + r.style.padEnd(8), r.peak.toFixed(3).padStart(6), r.rmsDb.toFixed(1).padStart(9), r.rt.toFixed(0).padStart(9) + 'x'
  );
}
console.log();

check('offline render is bit-exact deterministic', () => {
  const h = () => {
    const e = new Engine(SR);
    e.setSeed({ style: 2, coarse: 5, fine: 6 });
    const { L } = render(e, 12);
    return fnv(L);
  };
  assert.equal(h(), h());
});

check('block size does not change the music (same output within filter-update jitter)', () => {
  const run = (blk) => {
    const e = new Engine(SR);
    e.setSeed({ style: 1, coarse: 5, fine: 6 });
    const n = SR * 6;
    const L = new Float32Array(n);
    const bl = new Float32Array(blk);
    const br = new Float32Array(blk);
    for (let i = 0; i < n; i += blk) {
      const m = Math.min(blk, n - i);
      e.render(bl, br, m);
      L.set(bl.subarray(0, m), i);
    }
    return L;
  };
  const a = run(128);
  const b = run(100);
  let sig = 0;
  let err = 0;
  for (let i = 0; i < a.length; i++) {
    sig += a[i] * a[i];
    err += (a[i] - b[i]) * (a[i] - b[i]);
  }
  const snr = 10 * Math.log10(sig / (err + 1e-30));
  console.log('        block 128 vs 100 SNR: ' + snr.toFixed(1) + ' dB');
  assert.ok(snr > 30, 'SNR ' + snr.toFixed(1) + ' dB');
});

check('bars are sample-accurate and new seeds latch only at bar boundaries', () => {
  const e = new Engine(SR);
  const starts = [];
  const infos = [];
  e.onBar = (plan, info) => {
    starts.push(e.samplePos);
    infos.push(info.styleName + '/' + info.bpm);
  };
  e.setSeed({ style: 2, coarse: 10, fine: 10 }); // Pulse
  render(e, 6);
  e.setSeed({ style: 0, coarse: 20, fine: 20 }); // Drift, mid-bar
  render(e, 10);
  const n = starts.length;
  assert.ok(n >= 5, 'bars seen: ' + n);
  // Interval between bars equals 16 steps at the active tempo (+-1 sample).
  for (let i = 1; i < starts.length; i++) {
    if (infos[i] !== infos[i - 1]) continue;
    const bpm = Number(infos[i].split('/')[1]);
    const expect = (SR * 60 * 4) / bpm;
    assert.ok(Math.abs(starts[i] - starts[i - 1] - expect) <= 1.01, `bar ${i}: ${starts[i] - starts[i - 1]} vs ${expect}`);
  }
  assert.ok(infos.some((s) => s.startsWith('Pulse')) && infos.some((s) => s.startsWith('Drift')));
  // Style never changes except exactly on a bar callback (by construction), and
  // exactly one transition occurred.
  let transitions = 0;
  for (let i = 1; i < infos.length; i++) if (infos[i] !== infos[i - 1]) transitions++;
  assert.equal(transitions, 1);
});

check('rapid seed changes (walking) never produce NaN or runaway level', () => {
  const e = new Engine(SR);
  let worst = 0;
  for (let k = 0; k < 20; k++) {
    e.setSeed({ style: -1, coarse: 100 + (k % 3), fine: 1000 + k });
    const { L, R } = render(e, 1.5);
    const s = stats(L, R, 0, L.length);
    assert.equal(s.bad, 0);
    worst = Math.max(worst, s.peak);
  }
  assert.ok(worst <= 1);
});

check('long run stays alive: no >3 s stretch of silence in any style', () => {
  for (let si = 0; si < STYLES.length; si++) {
    const e = new Engine(SR);
    e.setSeed({ style: si, coarse: 1 + si, fine: 5 + si });
    const { L, R } = render(e, 120);
    let silent = 0;
    let worst = 0;
    const W = SR / 4;
    for (let i = SR * 4; i + W < L.length; i += W) {
      const s = stats(L, R, i, i + W);
      if (s.rmsDb < -60) silent += 0.25;
      else silent = 0;
      worst = Math.max(worst, silent);
    }
    assert.ok(worst <= 3, `${STYLES[si].name}: silent for ${worst}s`);
  }
});

console.log('Tempo, lead override, instruments');
check('tempo follows the factor from the style\'s slow end up to at least 160 bpm, slewing <= 12 bpm per bar', () => {
  const bpms = (f, bars) => {
    const c = new Composer();
    c.setSeed({ style: 1, coarse: 9, fine: 9 }); // Neon 96..116
    if (f !== undefined) c.setTempoFactor(f);
    const out = [];
    for (let b = 0; b < bars; b++) out.push(c.nextBar().bpm);
    return { c, out };
  };
  const seedBpm = bpms(undefined, 1).out[0];
  assert.ok(seedBpm >= 96 && seedBpm <= 116);
  const slow = bpms(0, 1).out[0];
  const fast = bpms(1, 1).out[0];
  assert.equal(slow, Math.round(96 * 0.9));
  assert.equal(fast, 160);
  // A slow style (Abyss 50..64) also reaches 160 at full speed, not 70.
  const abyss = new Composer();
  abyss.setSeed({ style: STYLES.findIndex((s) => s.id === 'abyss'), coarse: 9, fine: 9 });
  abyss.setTempoFactor(1);
  assert.equal(abyss.nextBar().bpm, 160);
  // A fast style keeps its own ceiling when that is higher (Arcade 132..150 -> 165).
  const arcade = new Composer();
  arcade.setSeed({ style: STYLES.findIndex((s) => s.id === 'arcade'), coarse: 9, fine: 9 });
  arcade.setTempoFactor(1);
  assert.equal(arcade.nextBar().bpm, Math.round(150 * 1.1));
  // Change factor mid-song: ramps, never jumps.
  const c = new Composer();
  c.setSeed({ style: 1, coarse: 9, fine: 9 });
  c.setTempoFactor(0);
  const seq = [c.nextBar().bpm];
  c.setTempoFactor(1);
  for (let b = 0; b < 10; b++) seq.push(c.nextBar().bpm);
  for (let i = 1; i < seq.length; i++) assert.ok(Math.abs(seq[i] - seq[i - 1]) <= 12, seq.join(','));
  assert.equal(seq.at(-1), fast, 'reaches the target: ' + seq.join(','));
  c.setTempoFactor(null);
  for (let b = 0; b < 12; b++) c.nextBar();
  assert.equal(c.nextBar().bpm, seedBpm, 'null returns to the seed tempo');
});

check('lead override forces the lead on, in the instrument range, in every style', () => {
  for (let si = 0; si < STYLES.length; si++) {
    const c = new Composer();
    c.setSeed({ style: si, coarse: 100 + si, fine: 7 });
    c.setLeadOverride({ lo: 55, hi: 81 });
    let leads = 0;
    for (let b = 0; b < 32; b++) {
      const plan = c.nextBar();
      assert.equal(plan.layers.lead, true);
      for (const st of plan.steps) for (const e of st) if (e.voice === 'lead') {
        leads++;
        assert.ok(e.note >= 55 && e.note <= 81, `${STYLES[si].name}: note ${e.note}`);
      }
    }
    assert.ok(leads >= 12, `${STYLES[si].name}: only ${leads} lead notes in 32 bars`);
  }
});

check('engine lead patch swaps the instrument and can be removed', () => {
  const e = new Engine(SR);
  e.setSeed({ style: 0, coarse: 3, fine: 3 });
  e.setLeadPatch('leadSax', 55, 81);
  assert.equal(e.leadPatch, PATCHES.leadSax);
  e.setLeadPatch(null);
  assert.equal(e.leadPatch, null);
  e.setLeadPatch('doesNotExist');
  assert.equal(e.leadPatch, null);
});

check('manual tempo override wins over movement and seed, is clamped, applies at once, and can be released', () => {
  const c = new Composer();
  c.setSeed({ style: 1, coarse: 9, fine: 9 });
  c.setTempoFactor(1);
  c.nextBar();
  c.setTempoOverride(171.4);
  assert.equal(c.nextBar().bpm, 171, 'no slewing for a hand-set tempo');
  c.setTempoOverride(5);
  assert.equal(c.nextBar().bpm, 40);
  c.setTempoOverride(9999);
  assert.equal(c.nextBar().bpm, 220);
  c.setTempoOverride(NaN);
  assert.equal(c.tempoOv, null, 'invalid value releases the override');
  // A new place does not reset a hand-set tempo.
  c.setTempoOverride(100);
  c.setSeed({ style: 3, coarse: 12345, fine: 1 });
  assert.equal(c.nextBar().bpm, 100);
  c.setTempoOverride(null);
  const after = [];
  for (let b = 0; b < 4; b++) after.push(c.nextBar().bpm);
  for (let i = 1; i < after.length; i++) assert.ok(Math.abs(after[i] - after[i - 1]) <= 12, after.join(','));
});

check('engine tempo override changes the step length mid-bar', () => {
  const e = new Engine(SR);
  e.setSeed({ style: 2, coarse: 10, fine: 10 });
  render(e, 3);
  const before = e.stepLen;
  e.setTempoOverride(60);
  assert.ok(Math.abs(e.stepLen - (SR * 60) / 60 / 4) < 1e-9);
  assert.ok(e.stepLen > before);
  e.setTempoOverride(null);
});

check('Techno: kick on every beat from the first bar, 16th hats, acid bass in the gaps, never on the beat', () => {
  const t = STYLES.findIndex((s) => s.id === 'techno');
  assert.ok(t >= 0 && STYLES[t].bpm[0] >= 120);
  for (const coarse of [1, 4242, 777]) {
    const c = new Composer();
    c.setSeed({ style: t, coarse, fine: 99 });
    let bass = 0;
    for (let b = 0; b < 48; b++) {
      const plan = c.nextBar();
      assert.equal(plan.layers.drums, true, 'drums in bar ' + b);
      assert.equal(plan.layers.bass, true, 'bass in bar ' + b);
      const has = (st, v) => plan.steps[st].some((e) => e.voice === v);
      for (const st of [0, 4, 8, 12]) assert.ok(has(st, 'kick'), `kick at ${st} in bar ${b}`);
      for (let st = 0; st < 16; st++) {
        assert.ok(has(st, 'hat'), `hat at ${st}`);
        if (st % 4 === 0) assert.ok(!has(st, 'bass'), 'bass left off the beat');
        for (const e of plan.steps[st]) if (e.voice === 'bass') { bass++; assert.ok(e.note >= 36 && e.note <= 72, 'bass note ' + e.note); }
      }
    }
    assert.ok(bass > 48 * 4, 'acid bass is busy: ' + bass);
  }
});

check('Smoke style swings its off-beat eighths', () => {
  const smoke = STYLES.findIndex((s) => s.id === 'smoke');
  assert.ok(smoke >= 0);
  const c = new Composer();
  c.setSeed({ style: smoke, coarse: 5, fine: 5 });
  assert.equal(c.nextBar().swing8, 0.6);
});

check('every patch renders finite, audible, bounded audio', () => {
  for (const [name, patch] of Object.entries(PATCHES)) {
    for (const note of [38, 57, 72, 91]) {
      const v = new SynthVoice(SR);
      const N = SR;
      const L = new Float32Array(N);
      const R = new Float32Array(N);
      const REV = new Float32Array(N);
      const DLY = new Float32Array(N);
      v.start(note, 0.8, N, patch, 0.5, 0, 0.3);
      for (let o = 0; o < N; o += 128) v.render(128, o, L, R, REV, DLY);
      let peak = 0;
      for (let i = 0; i < N; i++) {
        assert.ok(Number.isFinite(L[i]), `${name} n${note}: non-finite at ${i}`);
        peak = Math.max(peak, Math.abs(L[i]));
      }
      assert.ok(peak < 1.5, `${name} n${note}: peak ${peak}`);
      if (note >= 38 && note <= 72) assert.ok(peak > 0.01, `${name} n${note}: silent (${peak})`);
    }
  }
});

check('lead instruments all exist as patches', () => {
  for (const i of LEAD_INSTRUMENTS) if (i.patch) assert.ok(PATCHES[i.patch], i.patch);
});

console.log(failures ? `\n${failures} test(s) FAILED` : '\nAll engine tests passed');
process.exit(failures ? 1 : 0);
