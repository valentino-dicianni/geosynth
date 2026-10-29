// Screen wake lock: browsers stop GPS (and iOS audio) when the page is hidden.
import { $ } from './dom.js';
import { state } from './state.js';

export async function updateWakeLock() {
  try {
    if ($('wake').checked && 'wakeLock' in navigator && !document.hidden && !state.wakeLock) {
      state.wakeLock = await navigator.wakeLock.request('screen');
      state.wakeLock.addEventListener('release', () => {
        state.wakeLock = null;
      });
    } else if (!$('wake').checked && state.wakeLock) {
      await state.wakeLock.release();
      state.wakeLock = null;
    }
  } catch {
    /* denied or unsupported */
  }
}
