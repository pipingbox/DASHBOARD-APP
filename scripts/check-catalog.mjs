#!/usr/bin/env node
/**
 * check-catalog.mjs — CI integrity gate for the PIDM catalog
 * Ticket: PB-TOOLS-CATALOG-001
 *
 * `build-catalog.mjs` validates the catalog against the Brain, but the Brain is
 * not present in CI: DASHBOARD-APP deploys on its own from
 * `pipingbox/DASHBOARD-APP`. So the source-side gate cannot run there.
 *
 * This gate runs on what CI DOES have — the committed JSON and the committed
 * assets — and fails if the two disagree. That is the failure that actually
 * reaches a user: a catalog entry pointing at an image that was never copied,
 * rendering as a broken tile in a library we describe as professional.
 *
 * Usage: node scripts/check-catalog.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, '..');
const FRONTEND = join(APP_ROOT, 'app', 'frontend');
const CATALOG_JSON = join(FRONTEND, 'src', 'tools', 'catalog', 'catalog.generated.json');
const PUBLIC_DIR = join(FRONTEND, 'public');

const errors = [];

if (!existsSync(CATALOG_JSON)) {
  console.error('\n✗ Falta catalog.generated.json. Ejecuta: node scripts/build-catalog.mjs\n');
  process.exit(1);
}

let catalog;
try {
  catalog = JSON.parse(readFileSync(CATALOG_JSON, 'utf8'));
} catch (err) {
  console.error(`\n✗ catalog.generated.json no es JSON valido: ${err.message}\n`);
  process.exit(1);
}

const publishable = catalog.components.filter((c) => c.publishable);

/* ── 1. every referenced asset must exist in the repository ──────────────── */

let checked = 0;
for (const c of publishable) {
  for (const d of c.drawings ?? []) {
    checked++;
    if (!existsSync(join(PUBLIC_DIR, d.src))) {
      errors.push(`${c.id}: plano 2D ausente en public/ -> ${d.src}`);
    }
  }
  if (c.render) {
    checked++;
    if (!existsSync(join(PUBLIC_DIR, c.render))) {
      errors.push(`${c.id}: render 3D ausente en public/ -> ${c.render}`);
    }
  }
}

/* ── 2. a publishable component must actually be publishable ─────────────── */

// The 2D drawing is the load-bearing asset and is mandatory. The 3D render is
// presentation and may legitimately be absent, so it is reported rather than
// failed — the UI already degrades to a card without a thumbnail.
let withoutRender = 0;
for (const c of publishable) {
  if (!c.drawings?.length) errors.push(`${c.id}: marcado publicable pero sin planos`);
  if (!c.render) withoutRender++;
}

/* ── 3. no dangling standard references ──────────────────────────────────── */

for (const c of publishable) {
  for (const s of c.standards ?? []) {
    if (!catalog.standards[s.standardId]) {
      errors.push(`${c.id}: referencia la norma inexistente ${s.standardId}`);
    }
  }
}

/* ── 4. every rating_note_key must resolve in all 7 locales ──────────────── */

// The pressure-class note is the piece of the record a user reads to learn that
// a fitting has NO class. If its key is missing from a locale, i18next silently
// falls back to the English prose and that user reads the most delicate
// technical text in the catalog in a language they may not have. Fail here
// instead: a key that exists in en.json only is an unfinished translation, not
// a working fallback.
const LOCALES_DIR = join(FRONTEND, 'src', 'i18n', 'locales');
const LOCALES = ['en', 'es', 'nl', 'de', 'fr', 'pt', 'it'];

/** Resolve a dotted key path ("a.b.c") against a parsed locale object. */
function resolveKey(obj, path) {
  return path.split('.').reduce((node, part) => (node == null ? undefined : node[part]), obj);
}

const locales = {};
for (const code of LOCALES) {
  const file = join(LOCALES_DIR, `${code}.json`);
  if (!existsSync(file)) {
    errors.push(`locale ausente: src/i18n/locales/${code}.json`);
    continue;
  }
  try {
    locales[code] = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    errors.push(`${code}.json no es JSON valido: ${err.message}`);
  }
}

const ratingNoteKeys = new Set();
for (const c of publishable) {
  if (c.ratingNoteKey) ratingNoteKeys.add(c.ratingNoteKey);
  else if (c.ratingNote) errors.push(`${c.id}: tiene ratingNote sin ratingNoteKey`);
}

let i18nChecked = 0;
for (const key of [...ratingNoteKeys].sort()) {
  for (const code of LOCALES) {
    if (!locales[code]) continue;
    i18nChecked++;
    const value = resolveKey(locales[code], key);
    if (typeof value !== 'string' || !value.trim()) {
      errors.push(`${code}.json: falta la traduccion de ${key}`);
    }
  }
}

/* ── 5. the library must not be silently empty ───────────────────────────── */

// A generator bug that emitted zero components would otherwise pass every
// check above trivially, and ship an empty library.
if (publishable.length === 0) {
  errors.push('El catalogo no contiene ningun componente publicable');
}

/* ── report ──────────────────────────────────────────────────────────────── */

if (errors.length) {
  console.error(`\n✗ INTEGRIDAD DEL CATALOGO: ${errors.length} problemas\n`);
  for (const e of errors.slice(0, 25)) console.error(`  · ${e}`);
  if (errors.length > 25) console.error(`  · … y ${errors.length - 25} mas`);
  console.error('\nSi has cambiado el catalogo del Brain, regenera y sincroniza:');
  console.error('  node scripts/build-catalog.mjs');
  console.error('  npm i sharp --no-save --prefix app/frontend && node scripts/sync-catalog-assets.mjs\n');
  process.exit(1);
}

console.log(
  `✓ catalogo integro: ${publishable.length} componentes publicables, ` +
  `${checked} assets verificados, ${Object.keys(catalog.standards).length} normativas, ` +
  `${ratingNoteKeys.size} claves rating_note x ${LOCALES.length} idiomas (${i18nChecked} traducciones)` +
  (withoutRender ? ` (${withoutRender} sin render 3D)` : ''),
);
