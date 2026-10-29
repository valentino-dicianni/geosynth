# GeoSynth

Endless procedural synth music, seeded by your GPS position. A static PWA: no
server, no accounts, no network use after the first load. Coordinates never
leave the device.

## How it works

```
GPS fix -> GeoSeeder (src/geo.js)
             coarse cell ~250 m -> style, key, mode, tempo, lead instrument
             fine cell   ~60 m  -> progressions, melodies, arrangement
          -> postMessage -> AudioWorklet (worklet.bundle.js)
             Composer (engine/composer.js)  integer-only, seeded PRNG streams
             -> Engine (engine/engine.js)   sample-accurate step scheduler
             -> voices + FX (voices.js, instrument.js, fx.js) -> master -> speakers
```

- **Same place, same music.** Seeds are a pure function of the grid cell, and
  the composer uses its own integer PRNG (sfc32), never `Math.random`.
- **Walking changes the music.** A new style, key and tempo about every 250 m,
  new melodies about every 60 m (a few minutes of walking per style).
- **Hysteresis** (20 % of a cell, more when the reported GPS accuracy is poor)
  stops GPS jitter from flipping the seed on a cell border. Fine-cell changes
  are rate limited to one per 20 s and style changes to one per 15 s (a change
  held back is applied afterwards, not lost), so driving does not re-roll the
  music constantly. Poor accuracy (> 400 m) freezes the fine seed.
- **New seeds latch on the next bar line.** Old notes ring out; tempo, filter
  and effects glide.
- **11 styles:** Drift, Neon, Pulse (house), Glass, Abyss, Arcade, Chill, Epic, Smoke
  (late-night jazz), Anime (bright, 156-176 bpm, soaring lead, IV-V-I-vi openings, often a Japanese
  scale) and Techno (kick on every beat, 16th hats, a 16-step acid
  bass line in the gaps, 128-146 bpm). "Auto" lets the coarse cell choose; or pin one by hand. Each song is built from
  sections (8 or 16 bars) with Markov chord progressions, motif-based leads
  that follow the chords, and a layer arrangement that changes per section.

## Instruments

Each style has its own lead, pad, bass and arp sounds. Beyond the synth leads
there are saxophone (Neon and Smoke use it), flute, clarinet, trumpet,
vibraphone, organ and choir, plus strings, an upright bass and an electric
piano. They are synthesised (reed oscillator plus formant filters, breath
noise, a pitch scoop into each note, delayed vibrato), not samples. Pick a
**Lead instrument** in the app to play any of them in any style; the melody then
stays in that instrument's range.

**Procedural** (the default) invents a new lead instrument for every coarse
cell (`engine/instrument.js`): oscillator type (saw, pulse, triangle, FM, reed,
organ), plucked or sustained envelope, filter, vibrato, vowel-like formants,
breath, pitch scoop, effect sends and register, all drawn from the place seed.
Each section morphs it slightly. Its loudness is matched by a short probe
render, so every generated instrument sits at the same level. The app shows
the current one ("Instrument here: ...").

## Quarter tones and procedural scales

Notes are plain fractional MIDI numbers, so a quarter tone is a .5. The four
named quarter-tone scales are maqam-like 7-note scales with neutral thirds,
sixths or sevenths. A procedural scale (`makeProceduralScale` in
`engine/theory.js`) picks seven steps of 1 to 3 semitones (in quarter-tone
units when allowed) that add up to an octave, and keeps the tonic triad
usable: third between a minor and a major third, fifth within a quarter tone of
perfect. It also decides whether the chord matrix is major or minor.

## Tempo follows movement

Tempo follows how fast your position is changing, in every mode: GPS (the
phone's reported speed when available), Demo walk, and Manual (jumping between
places reads as fast movement, then calms down; idle settles on the slowest
tempo). Speed is measured over about 10 s with a jitter threshold of twice the
GPS accuracy, smoothed, and mapped on a log scale from 90 % of the style's
slowest tempo (standing still) up to its fastest tempo +10 %, but at least
**160 bpm** (so slow styles like Abyss do not top out at 70): walking is around a
quarter of that range, driving about 80 %. Speed is capped at **100 km/h**: that
is full tempo (the "tempo 100 %" readout), and anything faster counts as 100. The
tempo moves at most 12 bpm per bar. Switch it off with "Tempo follows how fast the position changes" to get
the seed's own tempo back (then the same place always has the same tempo too).

**BPM slider** (Tempo card, 40-220 bpm): shows the tempo that is playing; moving it
takes the tempo over by hand (it wins over movement and the seed, applies at
once, and survives place changes). Untick "Set the tempo by hand" to go back.

## Position banner

A banner under the title says whether a live GPS position is in use: *Using live
GPS position* (with accuracy), *Waiting for a GPS fix*, *GPS: no new fix* (nothing
for 30 s: standing still or weak signal), or *Not using GPS* with the reason
(manual position, simulated walk, permission denied, GPS needs HTTPS, GPS blocked
on this page). "music held" is appended while Hold is on.

## Run it

Geolocation and AudioWorklet both need a **secure context**: HTTPS, or
`http://localhost`. Plain `http://192.168.x.x` from a phone will *not* work.

Desktop test (Manual and Demo walk work without GPS):

```sh
npm run build        # regenerates worklet.bundle.js (already included)
npm run serve        # http://localhost:8000
```

On an Android phone over USB (counts as localhost, so GPS works):

```sh
adb reverse tcp:8000 tcp:8000     # then open http://localhost:8000 in Chrome
```

For real use, host the folder anywhere that serves static files over HTTPS
(GitHub Pages, Netlify, Cloudflare Pages, any web server). Open the URL on the
phone, then "Add to Home screen" / "Install app". It then works offline.

## GitHub Pages

The repository root is the site: no build step runs on GitHub. All paths are
relative, so it works under `https://<user>.github.io/<repo>/`. The generated
`worklet.bundle.js` is committed (an AudioWorklet cannot resolve imports), so
after changing anything in `engine/` or `worklet.js`, run `npm run build` and
commit it too. `.nojekyll` keeps GitHub from processing the files.

1. Push the repository to GitHub.
2. **Settings > Pages > Build and deployment**: Source "Deploy from a branch",
   branch `main`, folder `/ (root)`, **Save**. After about a minute the page is
   at `https://<your-user>.github.io/<repo>/`.

## On an iPhone

GPS needs HTTPS, so use the Pages address above (the claude.ai artifact can play
music but is not allowed to read your location).

1. Open the address in **Safari** (not inside another app), **Share > Add to Home
   Screen**. Start it from the new icon.
2. Tap **Start listening**, allow location (**While Using**), choose **GPS** in
   Place. The banner turns green: "Using live GPS position".

Updating: after a new version is pushed, wait a minute, swipe the app away and
open it twice (the service worker fetches the new files in the background and
uses them on the next launch). The footer shows the version (v1.5 ...) so you can
see which one you are running.

No-computer alternative: `npm run build:single` also writes **`site/`**:
`index.html` (the whole app in one file, GPS on, no service worker) and
`apple-touch-icon.png`. Two files, no folders, so they can be uploaded from a
phone through the GitHub website instead of pushing the repository.

iOS limits: GPS and audio normally stop when the screen locks or the app is not
in front, so keep it open with the screen on (Keep the screen on is ticked by
default). The ring/silent switch should not mute it (the page asks for
"playback" audio), but check the volume. A home-screen app may ask for location
again after a restart.

## Versions

The version (major.minor) lives in `src/version.js` and shows in the footer. Run
`npm run release` to add 0.1 (`node tools/bump.mjs major` for 2.0); it updates
`src/version.js`, `package.json` and the service-worker cache name, then rebuilds
`worklet.bundle.js`, `geosynth.html` and `site/`.

## Using it

- **Start listening** (needed once per launch: browsers require a tap to start audio).
- **Place:** GPS, Manual (type coordinates or tap a city preset), or Demo walk
  (simulated movement at walking up to flight speed, to hear how the music
  changes). **Hold** freezes the music while you move.
- **Style:** Auto or pin one of the eleven.
- **Key and scale:** Auto, or fix the key (C to B) and/or the scale. Besides the
  usual modes (ionian to locrian, harmonic and melodic minor) there are more minor-side scales
  (dorian b2, neapolitan minor, hungarian minor, ukrainian dorian, locrian), oriental scales
  (hijaz, double harmonic, persian, and the five-note hirajoshi, in sen, miyako, yo, kumoi, iwato, ryukyu and
  Chinese gong: the melody uses the five notes, the chords come from the 7-note mode that contains them)
  and four quarter-tone scales (rast, bayati, saba, neutral;
  the ½ marks them) and **Procedural**: a 7-note scale invented from the place
  seed. The **Quarter tones** switch lets Auto and Procedural use notes halfway
  between piano keys (24 steps per octave); without it they stay on whole
  semitones. In Auto about a fifth of the places get a procedural scale and
  about a sixth a quarter-tone one, about an eighth an oriental one (three in
  ten in Anime, where it is always Japanese); places whose style is in a minor mode also
  get the extra minor scales now and then.
- **Manual map:** in Manual mode tap the map to choose the place (drag to move,
  pinch or +/- to zoom). It needs a network for the tiles; without one the map
  stays blank but tapping still works, and so do the Lat/Lon boxes and city
  presets.
- Keep the screen on is enabled by default because browsers stop delivering GPS
  to a hidden page.

## Tests

```sh
npm test            # geo, engine and bundle tests (no dependencies)
npm install && npm run test:dom    # DOM wiring test with jsdom
npm run build:single && npm run test:single   # one-file build (geosynth.html)
```

The engine tests check determinism, finite output, levels per style, bar timing
to the sample, latching on bar lines and silence gaps over two-minute runs.
Offline render speed is 27x-80x real time on a desktop core.

## Known limits

- Not verified on physical phones yet: I could only test the engine, geo logic,
  bundle and DOM wiring headlessly. The things most likely to need adjustment
  on a real device are the background-audio route (Options > Audio route) and
  iOS behaviour.
- GPS updates stop when the page is hidden (browser policy). With the screen
  off, music keeps playing but the place stops updating on most phones.
- iOS Safari suspends Web Audio in the background more aggressively than
  Android Chrome. Default there is "Direct".
- Longitude cells are latitude-corrected; very near the poles they get small.

## Files

| Path | Purpose |
|---|---|
| `index.html`, `style.css` | page and styles |
| `src/main.js` | entry point: start button, event wiring, settings |
| `src/state.js`, `dom.js`, `store.js` | shared state, DOM helpers, saved settings |
| `src/audio.js` | engine node (AudioWorklet or main-thread fallback), output route, play/pause |
| `src/position.js` | GPS, manual and demo-walk sources |
| `src/map.js` | map for the Manual source (OpenStreetMap tiles, pan / pinch / tap, no library) |
| `src/geo.js` | position to seed (cells, hysteresis, rate limit) and speed estimate |
| `src/tempo.js`, `bar.js`, `banner.js`, `controls.js`, `viz.js`, `wakelock.js` | tempo/BPM slider, per-bar readout, GPS banner, chips, spectrum, wake lock |
| `src/version.js` | app version shown in the footer |
| `engine/` | rng, theory/styles, composer, patches, voices, fx, engine (no DOM) |
| `worklet.js`, `worklet.bundle.js` | AudioWorklet entry and its generated single-script bundle |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA shell (offline cache, install) |
| `tools/` | `build.mjs` (worklet bundle), `build-single.mjs` (one-file builds), `bump.mjs` (version), `lib.mjs` (module bundler) |
| `test/` | node tests |

Module imports must stay relative and top-level names unique across `src/` and
`engine/` (the one-file builds put everything in one scope; the tests catch a clash).
