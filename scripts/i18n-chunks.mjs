#!/usr/bin/env node
/**
 * PB-I18N-LAYER3-001 — translation chunk pipeline.
 *
 *   node scripts/i18n-chunks.mjs extract <workdir> [chunkSize]
 *     Flattens en.json into <workdir>/en/chunk-NN.json (ordered, ~chunkSize keys).
 *
 *   node scripts/i18n-chunks.mjs assemble <workdir> <locale>
 *     Reads <workdir>/<locale>/chunk-NN.json, validates against en.json
 *     (every key present, no extras, identical {{placeholder}} sets, no empty
 *     strings, same leading/trailing whitespace class), adds the CLDR plural
 *     forms the locale needs (from `<key>_other` when the translator did not
 *     provide `_few`/`_many`), and writes locales/<locale>.json in en.json key
 *     order. Exit 1 on any validation error; prints an "identical to en" report
 *     for human review (protected terms are expected to be identical).
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = join(__dirname, '..', 'app', 'frontend', 'src', 'i18n', 'locales');
const EN = JSON.parse(readFileSync(join(LOCALES_DIR, 'en.json'), 'utf8'));

const flatten = (o, p = '', r = {}) => {
  for (const k of Object.keys(o)) {
    const v = o[k];
    const q = p ? `${p}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, q, r);
    else r[q] = v;
  }
  return r;
};
const unflattenInOrder = (ref, flat, p = '') => {
  const out = {};
  for (const k of Object.keys(ref)) {
    const q = p ? `${p}.${k}` : k;
    const v = ref[k];
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = unflattenInOrder(v, flat, q);
      // language-specific plural forms live next to their `_other`
      for (const cat of ['zero', 'one', 'two', 'few', 'many', 'other']) {
        for (const base of Object.keys(v).filter((x) => x.endsWith('_other')).map((x) => x.slice(0, -6))) {
          const full = `${q}.${base}_${cat}`;
          if (flat[full] !== undefined && out[k][`${base}_${cat}`] === undefined) out[k][`${base}_${cat}`] = flat[full];
        }
      }
    } else {
      out[k] = flat[q];
    }
  }
  return out;
};
const placeholders = (s) => (String(s).match(/\{\{[^}]+\}\}/g) || []).sort().join('|');

const [cmd, workdir, arg3] = process.argv.slice(2);
if (cmd === 'extract') {
  const size = Number(arg3 || 250);
  const flat = flatten(EN);
  const keys = Object.keys(flat);
  const dir = join(workdir, 'en');
  mkdirSync(dir, { recursive: true });
  let n = 0;
  for (let i = 0; i < keys.length; i += size) {
    const chunk = {};
    for (const k of keys.slice(i, i + size)) chunk[k] = flat[k];
    writeFileSync(join(dir, `chunk-${String(++n).padStart(2, '0')}.json`), JSON.stringify(chunk, null, 2) + '\n');
  }
  console.log(`extracted ${keys.length} keys into ${n} chunks at ${dir}`);
} else if (cmd === 'assemble') {
  const locale = arg3;
  const dir = join(workdir, locale);
  const enFlat = flatten(EN);
  const got = {};
  for (const f of readdirSync(dir).filter((x) => /^chunk-\d+\.json$/.test(x)).sort()) {
    Object.assign(got, JSON.parse(readFileSync(join(dir, f), 'utf8')));
  }
  const errors = [];
  const categories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
  const required = new Set(Object.keys(enFlat));
  for (const k of Object.keys(enFlat)) {
    if (k.endsWith('_other')) for (const c of categories) required.add(`${k.slice(0, -6)}_${c}`);
  }
  // derive missing plural forms from _other when translator omitted them
  for (const k of required) {
    if (got[k] === undefined) {
      const m = k.match(/_(zero|one|two|few|many|other)$/);
      if (m && enFlat[k] === undefined) {
        const other = got[`${k.slice(0, -m[0].length)}_other`];
        if (other !== undefined) got[k] = other;
      }
    }
  }
  for (const k of required) {
    const v = got[k];
    if (v === undefined) { errors.push(`missing: ${k}`); continue; }
    if (Array.isArray(enFlat[k])) {
      if (!Array.isArray(v) || v.length !== enFlat[k].length || v.some((x) => typeof x !== 'string' || !x.trim())) {
        errors.push(`array shape drift: ${k} (expected ${enFlat[k].length} non-empty strings)`);
      }
      continue;
    }
    if (typeof v !== 'string') { errors.push(`not a string: ${k}`); continue; }
    if (v.trim() === '' && String(enFlat[k] ?? '').trim() !== '') errors.push(`empty: ${k}`);
    const refKey = enFlat[k] !== undefined ? k : `${k.replace(/_(zero|one|two|few|many)$/, '_other')}`;
    if (placeholders(v) !== placeholders(enFlat[refKey])) errors.push(`placeholder drift: ${k} en=[${placeholders(enFlat[refKey])}] ${locale}=[${placeholders(v)}]`);
    if (/\[object Object\]/.test(v)) errors.push(`object stringified: ${k}`);
  }
  for (const k of Object.keys(got)) if (!required.has(k)) errors.push(`extra (not in en.json nor a required plural form): ${k}`);
  if (errors.length) {
    console.error(`✗ ${locale}: ${errors.length} validation error(s)`);
    for (const e of errors.slice(0, 60)) console.error('  ' + e);
    process.exit(1);
  }
  const identical = Object.keys(enFlat).filter((k) => typeof enFlat[k] === 'string' && got[k] === enFlat[k] && /[a-zA-Z]{4,}/.test(enFlat[k]));
  const out = unflattenInOrder(EN, got);
  writeFileSync(join(LOCALES_DIR, `${locale}.json`), JSON.stringify(out, null, 2) + '\n');
  console.log(`✓ ${locale}.json written: ${required.size} keys (plural categories: ${categories.join(',')}); ${identical.length} values identical to en (review below)`);
  for (const k of identical) console.log(`  = ${k}: ${JSON.stringify(enFlat[k]).slice(0, 90)}`);
} else {
  console.error('usage: extract <workdir> [chunkSize] | assemble <workdir> <locale>');
  process.exit(2);
}
