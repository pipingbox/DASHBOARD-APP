#!/usr/bin/env node
/**
 * Static guard — PB-ADMIN-ONBOARDING-SCHEMA-001.
 *
 * Fails the build if a non-existent database column is written from the frontend.
 *
 * Why this exists: `onboarding_completed` was written into the same UPDATE as
 * `onboarding_status` and `marketplace_ready`. PostgREST rejects the whole statement when any
 * column is unknown, so both canonical fields were silently dropped and job matching returned 0
 * for every worker. Nothing failed loudly — not the build, not the UI, not CI.
 *
 * This guard is deliberately dumb and fast: a grep with an allowlist. It runs without network,
 * credentials or a database, so it can never be skipped for lack of configuration — which is
 * exactly how the original defect survived.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'app', 'frontend', 'src');

/** Columns that do not exist in the database and must never be written again. */
const FORBIDDEN = [
  {
    name: 'onboarding_completed',
    reason: 'does not exist; use onboarding_status (see src/lib/onboarding.ts)',
  },
];

/** Files allowed to mention a forbidden name (documentation of why it is forbidden). */
const ALLOWLIST = new Set(['lib/onboarding.ts']);

const EXTENSIONS = ['.ts', '.tsx'];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (EXTENSIONS.some((e) => full.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

const violations = [];

for (const file of walk(SRC)) {
  const rel = relative(SRC, file).split('\\').join('/');
  if (ALLOWLIST.has(rel)) continue;

  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const { name, reason } of FORBIDDEN) {
      if (line.includes(name)) {
        violations.push({ file: rel, line: i + 1, name, reason, text: line.trim() });
      }
    }
  });
}

if (violations.length > 0) {
  console.error('\nForbidden database column reference detected:\n');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.text}`);
    console.error(`    -> "${v.name}" ${v.reason}\n`);
  }
  console.error(
    `${violations.length} violation(s). See PB-ADMIN-ONBOARDING-SCHEMA-001.\n`,
  );
  process.exit(1);
}

console.log('Schema guard OK: no forbidden column references.');
