// Offline app shell. Bump CACHE when shipping changes so clients refresh.
const CACHE = 'geosynth-v1.6';
const ASSETS = [
  './',
  'index.html',
  'style.css',
  'manifest.webmanifest',
  'worklet.bundle.js',
  'src/main.js',
  'src/dom.js',
  'src/store.js',
  'src/state.js',
  'src/banner.js',
  'src/tempo.js',
  'src/bar.js',
  'src/audio.js',
  'src/position.js',
  'src/controls.js',
  'src/viz.js',
  'src/wakelock.js',
  'src/geo.js',
  'src/version.js',
  'engine/rng.js',
  'engine/theory.js',
  'engine/composer.js',
  'engine/patches.js',
  'engine/voices.js',
  'engine/instrument.js',
  'engine/fx.js',
  'engine/engine.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache first, refresh in the background (new version applies on next load).
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
