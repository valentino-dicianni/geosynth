// Map for the Manual source: a small slippy map (OpenStreetMap tiles, no
// library). Drag to pan, pinch / wheel / +- to zoom, tap to put the pin there.
// Without a network the tiles stay blank, but tapping still picks a place.
import { $ } from './dom.js';
import { load, save } from './store.js';

const MAP_TILE = 256;
const MAP_MIN_Z = 1;
const MAP_MAX_Z = 18;
const MAP_MAX_LAT = 85.0511;
const MAP_TAP_PX = 8;
const MAP_TAP_MS = 600;
const MAP_TILE_URL = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

// Web-Mercator: degrees <-> pixels of the whole world at (fractional) zoom z.
export function mapToWorld(lat, lon, z) {
  const k = MAP_TILE * Math.pow(2, z);
  const la = Math.max(-MAP_MAX_LAT, Math.min(MAP_MAX_LAT, lat)) * (Math.PI / 180);
  return {
    x: ((lon + 180) / 360) * k,
    y: (0.5 - Math.log(Math.tan(Math.PI / 4 + la / 2)) / (2 * Math.PI)) * k,
  };
}

export function mapFromWorld(x, y, z) {
  const k = MAP_TILE * Math.pow(2, z);
  return {
    lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / k))) * 180) / Math.PI,
    lon: (x / k) * 360 - 180,
  };
}

const mapView = { lat: 47.3769, lon: 8.5417, z: 12 };
const mapPin = { lat: 47.3769, lon: 8.5417, set: false };
const mapTiles = new Map(); // "z/x/y" -> <img>
const mapPtrs = new Map(); // pointerId -> { x, y }
let mapBox = null;
let mapLayer = null;
let mapPinEl = null;
let mapNote = null;
let mapOnPick = null;
let mapGesture = null;
let mapTileOk = 0;
let mapTileBad = 0;

function mapWrapLon(lon) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

function mapClampZ(z) {
  return Math.max(MAP_MIN_Z, Math.min(MAP_MAX_Z, z));
}

function mapMoveView(wx, wy, z) {
  const c = mapFromWorld(wx, wy, z);
  mapView.lat = Math.max(-MAP_MAX_LAT, Math.min(MAP_MAX_LAT, c.lat));
  mapView.lon = mapWrapLon(c.lon);
  mapView.z = z;
}

function mapTileImg(key, url) {
  let img = mapTiles.get(key);
  if (img) return img;
  img = document.createElement('img');
  img.className = 'map-tile';
  img.alt = '';
  img.draggable = false;
  img.decoding = 'async';
  img.addEventListener('load', () => {
    mapTileOk++;
    if (mapNote) mapNote.hidden = true;
  });
  img.addEventListener('error', () => {
    mapTileBad++;
    img.style.visibility = 'hidden';
    if (mapNote && mapTileOk === 0 && mapTileBad >= 2) mapNote.hidden = false;
  });
  img.src = url;
  mapLayer.appendChild(img);
  mapTiles.set(key, img);
  return img;
}

export function mapRender() {
  if (!mapBox) return;
  if (mapPinEl) mapPinEl.hidden = !mapPin.set;
  const W = mapBox.clientWidth;
  const H = mapBox.clientHeight;
  if (!W || !H) return;
  const tz = Math.floor(mapView.z);
  const scale = Math.pow(2, mapView.z - tz);
  const size = MAP_TILE * scale;
  const c = mapToWorld(mapView.lat, mapView.lon, tz);
  const n = Math.pow(2, tz);
  const tx0 = Math.floor((c.x - W / 2 / scale) / MAP_TILE);
  const tx1 = Math.floor((c.x + W / 2 / scale) / MAP_TILE);
  const ty0 = Math.max(0, Math.floor((c.y - H / 2 / scale) / MAP_TILE));
  const ty1 = Math.min(n - 1, Math.floor((c.y + H / 2 / scale) / MAP_TILE));
  const used = new Set();
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const key = `${tz}/${tx}/${ty}`;
      used.add(key);
      const wx = ((tx % n) + n) % n;
      const img = mapTileImg(key, MAP_TILE_URL(tz, wx, ty));
      img.style.left = `${Math.round(W / 2 + (tx * MAP_TILE - c.x) * scale)}px`;
      img.style.top = `${Math.round(H / 2 + (ty * MAP_TILE - c.y) * scale)}px`;
      img.style.width = img.style.height = `${Math.ceil(size) + 1}px`;
    }
  }
  for (const [key, img] of mapTiles) {
    if (!used.has(key)) {
      img.remove();
      mapTiles.delete(key);
    }
  }
  if (mapPinEl) {
    if (mapPin.set) {
      const p = mapToWorld(mapPin.lat, mapPin.lon, tz);
      let px = W / 2 + (p.x - c.x) * scale;
      // The world repeats sideways: show the pin on the copy nearest the centre.
      const wrap = n * MAP_TILE * scale;
      px -= Math.round((px - W / 2) / wrap) * wrap;
      mapPinEl.style.left = `${px}px`;
      mapPinEl.style.top = `${H / 2 + (p.y - c.y) * scale}px`;
    }
  }
}

// Zoom to newZ keeping the geographic point under (px, py) where it is.
function mapZoomAt(px, py, newZ) {
  const W = mapBox.clientWidth;
  const H = mapBox.clientHeight;
  const z0 = mapView.z;
  const z1 = mapClampZ(newZ);
  const c0 = mapToWorld(mapView.lat, mapView.lon, z0);
  const geo = mapFromWorld(c0.x + (px - W / 2), c0.y + (py - H / 2), z0);
  const g1 = mapToWorld(geo.lat, geo.lon, z1);
  mapMoveView(g1.x - (px - W / 2), g1.y - (py - H / 2), z1);
  mapRender();
  save('mapZoom', Math.round(mapView.z * 10) / 10);
}

function mapPick(px, py) {
  const W = mapBox.clientWidth;
  const H = mapBox.clientHeight;
  const c = mapToWorld(mapView.lat, mapView.lon, mapView.z);
  const g = mapFromWorld(c.x + (px - W / 2), c.y + (py - H / 2), mapView.z);
  const lat = Math.max(-90, Math.min(90, g.lat));
  const lon = mapWrapLon(g.lon);
  mapPin.lat = lat;
  mapPin.lon = lon;
  mapPin.set = true;
  mapRender();
  if (mapOnPick) mapOnPick(lat, lon);
}

function mapLocal(ev) {
  const r = mapBox.getBoundingClientRect();
  return { x: ev.clientX - r.left, y: ev.clientY - r.top };
}

function mapPinchState() {
  const [a, b] = [...mapPtrs.values()];
  return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
}

function mapOnDown(ev) {
  if (ev.target && ev.target.closest && ev.target.closest('.map-zoom, .map-credit')) return;
  const p = mapLocal(ev);
  mapPtrs.set(ev.pointerId, p);
  try {
    mapBox.setPointerCapture(ev.pointerId);
  } catch {
    /* not supported for synthetic events */
  }
  if (mapPtrs.size === 1) {
    mapGesture = { t: ev.timeStamp, x0: p.x, y0: p.y, moved: 0, pinched: false };
  } else if (mapPtrs.size === 2) {
    const s = mapPinchState();
    mapGesture = { ...mapGesture, pinched: true, d0: s.d, z0: mapView.z, mx: s.mx, my: s.my };
  }
  ev.preventDefault();
}

function mapOnMove(ev) {
  if (!mapPtrs.has(ev.pointerId)) return;
  const p = mapLocal(ev);
  const prev = mapPtrs.get(ev.pointerId);
  mapPtrs.set(ev.pointerId, p);
  if (mapPtrs.size === 1) {
    mapGesture.moved = Math.max(mapGesture.moved, Math.hypot(p.x - mapGesture.x0, p.y - mapGesture.y0));
    if (mapGesture.moved > MAP_TAP_PX) {
      const c = mapToWorld(mapView.lat, mapView.lon, mapView.z);
      mapMoveView(c.x - (p.x - prev.x), c.y - (p.y - prev.y), mapView.z);
      mapRender();
    }
  } else if (mapPtrs.size === 2 && mapGesture && mapGesture.pinched) {
    const s = mapPinchState();
    // Pan by the midpoint's movement, then zoom around the midpoint.
    const c = mapToWorld(mapView.lat, mapView.lon, mapView.z);
    mapMoveView(c.x - (s.mx - mapGesture.mx), c.y - (s.my - mapGesture.my), mapView.z);
    mapGesture.mx = s.mx;
    mapGesture.my = s.my;
    mapZoomAt(s.mx, s.my, mapGesture.z0 + Math.log2(s.d / mapGesture.d0));
  }
  ev.preventDefault();
}

function mapOnUp(ev) {
  if (!mapPtrs.has(ev.pointerId)) return;
  const p = mapLocal(ev);
  mapPtrs.delete(ev.pointerId);
  const g = mapGesture;
  if (mapPtrs.size === 0 && g) {
    if (ev.type === 'pointerup' && !g.pinched && g.moved <= MAP_TAP_PX && ev.timeStamp - g.t < MAP_TAP_MS) {
      mapPick(p.x, p.y);
    }
    mapGesture = null;
  } else if (mapPtrs.size === 1 && g) {
    // One finger stays after a pinch: carry on panning from here without picking.
    g.moved = 1e9;
  }
}

export function mapSetPin(lat, lon) {
  mapPin.lat = lat;
  mapPin.lon = lon;
  mapPin.set = true;
  if (!mapBox) return;
  // Recentre when the pin is out of view (typed coordinates, city presets).
  const W = mapBox.clientWidth;
  const H = mapBox.clientHeight;
  const c = mapToWorld(mapView.lat, mapView.lon, mapView.z);
  const p = mapToWorld(lat, lon, mapView.z);
  const wrap = MAP_TILE * Math.pow(2, mapView.z);
  const dx = p.x - c.x - Math.round((p.x - c.x) / wrap) * wrap;
  if (!W || Math.abs(dx) > W * 0.4 || Math.abs(p.y - c.y) > H * 0.4) {
    mapView.lat = lat;
    mapView.lon = lon;
  }
  mapRender();
}

// Wire the map into #map. onPick(lat, lon) is called when the user taps.
export function initMap(onPick) {
  mapBox = $('map');
  if (!mapBox) return;
  mapOnPick = onPick;
  mapLayer = $('mapTiles');
  mapPinEl = $('mapPin');
  mapNote = $('mapNote');
  mapView.z = mapClampZ(Number(load('mapZoom', 12)) || 12);
  mapBox.addEventListener('pointerdown', mapOnDown);
  mapBox.addEventListener('pointermove', mapOnMove);
  mapBox.addEventListener('pointerup', mapOnUp);
  mapBox.addEventListener('pointercancel', mapOnUp);
  mapBox.addEventListener(
    'wheel',
    (ev) => {
      ev.preventDefault();
      const p = mapLocal(ev);
      mapZoomAt(p.x, p.y, mapView.z - ev.deltaY * 0.002);
    },
    { passive: false }
  );
  $('mapIn').addEventListener('click', () => mapZoomAt(mapBox.clientWidth / 2, mapBox.clientHeight / 2, Math.round(mapView.z) + 1));
  $('mapOut').addEventListener('click', () => mapZoomAt(mapBox.clientWidth / 2, mapBox.clientHeight / 2, Math.round(mapView.z) - 1));
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(mapRender).observe(mapBox);
  window.addEventListener('resize', mapRender);
}

// Start the view at the typed coordinates (call when the Manual panel opens).
export function mapShow(lat, lon) {
  if (!mapBox) return;
  if (Number.isFinite(lat) && Number.isFinite(lon) && !mapPin.set) {
    mapView.lat = lat;
    mapView.lon = lon;
    mapPin.lat = lat;
    mapPin.lon = lon;
    mapPin.set = true;
  }
  mapRender();
}
