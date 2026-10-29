// The one mutable application state object, shared by all UI modules.
import { GeoSeeder, SpeedTracker } from './geo.js';

export const state = {
  ctx: null,
  node: null,
  analyser: null,
  streamDest: null,
  playing: false,
  source: 'gps',
  style: -1,
  hold: false,
  seeder: new GeoSeeder(),
  lastSeed: null,
  watchId: null,
  demoTimer: null,
  demo: null,
  lastPos: null,
  wakeLock: null,
  lastInfoKey: '',
  route: 'element',
  speed: new SpeedTracker(),
  tempoFollow: true,
  leadInst: 'auto',
  lastFactor: -1,
  speedTimer: null,
  gpsFixAt: null, // performance.now() of the last live GPS fix (null: none yet)
  bannerNote: '', // why GPS is not in use after a fallback
  gpsUnavailable: '', // why GPS can never work on this page
  bpmManual: false,
  bpm: 120, // slider value
  curBpm: null, // tempo the engine reported for the current bar
};
