// GeoSynth entry point: start button, event wiring, first-run setup.
import { $, isIOS, setStatus } from './dom.js';
import { load, save } from './store.js';
import { state } from './state.js';
import { VERSION } from './version.js';
import { updateBanner } from './banner.js';
import { PLACEHOLDER, applyRoute, sendSeed, setPlaying, startAudio } from './audio.js';
import { applyManual, setSource } from './position.js';
import { clampBpm, sendBpm, showBpm, speedTick } from './tempo.js';
import { buildLeadChips, buildPresets, buildStyleChips, setLeadInstrument } from './controls.js';
import { startViz } from './viz.js';
import { updateWakeLock } from './wakelock.js';

async function onStart() {
  const btn = $('startBtn');
  btn.disabled = true;
  btn.textContent = 'Starting...';
  setStatus('');
  try {
    await startAudio();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Start listening';
    setStatus('Could not start audio: ' + (e && e.message ? e.message : e));
    return;
  }
  $('start').hidden = true;
  $('player').hidden = false;
  startViz();
  sendSeed(PLACEHOLDER); // sound immediately; replaced when a position arrives
  setLeadInstrument(state.leadInst);
  sendBpm();
  state.lastFactor = -2;
  speedTick();
  state.speedTimer = setInterval(speedTick, 1000);
  setSource(state.source);
  updateWakeLock();
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setActionHandler('play', () => setPlaying(true));
      navigator.mediaSession.setActionHandler('pause', () => setPlaying(false));
    } catch {
      /* ignore */
    }
  }
}

// Restore saved settings into the state and the controls.
function restoreSettings() {
  state.style = load('style', -1);
  state.source = load('source', 'gps');
  state.route = load('route', isIOS() ? 'direct' : 'element');
  state.tempoFollow = load('tempoFollow', true);
  state.leadInst = load('leadPick', 'procedural');
  $('tempoFollow').checked = state.tempoFollow;
  state.bpm = clampBpm(Number(load('bpm', 120)) || 120);
  state.bpmManual = load('bpmManual', false) === true;
  $('bpmManual').checked = state.bpmManual;
  $('bpmSlider').value = String(state.bpm);
  showBpm();
  $('route').value = state.route;
  $('volume').value = String(load('volume', 0.8));
  const man = load('manual', null);
  if (Array.isArray(man)) {
    $('latIn').value = String(man[0]);
    $('lonIn').value = String(man[1]);
  }
}

function wireTempoControls() {
  $('tempoFollow').addEventListener('change', (e) => {
    state.tempoFollow = e.target.checked;
    save('tempoFollow', state.tempoFollow);
    speedTick();
  });
  $('bpmSlider').addEventListener('input', (e) => {
    state.bpm = Number(e.target.value);
    state.bpmManual = true; // touching the slider takes over the tempo
    $('bpmManual').checked = true;
    save('bpm', state.bpm);
    save('bpmManual', true);
    sendBpm();
    showBpm();
    speedTick();
  });
  $('bpmManual').addEventListener('change', (e) => {
    state.bpmManual = e.target.checked;
    // Start from the tempo that is playing, so switching on does not jump.
    if (state.bpmManual && state.curBpm) {
      state.bpm = clampBpm(state.curBpm);
      $('bpmSlider').value = String(state.bpm);
      save('bpm', state.bpm);
    }
    save('bpmManual', state.bpmManual);
    sendBpm();
    showBpm();
    speedTick();
  });
}

function wirePlayerControls() {
  $('startBtn').addEventListener('click', onStart);
  $('playBtn').addEventListener('click', () => setPlaying(!state.playing));
  $('volume').addEventListener('input', (e) => {
    const v = Number(e.target.value);
    save('volume', v);
    if (state.node) state.node.port.postMessage({ type: 'volume', value: v });
  });
  for (const b of document.querySelectorAll('#source button')) {
    b.addEventListener('click', () => setSource(b.dataset.src));
  }
  $('applyPos').addEventListener('click', applyManual);
  $('hold').addEventListener('change', (e) => {
    state.hold = e.target.checked;
    updateBanner();
  });
  $('wake').addEventListener('change', updateWakeLock);
  $('route').addEventListener('change', async (e) => {
    state.route = e.target.value;
    save('route', state.route);
    await applyRoute();
  });
  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden) {
      updateWakeLock();
      if (state.ctx && state.playing && state.ctx.state === 'suspended') {
        try {
          await state.ctx.resume();
        } catch {
          /* needs a tap */
        }
      }
    }
  });
}

// What this page can and cannot do: GPS needs HTTPS and a page that is allowed to ask for it.
function detectCapabilities() {
  if (!window.isSecureContext) {
    $('startNote').textContent = 'Not a secure context: GPS is unavailable, Manual and Demo walk still work.';
    state.gpsUnavailable = 'GPS needs HTTPS';
  } else if (!navigator.geolocation) {
    state.gpsUnavailable = 'this browser has no geolocation';
  }
  if (window.GEOSYNTH_NO_GPS) {
    // Hosted somewhere that refuses location (e.g. an embedded frame).
    state.gpsUnavailable = 'GPS is blocked on this page';
    state.source = state.source === 'gps' ? 'manual' : state.source;
    const gpsBtn = document.querySelector('#source [data-src="gps"]');
    if (gpsBtn) gpsBtn.hidden = true;
    for (const b of document.querySelectorAll('#source button')) b.style.gridColumn = 'auto';
    $('startNote').textContent =
      'GPS is not available on this page. Pick a city, enter coordinates, or use Demo walk to hear how place changes the music.';
  }
  if ('serviceWorker' in navigator && window.isSecureContext && !window.GEOSYNTH_NO_SW) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

function init() {
  restoreSettings();
  buildStyleChips();
  buildLeadChips();
  buildPresets();
  wireTempoControls();
  wirePlayerControls();
  detectCapabilities();
  updateBanner();
  $('version').textContent = 'v' + VERSION;
  // Expose for debugging/testing only.
  window.__geosynth = state;
}

init();
