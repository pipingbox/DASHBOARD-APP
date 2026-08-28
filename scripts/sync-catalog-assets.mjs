#!/usr/bin/env node
/**
 * sync-catalog-assets.mjs — copy approved catalog assets into the app
 * Ticket: PB-TOOLS-CATALOG-001
 *
 * Reads the generated catalog and copies exactly the assets it references from
 * PIPINGBOX-BRAIN into app/frontend/public/catalog/. Anything not referenced is
 * not copied, so dead weight cannot accumulate in the bundle.
 *
 * 2D drawings are vector and small: copied verbatim.
 * 3D renders are ~1 MB PNGs (28 MB total), far too heavy to ship as-is. They
 * are converted to WebP, which typically lands around 100-150 KB each with no
 * visible loss at the size they are displayed.
 *
 * `sharp` is intentionally NOT a project dependency: this script runs by hand
 * when assets change, and its output is committed. Adding an optional native
 * binary to the production install for an occasional task is a bad trade.
 * Install it transiently:
 *
 *   npm i sharp --no-save --prefix app/frontend
 *   node scripts/sync-catalog-assets.mjs
 */

import { readFileSync, existsSync, mkdirSync, copyFileSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, '..');
const BRAIN_ROOT = resolve(APP_ROOT, '..');
const ASSET_SRC = join(BRAIN_ROOT, 'brain', '07-DESIGN', '02-ASSETS', 'APPROVED', 'BIBLIOTECA_V1');
const CATALOG_JSON = join(APP_ROOT, 'app', 'frontend', 'src', 'tools', 'catalog', 'catalog.generated.json');
const PUBLIC_DIR = join(APP_ROOT, 'app', 'frontend', 'public', 'catalog');

const require = createRequire(join(APP_ROOT, 'app', 'frontend', 'package.json'));

let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error(
    '\nFalta `sharp`, necesario para convertir los renders a WebP.\n\n' +
    '  npm i sharp --no-save --prefix app/frontend\n\n' +
    'No se instala como dependencia del proyecto a proposito: este script se\n' +
    'ejecuta a mano y su salida se commitea.\n',
  );
  process.exit(2);
}

if (!existsSync(CATALOG_JSON)) {
  console.error('\nNo existe catalog.generated.json. Ejecuta antes:\n  node scripts/build-catalog.mjs\n');
  process.exit(2);
}
if (!existsSync(ASSET_SRC)) {
  console.error(`\nNo encuentro los assets aprobados en:\n  ${ASSET_SRC}\n`);
  process.exit(2);
}

const catalog = JSON.parse(readFileSync(CATALOG_JSON, 'utf8'));

/* ── collect exactly what the catalog references ─────────────────────────── */

const want2d = new Set();
const want3d = new Set();
for (const c of catalog.components) {
  for (const d of c.drawings ?? []) want2d.add(basename(d.src));
  if (c.render) want3d.add(basename(c.render)); // .webp name
}

/* ── rebuild output cleanly so removed assets disappear ──────────────────── */

const dir2d = join(PUBLIC_DIR, '2d');
const dir3d = join(PUBLIC_DIR, '3d');
rmSync(PUBLIC_DIR, { recursive: true, force: true });
mkdirSync(dir2d, { recursive: true });
mkdirSync(dir3d, { recursive: true });

/* ── 2D: verbatim copy ───────────────────────────────────────────────────── */

let copied2d = 0;
const missing = [];
for (const file of want2d) {
  const src = join(ASSET_SRC, 'detail', file);
  if (!existsSync(src)) { missing.push(`2d/${file}`); continue; }
  copyFileSync(src, join(dir2d, file));
  copied2d++;
}

/* ── 3D: PNG -> WebP ─────────────────────────────────────────────────────── */

let bytesIn = 0;
let bytesOut = 0;
let converted = 0;

for (const webpName of want3d) {
  const pngName = webpName.replace(/\.webp$/, '.png');
  const src = join(ASSET_SRC, 'hero', pngName);
  if (!existsSync(src)) { missing.push(`3d/${pngName}`); continue; }

  bytesIn += statSync(src).size;
  const out = join(dir3d, webpName);

  // 1400px wide is comfortably above the largest size the detail view renders
  // these at, so downscaling is invisible while removing most of the weight.
  await sharp(src)
    .resize({ width: 1400, withoutEnlargement: true })
    .webp({ quality: 82, effort: 6 })
    .toFile(out);

  bytesOut += statSync(out).size;
  converted++;
}

/* ── report ──────────────────────────────────────────────────────────────── */

const mb = (n) => (n / 1024 / 1024).toFixed(1);
const dirSize = (d) => readdirSync(d).reduce((n, f) => n + statSync(join(d, f)).size, 0);

console.log('\nASSETS SINCRONIZADOS');
console.log(`  planos 2D    ${copied2d} ficheros, ${mb(dirSize(dir2d))} MB`);
console.log(`  renders 3D   ${converted} ficheros, ${mb(bytesIn)} MB PNG -> ${mb(bytesOut)} MB WebP`);
if (bytesIn > 0) {
  console.log(`               reduccion ${(100 - (bytesOut / bytesIn) * 100).toFixed(0)}%`);
}
console.log(`  -> app/frontend/public/catalog/`);

if (missing.length) {
  console.error(`\n✗ ${missing.length} assets referenciados que no existen en el Brain:`);
  for (const m of missing.slice(0, 10)) console.error(`    ${m}`);
  process.exit(1);
}
console.log('');
