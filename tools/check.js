/* Minimal syntax + budget check for the static site. No browser needed:
   `node --check` parses each module, then the gzip sizes of the critical path are
   printed so a regression is visible in CI or before a commit. */
import { readFile, readdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = new URL('../', import.meta.url);
const p = (f) => new URL(f, root);

const OWN = ['main.js', 'scene.js', 'glass.js', 'library.js', 'maps.js', 'plates.js', 'post.js',
  'textures.js', 'dioramas.js', 'props.js', 'terrain.js', 'library3d.js'];
const VENDOR = ['three.js', 'libs.js'];
const ASSETS = ['index.html', 'css/main.css', 'manifest.webmanifest', 'presentations.json'];

let fail = 0;
for (const f of OWN) {
  try { await run(process.execPath, ['--check', p(`js/${f}`).pathname]); }
  catch (e) { console.error(`✘ js/${f}\n${e.stderr || e.message}`); fail++; }
}
for (const f of VENDOR) {
  try { await run(process.execPath, ['--check', p(`js/vendor/${f}`).pathname]); }
  catch (e) { console.error(`✘ js/vendor/${f}\n${e.stderr || e.message}`); fail++; }
}
for (const f of ASSETS) {
  try { JSON.parse(await readFile(p(f), 'utf8')); }
  catch (e) { if (/\.json$|webmanifest$/.test(f)) { console.error(`✘ ${f} — ${e.message}`); fail++; } }
}
if (fail) { console.error(`\n${fail} problem(s).`); process.exit(1); }

const gz = async (f) => gzipSync(await readFile(p(f))).length;
const rows = [];
// Critical path = what the parser and the module graph need before the first frame.
// maps.js is `await import()`-ed after the loader; d3-geo (vendor/libs.js) comes with
// plates.js because the plate specs reference their projections.
const LAZY = new Set(['js/maps.js']);
const all = ['index.html', 'css/main.css', ...OWN.map((f) => `js/${f}`), ...VENDOR.map((f) => `js/vendor/${f}`)];
let crit = 0;
for (const f of all) {
  const n = await gz(f);
  rows.push([f, n]);
  if (!LAZY.has(f)) crit += n;
}

console.log('\nCritical path (gzip):');
for (const [f, n] of rows.sort((a, b) => b[1] - a[1])) console.log(`  ${f.padEnd(26)} ${(n / 1024).toFixed(1).padStart(7)} KB`);
console.log(`  ${'TOTAL before first pixel'.padEnd(26)} ${(crit / 1024).toFixed(1).padStart(7)} KB`);
// three.js alone is 135 KB of this total; the budget guards against regressions.
// Before the cleanup, `modulepreload js/main.js` pulled the whole graph eagerly for
// 300 KB gzip (164 KB of which was never imported).
const budget = 250 * 1024;
console.log(crit < budget ? `\n✓ under the ${budget / 1024} KB budget` : `\n✘ over the ${budget / 1024} KB budget`);
if (crit >= budget) process.exit(1);

const files = await readdir(p('js/'));
console.log(`\n✓ ${OWN.length} modules parse, ${ASSETS.length} assets valid (${files.length} files in js/).`);
