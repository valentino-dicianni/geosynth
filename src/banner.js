// Banner under the title: is the music following a live GPS position, or not?
import { $ } from './dom.js';
import { state } from './state.js';

const GPS_STALE_MS = 30000; // no fix for this long: say so (iOS sends no updates while you stand still)

function bannerInfo() {
  const parts = [];
  let mode;
  let title;
  if (state.source === 'gps' && state.gpsUnavailable) {
    mode = 'off';
    title = 'Not using GPS';
    parts.push(state.gpsUnavailable);
  } else if (state.source === 'gps') {
    if (!state.node) {
      mode = 'wait';
      title = 'GPS selected';
      parts.push('starts when you tap Start');
    } else if (state.gpsFixAt === null) {
      mode = 'wait';
      title = 'Waiting for a GPS fix';
      parts.push('placeholder music until the first fix');
    } else {
      const age = performance.now() - state.gpsFixAt;
      if (age > GPS_STALE_MS) {
        mode = 'wait';
        title = 'GPS: no new fix';
        parts.push(`last one ${Math.round(age / 1000)} s ago (standing still or weak signal)`);
      } else {
        mode = 'live';
        title = 'Using live GPS position';
        const acc = state.lastPos ? state.lastPos.acc : 0;
        if (acc > 0) parts.push(`accuracy ±${Math.round(acc)} m`);
      }
    }
  } else {
    mode = 'off';
    title = 'Not using GPS';
    parts.push(state.source === 'demo' ? 'simulated walk' : 'manual position');
    const why = state.bannerNote || state.gpsUnavailable;
    if (why) parts.push(why);
  }
  if (state.hold) parts.push('music held');
  return { mode, title, detail: parts.join(' · ') };
}

export function updateBanner() {
  const b = bannerInfo();
  const el = $('posBanner');
  if (el.dataset.gps !== b.mode) el.dataset.gps = b.mode;
  if ($('bannerTitle').textContent !== b.title) $('bannerTitle').textContent = b.title;
  if ($('bannerDetail').textContent !== b.detail) $('bannerDetail').textContent = b.detail;
}
