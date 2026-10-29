// AudioWorklet entry point. build.mjs bundles this with the engine modules
// into worklet.bundle.js (a single classic script, no import resolution
// inside the worklet scope).

import { Engine } from './engine/engine.js';

class GeoSynthProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.engine = new Engine(sampleRate);
    this.engine.onBar = (plan, info) => {
      this.port.postMessage({
        type: 'bar',
        info,
        bar: plan.bar,
        section: plan.section,
        layers: plan.layers,
        bpm: plan.bpm,
      });
    };
    this.port.onmessage = (e) => {
      const m = e.data;
      if (!m) return;
      if (m.type === 'seed') this.engine.setSeed(m.seed);
      else if (m.type === 'volume') this.engine.setVolume(m.value);
      else if (m.type === 'tempo') this.engine.setTempoFactor(m.factor);
      else if (m.type === 'bpm') this.engine.setTempoOverride(m.bpm);
      else if (m.type === 'lead') this.engine.setLeadPatch(m.patch, m.lo, m.hi);
    };
    this.port.postMessage({ type: 'ready', sampleRate });
  }

  process(inputs, outputs) {
    const out = outputs[0];
    if (!out || !out.length) return true;
    const l = out[0];
    const r = out.length > 1 ? out[1] : out[0];
    this.engine.render(l, r, l.length);
    return true;
  }
}

registerProcessor('geosynth', GeoSynthProcessor);
