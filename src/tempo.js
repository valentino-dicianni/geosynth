// Tempo: follows how fast the position changes, or the BPM slider.
import { MAX_SPEED_MS } from './geo.js';
import { $ } from './dom.js';
import { state } from './state.js';
import { updateBanner } from './banner.js';

const SLIDER_MIN = 40;
const SLIDER_MAX = 220;

export function clampBpm(v) {
  return Math.max(SLIDER_MIN, Math.min(SLIDER_MAX, Math.round(v)));
}

function kmh(v) {
  return (v * 3.6).toFixed(v * 3.6 < 10 ? 1 : 0);
}

function sendTempo() {
  if (!state.node) return;
  const f = state.tempoFollow ? state.speed.factor : null;
  const key = f === null ? -1 : Math.round(f * 200); // resend on ~0.5% change
  if (key !== state.lastFactor) {
    state.lastFactor = key;
    state.node.port.postMessage({ type: 'tempo', factor: f });
  }
}

// Called once a second: advances the speed estimate, sends the tempo factor,
// refreshes the banner (GPS staleness) and the speed readout.
export function speedTick() {
  state.speed.tick(performance.now());
  sendTempo();
  updateBanner();
  const v = state.speed.speed;
  let txt;
  if (state.bpmManual) {
    txt = 'tempo set by hand (slider)';
  } else if (state.tempoFollow) {
    const atMax = v >= MAX_SPEED_MS * 0.98; // the speed is capped at 100 km/h
    const moving = v < 0.3 ? 'not at all' : `${kmh(v)} km/h${atMax ? ' (max)' : ''}`;
    txt = `moving ${moving}  ·  tempo ${Math.round(state.speed.factor * 100)} %`;
  } else {
    txt = 'tempo set by the place';
  }
  if ($('speedText').textContent !== txt) $('speedText').textContent = txt;
}

// Manual BPM slider. While it is off, the slider just shows the tempo that is playing.
export function sendBpm() {
  if (!state.node) return;
  state.node.port.postMessage({ type: 'bpm', bpm: state.bpmManual ? state.bpm : null });
}

export function showBpm() {
  const shown = state.bpmManual ? state.bpm : state.curBpm;
  if (shown !== null && shown !== undefined) {
    $('bpmOut').textContent = `${Math.round(shown)} bpm`;
    if (!state.bpmManual) $('bpmSlider').value = String(Math.round(shown));
  }
  $('bpmMode').textContent = state.bpmManual ? 'set by hand' : 'automatic';
}
