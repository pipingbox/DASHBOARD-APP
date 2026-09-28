#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// PB-INFRA-TS-GATE-001 — TypeScript regression gate (baseline-scoped, with
// exact multiplicity).
//
// WHY THIS EXISTS: the historical gate `npx tsc --skipLibCheck` runs against
// the solution-style root `tsconfig.json` (`files: []` + `references`) and,
// without `-b`, compiles NOTHING — exit 0 was a false PASS. The authoritative
// typecheck is `tsc -p tsconfig.app.json --noEmit --skipLibCheck` (exposed as
// `npm run typecheck` in app/frontend), which compiles app/frontend/src.
//
// Production currently carries 31 pre-existing TypeScript diagnostics
// (baseline: scripts/ts-error-baseline.txt). Fixing them is tracked by
// separate tickets — this gate does NOT require a clean tree yet.
//
// IDENTITY + MULTIPLICITY:
//   fingerprint = `app/frontend/<path>|<TScode>|<normalized message>`
//   — line/column deliberately excluded so inserting a line cannot fake a
//     regression. The baseline records EACH fingerprint with its EXPECTED
//   COUNT (`fingerprint|count`), so a new diagnostic that is byte-identical
//   to an existing one (same file + code + message) is still caught: its
//   count grows and the gate FAILs. Rev 2 of this gate — rev 1 lost
//   multiplicity (31 diagnostics collapsed to 23 identities).
//
// POLICY (non-negotiable):
//   For every fingerprint:
//     current count  >  baseline count  → FAIL (regression)
//     fingerprint not in baseline      → FAIL (new error)
//     current count == baseline count  → PASS
//     current count <  baseline count  → PASS (improvement, reducible)
//   The baseline NEVER grows automatically: raising a count or adding a
//   fingerprint requires a ticket + explicit PO review. `--prune-baseline`
//   only shrinks counts / removes vanished fingerprints — it refuses to run
//   in a FAIL state, so it can never introduce or inflate anything.
//
// Usage:
//   node scripts/ts-regression-gate.mjs                  # run the gate
//   node scripts/ts-regression-gate.mjs --print-current   # dump current fingerprints+counts
//   node scripts/ts-regression-gate.mjs --prune-baseline  # shrink to current (never grows)
// ═══════════════════════════════════════════════════════════════════════════
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND = join(ROOT, 'app/frontend');
const BASELINE_FILE = join(ROOT, 'scripts/ts-error-baseline.txt');
const TSC_BIN = join(FRONTEND, 'node_modules/.bin/tsc');

const args = new Set(process.argv.slice(2));
const PRINT_CURRENT = args.has('--print-current');
const PRUNE = args.has('--prune-baseline');

if (PRINT_CURRENT && PRUNE) {
  console.error('error: --print-current and --prune-baseline are mutually exclusive');
  process.exit(2);
}

// ── 1. Authoritative typecheck: compiles app/frontend/src ──
let out;
try {
  out = execFileSync(
    TSC_BIN,
    ['-p', 'tsconfig.app.json', '--noEmit', '--skipLibCheck', '--pretty', 'false'],
    { cwd: FRONTEND, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
} catch (err) {
  out = `${err.stdout || ''}${err.stderr || ''}`;
}

// ── 2. Parse diagnostics: `path(line,col): error TSxxxx: message` + continuation lines ──
const diagnostics = [];
for (const line of out.split('\n')) {
  const m = line.match(/^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/);
  if (m) diagnostics.push({ file: m[1], line: Number(m[2]), col: Number(m[3]), code: m[4], message: [m[5]] });
  else if (diagnostics.length > 0 && line.trim()) diagnostics[diagnostics.length - 1].message.push(line.trim());
}

// ── 3. Fingerprint + exact multiplicity ──
const fingerprint = (d) => `app/frontend/${d.file}|${d.code}|${d.message.join(' ')}`;
const currentMap = new Map();
for (const d of diagnostics) {
  const fp = fingerprint(d);
  currentMap.set(fp, (currentMap.get(fp) || 0) + 1);
}
const totalCurrent = [...currentMap.values()].reduce((a, b) => a + b, 0);

if (PRINT_CURRENT) {
  console.log(`# current diagnostics: ${totalCurrent} (${currentMap.size} unique fingerprints)`);
  [...currentMap.entries()].sort().forEach(([fp, n]) => console.log(`${fp}|${n}`));
  process.exit(0);
}

// ── 4. Baseline: one `fingerprint|count` per line (sorted, deterministic) ──
const parseBaseline = (text) => {
  const map = new Map();
  for (const line of text.split('\n')) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const m = l.match(/^(.*)\|(\d+)$/);
    if (!m) throw new Error(`malformed baseline line (expected fingerprint|count): ${l}`);
    map.set(m[1], Number(m[2]));
  }
  return map;
};
const baselineMap = parseBaseline(readFileSync(BASELINE_FILE, 'utf8'));
const totalBaseline = [...baselineMap.values()].reduce((a, b) => a + b, 0);

// ── 5. Regression policy ──
const added = [];   // new fingerprints OR counts that grew
for (const [fp, n] of currentMap) {
  const b = baselineMap.get(fp);
  if (b === undefined) added.push({ fp, kind: 'NEW fingerprint', baseline: 0, current: n });
  else if (n > b) added.push({ fp, kind: 'COUNT GREW', baseline: b, current: n });
}
const reduced = []; // improvements: counts shrank or fingerprints vanished
for (const [fp, b] of baselineMap) {
  const c = currentMap.get(fp) || 0;
  if (c < b) reduced.push({ fp, baseline: b, current: c });
}

console.log(`TypeScript regression gate (PB-INFRA-TS-GATE-001, rev 2 — multiplicity-aware)`);
console.log(`  authoritative check: tsc -p tsconfig.app.json --noEmit --skipLibCheck`);
console.log(`  diagnostics now: ${totalCurrent} (${currentMap.size} fingerprints) · baseline: ${totalBaseline} diagnostics (${baselineMap.size} fingerprints)`);

if (added.length > 0) {
  console.error(`\nFAIL — ${added.length} regression(s) vs baseline:`);
  for (const a of added) console.error(`  + [${a.kind}] ${a.fp}  (baseline ${a.baseline} → current ${a.current})`);
  console.error('\nA baseline increase is NOT automatic: fix the error, or open a ticket with explicit PO review to grow the baseline.');
  process.exit(1);
}

console.log(`  PASS — no new diagnostics, no count growth (current ⊆ baseline).`);
if (reduced.length > 0) {
  console.log(`\n  ${reduced.length} baseline improvement(s) (reducible, NOT auto-applied):`);
  for (const r of reduced) console.log(`  - ${r.fp}  (baseline ${r.baseline} → current ${r.current})`);
  if (PRUNE) {
    const pruned = [...currentMap.entries()].sort().map(([fp, n]) => `${fp}|${n}`);
    writeFileSync(BASELINE_FILE, `${header(pruned)}\n${pruned.join('\n')}\n`);
    console.log(`\n  --prune-baseline: baseline shrunk to ${currentMap.size} fingerprints / ${totalCurrent} diagnostics (never grows).`);
  } else {
    console.log(`\n  (Baseline NOT modified. Reduce it deliberately with --prune-baseline under ticket review.)`);
  }
  process.exit(0);
}

if (currentMap.size === 0) {
  console.log('  Tree is CLEAN: consider replacing this gate with a strict 0-error typecheck gate.');
}
process.exit(0);

function header(lines) {
  const total = baselineTotals(lines);
  return [
    '# PB-INFRA-TS-GATE-001 — TypeScript diagnostic baseline (versioned, multiplicity-aware).',
    '# Format: app/frontend/<path>|<TScode>|<normalized message>|<expected count>  (no line/col by design).',
    `# ${total.total} diagnostics across ${lines.length} fingerprints. This file may ONLY shrink`,
    '# (--prune-baseline) — adding fingerprints or raising counts requires a ticket + PO review.',
  ].join('\n');
}
function baselineTotals(lines) {
  let total = 0;
  for (const l of lines) {
    const m = l.match(/\|(\d+)$/);
    if (m) total += Number(m[1]);
  }
  return { total };
}
