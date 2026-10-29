// Handles the engine's per-bar report: style, key, tempo, layers, accent hue.
import { $ } from './dom.js';
import { state } from './state.js';
import { showBpm } from './tempo.js';
import { scaleLabel } from '../engine/theory.js';

const HUES = [200, 320, 275, 170, 235, 50, 25, 355, 95, 140, 340]; // one per style, in STYLES order

export function onWorkletMessage(ev) {
  const m = ev.data;
  if (!m || m.type !== 'bar') return;
  const info = m.info;
  state.curBpm = info.bpm;
  showBpm();
  $('styleName').textContent = info.styleName;
  $('keyInfo').textContent = `${info.key} ${scaleLabel(info.scale)}  ·  ${info.bpm} bpm`;
  document.documentElement.style.setProperty('--hue', String(HUES[info.style] ?? 190));
  for (const el of document.querySelectorAll('#layers [data-layer]')) {
    el.classList.toggle('on', !!m.layers[el.dataset.layer]);
  }
  const leadNow = info.leadName ? `Instrument here: ${info.leadName}` : '';
  if ($('leadNow').textContent !== leadNow) $('leadNow').textContent = leadNow;
  const steps = info.scaleSteps ? ` (steps ${info.scaleSteps.join(' · ')})` : '';
  const toneNow = `Here: ${info.key} ${scaleLabel(info.scale)}${steps}${info.micro ? ', with quarter tones' : ''}`;
  if ($('toneNow').textContent !== toneNow) $('toneNow').textContent = toneNow;
  const key = `${info.styleName}|${info.key}|${info.scale}`;
  if (key !== state.lastInfoKey) {
    state.lastInfoKey = key;
    updateMediaSession(info);
  }
}

function updateMediaSession(info) {
  if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `${info.styleName} in ${info.key} ${scaleLabel(info.scale)}`,
      artist: 'GeoSynth',
      album: 'Endless',
    });
  } catch {
    /* ignore */
  }
}
