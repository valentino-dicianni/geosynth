// Small DOM and formatting helpers shared by the UI modules.

export const $ = (id) => document.getElementById(id);

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const hex8 = (n) => (n >>> 0).toString(16).padStart(8, '0');

export function fmtCoord(v, pos, neg) {
  return Math.abs(v).toFixed(5) + '°' + (v >= 0 ? pos : neg);
}

// One status line, shown in Options and on the start card.
export function setStatus(msg) {
  $('status').textContent = msg || '';
  $('startNote').textContent = msg || '';
}
