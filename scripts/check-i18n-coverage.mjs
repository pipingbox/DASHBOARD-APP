#!/usr/bin/env node
/**
 * PB-I18N-IT-001 — i18n coverage checker.
 *
 * Compares the leaf key paths of every locale against `en.json` (the reference)
 * and reports coverage plus the list of missing / extra keys.
 *
 * A "leaf" is any non-object value (string, number, boolean, null) or an array.
 * Arrays are treated as leaves on purpose: the project does not use indexed
 * array translations, so descending into them would produce noise.
 *
 * Usage:
 *   node scripts/check-i18n-coverage.mjs              # summary table
 *   node scripts/check-i18n-coverage.mjs --missing it # list missing keys for a locale
 *   node scripts/check-i18n-coverage.mjs --json       # machine-readable output
 *   node scripts/check-i18n-coverage.mjs --strict     # exit 1 if any locale < 100%
 *
 * Exit codes: 0 = OK, 1 = coverage gap under --strict, 2 = unreadable/invalid JSON.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = join(__dirname, '..', 'app', 'frontend', 'src', 'i18n', 'locales');
const REFERENCE = 'en';

// ─── args ────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const strict = argv.includes('--strict');
const missingIdx = argv.indexOf('--missing');
const missingFor = missingIdx !== -1 ? argv[missingIdx + 1] : null;

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Collect every leaf key path ("a.b.c") of a nested translation object. */
function collectLeafPaths(node, prefix = '', out = new Set()) {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    if (prefix) out.add(prefix);
    return out;
  }
  for (const [key, value] of Object.entries(node)) {
    collectLeafPaths(value, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

/** Read + parse a locale file, exiting with code 2 on any failure. */
function readLocale(code) {
  const file = join(LOCALES_DIR, `${code}.json`);
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`✗ ${code}.json is not readable/valid JSON: ${err.message}`);
    process.exit(2);
  }
}

function pct(part, total) {
  return total === 0 ? 100 : (part / total) * 100;
}

// ─── main ────────────────────────────────────────────────────────────────────

const codes = readdirSync(LOCALES_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => basename(f, '.json'))
  .sort((a, b) => (a === REFERENCE ? -1 : b === REFERENCE ? 1 : a.localeCompare(b)));

if (!codes.includes(REFERENCE)) {
  console.error(`✗ reference locale "${REFERENCE}.json" not found in ${LOCALES_DIR}`);
  process.exit(2);
}

const referencePaths = collectLeafPaths(readLocale(REFERENCE));
const total = referencePaths.size;

const report = codes.map((code) => {
  const paths = collectLeafPaths(readLocale(code));
  const missing = [...referencePaths].filter((p) => !paths.has(p));
  const extra = [...paths].filter((p) => !referencePaths.has(p));
  return {
    code,
    present: total - missing.length,
    total,
    coverage: Number(pct(total - missing.length, total).toFixed(1)),
    missing,
    extra,
  };
});

// ─── output ──────────────────────────────────────────────────────────────────

if (asJson) {
  console.log(JSON.stringify({ reference: REFERENCE, total, locales: report }, null, 2));
} else if (missingFor) {
  const entry = report.find((r) => r.code === missingFor);
  if (!entry) {
    console.error(`✗ unknown locale "${missingFor}". Available: ${codes.join(', ')}`);
    process.exit(2);
  }
  console.log(`Missing keys in ${missingFor}.json (${entry.missing.length}):`);
  for (const path of entry.missing) console.log(`  ${path}`);
  if (entry.extra.length) {
    console.log(`\nExtra keys not in ${REFERENCE}.json (${entry.extra.length}):`);
    for (const path of entry.extra) console.log(`  ${path}`);
  }
} else {
  console.log(`i18n coverage — reference: ${REFERENCE}.json (${total} leaf keys)\n`);
  console.log('| locale | keys        | coverage | missing | extra |');
  console.log('|--------|-------------|----------|---------|-------|');
  for (const r of report) {
    const keys = `${r.present}/${r.total}`.padEnd(11);
    const cov = `${r.coverage.toFixed(1)} %`.padStart(8);
    console.log(
      `| ${r.code.padEnd(6)} | ${keys} | ${cov} | ${String(r.missing.length).padStart(7)} | ${String(r.extra.length).padStart(5)} |`,
    );
  }
  const incomplete = report.filter((r) => r.missing.length > 0);
  console.log(
    incomplete.length === 0
      ? '\n✓ All locales at 100% parity with the reference.'
      : `\n⚠ ${incomplete.length} locale(s) below parity: ${incomplete.map((r) => r.code).join(', ')}` +
          `\n  Run with --missing <locale> to list the gaps.`,
  );
}

if (strict && report.some((r) => r.missing.length > 0)) process.exit(1);
