// Bumps the app version everywhere it lives.
//   node tools/bump.mjs            1.3 -> 1.4   (default: next minor)
//   node tools/bump.mjs major      1.4 -> 2.0
//   node tools/bump.mjs 1.10       set an exact major.minor
// Updates src/version.js (shown in the footer), package.json and the cache name in
// sw.js (so installed PWAs fetch the new files).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
const write = (f, s) => writeFileSync(join(root, f), s);

const m = /VERSION = '(\d+)\.(\d+)'/.exec(read('src/version.js'));
if (!m) throw new Error("src/version.js: expected VERSION = 'major.minor'");
let major = Number(m[1]);
let minor = Number(m[2]);
const arg = process.argv[2];
if (!arg || arg === 'minor') minor++;
else if (arg === 'major') {
  major++;
  minor = 0;
} else if (/^\d+\.\d+$/.test(arg)) [major, minor] = arg.split('.').map(Number);
else throw new Error(`unknown argument "${arg}" (use minor, major or e.g. 1.10)`);
const v = `${major}.${minor}`;

write('src/version.js', read('src/version.js').replace(/VERSION = '\d+\.\d+'/, `VERSION = '${v}'`));
const pkg = JSON.parse(read('package.json'));
pkg.version = `${v}.0`;
write('package.json', JSON.stringify(pkg, null, 2) + '\n');
const sw = read('sw.js');
if (!/const CACHE = 'geosynth-v[^']*'/.test(sw)) throw new Error('sw.js: CACHE line not found');
write('sw.js', sw.replace(/const CACHE = 'geosynth-v[^']*'/, `const CACHE = 'geosynth-v${v}'`));
console.log(`version ${m[1]}.${m[2]} -> ${v}`);
