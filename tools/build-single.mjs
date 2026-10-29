// One-file builds of the app (CSS, app, engine and the AudioWorklet source
// inlined). Run `node tools/build.mjs` first (it makes worklet.bundle.js).
//
//   geosynth.html   a fragment (no doctype/html/head/body: the host adds them)
//                   for hosts that serve a single HTML file, such as a claude.ai
//                   artifact. GPS and the service worker are switched off
//                   because such frames refuse them.
//   site/           index.html + apple-touch-icon.png: a complete page for your
//                   own HTTPS hosting with GPS ON. Two files, no folders, so it
//                   can be uploaded from a phone. No service worker (it would
//                   need a second file), so every launch fetches the latest.
//
// Usage: node tools/build-single.mjs
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleModules, wrapIife } from './lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// The engine is bundled in too (the main-thread fallback uses it directly).
const appSrc = wrapIife(bundleModules(root, ['engine/engine.js', 'src/main.js']).code);
const workletSrc = readFileSync(join(root, 'worklet.bundle.js'), 'utf8');

for (const [name, s] of [['worklet', workletSrc], ['app', appSrc]]) {
  if (/<\/script/i.test(s) || /<!--/.test(s)) throw new Error(`${name} bundle contains a sequence that breaks inline <script>`);
}

const html = readFileSync(join(root, 'index.html'), 'utf8');
const body = html.slice(html.indexOf('<main id="app">'), html.indexOf('</audio>') + '</audio>'.length);
const css = readFileSync(join(root, 'style.css'), 'utf8');

const workletTag = `<script type="text/plain" id="worklet-src">
${workletSrc}
</script>`;
const blobSetup = `try {
  window.GEOSYNTH_WORKLET_URL = URL.createObjectURL(
    new Blob([document.getElementById('worklet-src').textContent], { type: 'text/javascript' })
  );
} catch (e) {
  /* the app falls back to a main-thread engine */
}`;

// ---- geosynth.html (claude.ai artifact)
const overrides = `
/* Hosted-frame overrides: the host pads :root top/bottom for safe areas. */
:root { color-scheme: dark; }
#app {
  padding-block: 8px 20px;
  padding-left: max(16px, env(safe-area-inset-left, 0px));
  padding-right: max(16px, env(safe-area-inset-right, 0px));
}
html, body { min-height: 100%; }
`;
const artifact = `<title>GeoSynth</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
${css}
${overrides}
</style>
${body}
${workletTag}
<script>
window.GEOSYNTH_NO_GPS = true;
window.GEOSYNTH_NO_SW = true;
${blobSetup}
</script>
<script>
${appSrc}
</script>
`;
writeFileSync(join(root, 'geosynth.html'), artifact);
console.log(`geosynth.html: ${(artifact.length / 1024).toFixed(1)} KiB`);

// ---- site/index.html (own hosting, GPS on)
const hosted = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0b0d12">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="GeoSynth">
<meta name="description" content="Endless procedural synth music, seeded by your GPS position.">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="icon" href="apple-touch-icon.png">
<title>GeoSynth</title>
<style>
${css}
</style>
</head>
<body>
${body}
${workletTag}
<script>
window.GEOSYNTH_NO_SW = true;
${blobSetup}
</script>
<script>
${appSrc}
</script>
</body>
</html>
`;
mkdirSync(join(root, 'site'), { recursive: true });
writeFileSync(join(root, 'site', 'index.html'), hosted);
copyFileSync(join(root, 'icons', 'icon-192.png'), join(root, 'site', 'apple-touch-icon.png'));
console.log(`site/index.html: ${(hosted.length / 1024).toFixed(1)} KiB (+ apple-touch-icon.png)`);
