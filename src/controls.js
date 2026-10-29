// Chip buttons: styles, lead instruments, city presets.
import { STYLES } from '../engine/theory.js';
import { LEAD_INSTRUMENTS } from '../engine/patches.js';
import { $ } from './dom.js';
import { save } from './store.js';
import { state } from './state.js';
import { PLACEHOLDER, sendSeed } from './audio.js';
import { applyManual } from './position.js';

const PRESETS = [
  ['Zurich', 47.3769, 8.5417],
  ['Tokyo', 35.6762, 139.6503],
  ['New York', 40.7128, -74.006],
  ['Reykjavik', 64.1466, -21.9426],
  ['Quito', -0.1807, -78.4678],
  ['Cape Town', -33.9249, 18.4241],
  ['Sydney', -33.8688, 151.2093],
];

export function buildStyleChips() {
  const wrap = $('styleChips');
  wrap.textContent = '';
  const mk = (label, idx, title) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.title = title || '';
    b.dataset.style = String(idx);
    b.setAttribute('aria-pressed', String(idx === state.style));
    b.addEventListener('click', () => {
      state.style = idx;
      save('style', idx);
      for (const c of wrap.children) c.setAttribute('aria-pressed', String(Number(c.dataset.style) === idx));
      if (state.lastSeed) sendSeed(state.lastSeed);
      else sendSeed(PLACEHOLDER);
    });
    wrap.appendChild(b);
  };
  mk('Auto (GPS)', -1, 'Let the location choose');
  STYLES.forEach((s, i) => mk(s.name, i, s.blurb));
}

export function setLeadInstrument(id) {
  state.leadInst = id;
  save('leadPick', id);
  const inst = LEAD_INSTRUMENTS.find((i) => i.id === id) || LEAD_INSTRUMENTS[0];
  for (const c of $('leadChips').children) c.setAttribute('aria-pressed', String(c.dataset.lead === id));
  if (state.node) state.node.port.postMessage({ type: 'lead', patch: inst.patch, lo: inst.lo, hi: inst.hi });
}

export function buildLeadChips() {
  const wrap = $('leadChips');
  wrap.textContent = '';
  for (const inst of LEAD_INSTRUMENTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = inst.name;
    b.dataset.lead = inst.id;
    b.setAttribute('aria-pressed', String(inst.id === state.leadInst));
    b.addEventListener('click', () => setLeadInstrument(inst.id));
    wrap.appendChild(b);
  }
}

export function buildPresets() {
  const wrap = $('presets');
  for (const [name, lat, lon] of PRESETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = name;
    b.addEventListener('click', () => {
      $('latIn').value = String(lat);
      $('lonIn').value = String(lon);
      applyManual();
    });
    wrap.appendChild(b);
  }
}
