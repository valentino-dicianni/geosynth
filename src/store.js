// Persistent settings (localStorage). Every access is guarded: storage can be
// missing or throw in private windows and embedded frames, and the app must
// still work without it.

export function load(key, fallback) {
  try {
    const v = localStorage.getItem('geosynth.' + key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem('geosynth.' + key, JSON.stringify(value));
  } catch {
    /* storage unavailable: fine */
  }
}
