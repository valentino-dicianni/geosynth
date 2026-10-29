// Audio graph: engine node (AudioWorklet or main-thread fallback), output
// route, play/pause and the messages sent to the engine.
import { $, setStatus } from './dom.js';
import { state } from './state.js';
import { onWorkletMessage } from './bar.js';

// Played until the first position arrives, so there is sound right away.
export const PLACEHOLDER = { coarse: 0x1234abcd, fine: 0x9876fedc };

export async function startAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw new Error('Web Audio is not supported in this browser.');
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch {
    /* optional API */
  }
  const ctx = new Ctx({ latencyHint: 'playback' });
  state.ctx = ctx;
  const node = await createEngineNode(ctx);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.82;
  node.connect(analyser);
  state.node = node;
  state.analyser = analyser;
  ctx.onstatechange = () => {
    if (ctx.state === 'suspended' && state.playing) setStatus('Audio was interrupted. Tap Pause/Play to resume.');
  };
  node.port.postMessage({ type: 'volume', value: Number($('volume').value) });
  await applyRoute();
  state.playing = true;
  if (ctx.state === 'suspended') await ctx.resume();
}

// Preferred: the engine in an AudioWorklet (own thread, glitch-free). If the
// worklet cannot load (unsupported, blocked by CSP, bad URL), run the same
// engine on the main thread through a ScriptProcessorNode instead.
async function createEngineNode(ctx) {
  if ('audioWorklet' in ctx) {
    try {
      await ctx.audioWorklet.addModule(window.GEOSYNTH_WORKLET_URL || 'worklet.bundle.js');
      const node = new AudioWorkletNode(ctx, 'geosynth', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      node.port.onmessage = onWorkletMessage;
      state.engineMode = 'worklet';
      return node;
    } catch (e) {
      /* fall through to the main-thread engine */
    }
  }
  // In the one-file build the Engine class is already in scope; otherwise load the module.
  const EngineClass =
    typeof Engine !== 'undefined' ? Engine : (await import('../engine/engine.js')).Engine;
  const engine = new EngineClass(ctx.sampleRate);
  engine.onBar = (plan, info) =>
    onWorkletMessage({ data: { type: 'bar', info, bar: plan.bar, section: plan.section, layers: plan.layers, bpm: plan.bpm } });
  const sp = ctx.createScriptProcessor(2048, 0, 2);
  sp.onaudioprocess = (ev) => {
    const out = ev.outputBuffer;
    engine.render(out.getChannelData(0), out.getChannelData(1), out.length);
  };
  sp.port = {
    postMessage: (m) => {
      if (m.type === 'seed') engine.setSeed(m.seed);
      else if (m.type === 'volume') engine.setVolume(m.value);
      else if (m.type === 'tempo') engine.setTempoFactor(m.factor);
      else if (m.type === 'bpm') engine.setTempoOverride(m.bpm);
      else if (m.type === 'tone') engine.setTone(m.key, m.scale, m.quarter);
      else if (m.type === 'lead') engine.setLeadPatch(m.patch, m.lo, m.hi);
    },
  };
  state.engineMode = 'main-thread';
  return sp;
}

export async function applyRoute() {
  const { ctx, analyser } = state;
  if (!ctx || !analyser) return;
  const sink = $('sink');
  try {
    analyser.disconnect();
  } catch {
    /* not connected */
  }
  if (state.route === 'element') {
    try {
      if (!state.streamDest) state.streamDest = ctx.createMediaStreamDestination();
      analyser.connect(state.streamDest);
      sink.srcObject = state.streamDest.stream;
      await sink.play();
      return;
    } catch (e) {
      setStatus('Media player route unavailable here, using direct output.');
      try {
        analyser.disconnect();
      } catch {
        /* ignore */
      }
      state.route = 'direct';
      $('route').value = 'direct';
    }
  }
  sink.pause();
  sink.srcObject = null;
  analyser.connect(ctx.destination);
}

export function sendSeed(seed) {
  if (!state.node) return;
  state.node.port.postMessage({
    type: 'seed',
    seed: { style: state.style, coarse: seed.coarse >>> 0, fine: seed.fine >>> 0 },
  });
}

export async function setPlaying(on) {
  const { ctx } = state;
  if (!ctx) return;
  if (on) {
    await ctx.resume();
    if (state.route === 'element') {
      try {
        await $('sink').play();
      } catch {
        /* ignore */
      }
    }
  } else {
    $('sink').pause();
    await ctx.suspend();
  }
  state.playing = on;
  $('playBtn').textContent = on ? 'Pause' : 'Play';
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = on ? 'playing' : 'paused';
}
