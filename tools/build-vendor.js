#!/usr/bin/env node
/**
 * Rebuilds js/vendor/libs.js from the pinned upstream packages.
 *
 * The site only needs d3-geo + topojson-client (used by js/maps.js to draw the
 * antique plates). The old bundle also shipped gsap + ScrollTrigger + Lenis,
 * which no module imports any more: 164 KB of dead weight on the critical path.
 *
 *   npm install            # devDependencies only, nothing is shipped
 *   npm run build:libs     # rewrites js/vendor/libs.js
 *   npm run check          # syntax-checks every module
 *
 * Pinned versions are the ones the plates were verified against.
 */
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { readFile, writeFile } from 'node:fs/promises';

const OUT = new URL('../js/vendor/libs.js', import.meta.url);
const ENTRY_VIRTUALS = {
  name: 'geo-entry',
  setup(b) {
    b.onResolve({ filter: /^geo-entry$/ }, () => ({ path: 'geo-entry', namespace: 'geo' }));
    b.onLoad({ filter: /.*/, namespace: 'geo' }, () => ({
      // One flat module surface: maps.js imports the projections it needs from here.
      contents: `
        export { geoPath, geoGraticule, geoGraticule10, geoConicConformal, geoConicEquidistant,
                 geoOrthographic, geoAzimuthalEqualArea, geoEquirectangular, geoMercator,
                 geoNaturalEarth1, geoDistance, geoInterpolate, geoBounds } from 'd3-geo';
        export { feature } from 'topojson-client';
      `,
      resolveDir: process.cwd(),
      loader: 'js',
    }));
  },
};

const header = `/* Vendored: d3-geo@3.1.1 (ISC) + topojson-client@3.1.0 (ISC), bundled with esbuild.
   Rebuild with: npm run build:libs — see tools/build-vendor.js.
   (gsap / ScrollTrigger / Lenis used to live here and are no longer used by any module.) */\n`;

const res = await build({
  entryPoints: ['geo-entry'],
  bundle: true,
  format: 'esm',
  minify: true,
  target: ['es2019'],
  legalComments: 'eof',            // keep the ISC notices, appended once at the end
  write: false,
  plugins: [ENTRY_VIRTUALS],
});

const code = header + res.outputFiles[0].text;
await writeFile(OUT, code);
const gz = gzipSync(Buffer.from(code)).length;
const before = await readFile(OUT, 'utf8').catch(() => '');
console.log(`js/vendor/libs.js  ${(code.length / 1024).toFixed(1)} KB  (gzip ${(gz / 1024).toFixed(1)} KB)`);
if (before) console.log(`were               ${(before.length / 1024).toFixed(1)} KB`);
