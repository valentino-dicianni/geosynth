// Spectrum bars on the canvas, tinted with the current style's hue.
import { $ } from './dom.js';
import { state } from './state.js';

export function startViz() {
  const canvas = $('viz');
  const g = canvas.getContext('2d');
  if (!g) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const fit = () => {
    canvas.width = Math.max(64, Math.floor(canvas.clientWidth * dpr));
    canvas.height = Math.max(32, Math.floor(canvas.clientHeight * dpr));
  };
  fit();
  window.addEventListener('resize', fit);
  let data = null;
  let last = 0;
  const frame = (t) => {
    requestAnimationFrame(frame);
    if (document.hidden || !state.analyser || t - last < 33) return;
    last = t;
    if (!data) data = new Uint8Array(state.analyser.frequencyBinCount);
    state.analyser.getByteFrequencyData(data);
    const w = canvas.width;
    const h = canvas.height;
    g.clearRect(0, 0, w, h);
    const hue = Number(document.documentElement.style.getPropertyValue('--hue')) || 190;
    const bars = 56;
    const bw = w / bars;
    const maxBin = Math.floor(data.length * 0.75);
    for (let i = 0; i < bars; i++) {
      const a = Math.floor(Math.pow(i / bars, 1.8) * maxBin);
      const b = Math.max(a + 1, Math.floor(Math.pow((i + 1) / bars, 1.8) * maxBin));
      let m = 0;
      for (let k = a; k < b; k++) m = Math.max(m, data[k]);
      const bh = (m / 255) * h * 0.95;
      g.fillStyle = `hsl(${hue} 85% ${35 + (m / 255) * 35}%)`;
      g.fillRect(i * bw + 1, h - bh, Math.max(1, bw - 2), bh);
    }
  };
  requestAnimationFrame(frame);
}
