// Position sources: live GPS, manually entered coordinates, simulated walk.
// Every fix goes through onFix -> speed estimate + seed -> engine.
import { GeoSeeder, SpeedTracker } from './geo.js';
import { $, fmtCoord, hex8, setStatus } from './dom.js';
import { save } from './store.js';
import { state } from './state.js';
import { updateBanner } from './banner.js';
import { sendSeed } from './audio.js';

const M_PER_DEG = 111195;

function onFix(lat, lon, acc, gpsSpeed) {
  state.lastPos = { lat, lon, acc };
  if (state.source === 'gps') {
    state.gpsFixAt = performance.now();
    updateBanner();
  }
  state.speed.update(lat, lon, acc, performance.now(), gpsSpeed);
  $('posText').textContent =
    `${fmtCoord(lat, 'N', 'S')}  ${fmtCoord(lon, 'E', 'W')}` + (acc > 0 ? `  ±${Math.round(acc)} m` : '');
  if (state.hold) return;
  const seed = state.seeder.update(lat, lon, acc, performance.now());
  if (!seed) return;
  state.lastSeed = seed;
  $('cellText').textContent = `region ${hex8(seed.coarse)}  ·  spot ${hex8(seed.fine)}`;
  sendSeed(seed);
}

function stopSources() {
  if (state.watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(state.watchId);
  state.watchId = null;
  if (state.demoTimer) clearInterval(state.demoTimer);
  state.demoTimer = null;
}

// GPS cannot be used: switch to Manual (not saved as the preference) and say why.
function fallBackToManual(note, msg) {
  setSource('manual', false);
  state.bannerNote = note;
  updateBanner();
  setStatus(msg);
}

function startGps() {
  if (!window.isSecureContext) {
    fallBackToManual('GPS needs HTTPS', 'GPS needs HTTPS (or localhost). Use Manual or Demo walk here, or open the HTTPS address.');
    return;
  }
  if (!navigator.geolocation) {
    fallBackToManual('this browser has no geolocation', 'This browser has no geolocation. Using Manual.');
    return;
  }
  $('posText').textContent = 'waiting for a GPS fix... (playing a placeholder meanwhile)';
  state.watchId = navigator.geolocation.watchPosition(
    (p) => {
      setStatus('');
      onFix(p.coords.latitude, p.coords.longitude, p.coords.accuracy, p.coords.speed);
    },
    (err) => {
      if (err.code === 1) {
        fallBackToManual(
          'location permission denied',
          'Location permission denied. Switched to Manual; allow location in the browser settings to use GPS.'
        );
      } else {
        setStatus('No GPS fix yet (' + (err.message || 'unavailable') + '). Still trying.');
        updateBanner();
      }
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 }
  );
}

export function applyManual() {
  const lat = parseFloat($('latIn').value.replace(',', '.'));
  const lon = parseFloat($('lonIn').value.replace(',', '.'));
  if (!(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) {
    setStatus('Latitude must be -90..90 and longitude -180..180.');
    return;
  }
  setStatus('');
  save('manual', [lat, lon]);
  onFix(lat, lon, 0);
}

function startDemo() {
  const base = state.lastPos || { lat: 47.3769, lon: 8.5417 };
  state.demo = { lat: base.lat, lon: base.lon, heading: Math.random() * Math.PI * 2 };
  const tick = () => {
    const d = state.demo;
    const v = Number($('demoSpeed').value) || 30;
    d.heading += (Math.random() - 0.5) * 0.5;
    d.lat += (v * Math.cos(d.heading)) / M_PER_DEG;
    d.lon += (v * Math.sin(d.heading)) / (M_PER_DEG * Math.max(0.2, Math.cos((d.lat * Math.PI) / 180)));
    if (Math.abs(d.lat) > 80) d.heading += Math.PI;
    if (d.lon > 180) d.lon -= 360;
    if (d.lon < -180) d.lon += 360;
    onFix(d.lat, d.lon, 5);
  };
  tick();
  state.demoTimer = setInterval(tick, 1000);
}

export function setSource(src, persist = true) {
  state.source = src;
  if (persist) save('source', src);
  stopSources();
  state.gpsFixAt = null;
  state.bannerNote = '';
  state.speed = new SpeedTracker();
  state.seeder =
    src === 'gps' ? new GeoSeeder() : new GeoSeeder({ minFineHoldMs: 3000, fineAccuracyM: 1e9 });
  for (const b of document.querySelectorAll('#source button')) {
    b.setAttribute('aria-checked', String(b.dataset.src === src));
  }
  $('manualPanel').hidden = src !== 'manual';
  $('demoPanel').hidden = src !== 'demo';
  updateBanner();
  if (!state.node) return;
  if (src === 'gps') startGps();
  else if (src === 'manual') applyManual();
  else startDemo();
}
