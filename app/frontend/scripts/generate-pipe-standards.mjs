#!/usr/bin/env node
/**
 * Generator: canonical ASME B36.10M pipe dimensions → TypeScript runtime module.
 *
 * Source of truth: PIPINGBOX-BRAIN/brain/08-CATALOG/ASME/PIPE/PB-DIM-ASME-B36-10M-PIPE.yaml
 * The generated file is committed; this script is re-run when the canonical YAML changes.
 *
 * Run from app/frontend:
 *   PB_BRAIN_PATH=/workspace/PIPINGBOX-BRAIN node scripts/generate-pipe-standards.mjs
 *
 * Determinism: same source blob => byte-identical generated file.
 * Timestamp is controlled by SOURCE_DATE_EPOCH or omitted.
 *
 * Ticket: PB-TOOLS-FUNCTIONAL-PARITY-001 / W1.A.1
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { parse } from 'yaml';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BRAIN_PATH = process.env.PB_BRAIN_PATH || '/workspace/PIPINGBOX-BRAIN';
const YAML_RELPATH = 'brain/08-CATALOG/ASME/PIPE/PB-DIM-ASME-B36-10M-PIPE.yaml';
const OUTPUT_PATH = join(__dirname, '../src/tools/core/standards/generated/pipe-dimensions.ts');
const ID_TOLERANCE_MM = 0.5;

function execGit(args) {
  return execSync(`git -C ${BRAIN_PATH} ${args}`, { encoding: 'utf8' }).trim();
}

function readCanonicalYaml() {
  try {
    return {
      content: execGit(`show HEAD:${YAML_RELPATH}`),
      commit: execGit('rev-parse HEAD'),
      blob: execGit(`rev-parse HEAD:${YAML_RELPATH}`),
    };
  } catch {
    throw new Error(
      `Cannot read canonical B36.10M YAML. Ensure PB_BRAIN_PATH points to a PIPINGBOX-BRAIN checkout containing ${YAML_RELPATH}.`
    );
  }
}

const { content, commit, blob } = readCanonicalYaml();
const data = parse(content);

if (!data.rows || !Array.isArray(data.rows)) {
  throw new Error('Invalid YAML: expected rows array');
}

const rows = data.rows.map((r) => ({
  nps: String(r.nps),
  dn: Number(r.dn),
  schedule: String(r.schedule),
  odMm: Number(r.od_mm),
  wtMm: Number(r.wt_mm),
  idMm: Number(r.id_mm),
  weightKgPerM: Number(r.weight_kg_per_m),
  weightLbPerFt: Number(r.weight_lb_per_ft),
}));

// Data integrity validations
const seen = new Set();
for (const r of rows) {
  const key = `${r.nps}||${r.schedule}`;
  if (seen.has(key)) throw new Error(`Duplicate (NPS, schedule): ${key}`);
  seen.add(key);

  for (const [name, value] of Object.entries(r)) {
    if (typeof value === 'number' && (!Number.isFinite(value) || value <= 0)) {
      throw new Error(`Non-finite or non-positive ${name} for ${key}: ${value}`);
    }
  }

  const expectedId = r.odMm - 2 * r.wtMm;
  if (Math.abs(r.idMm - expectedId) > ID_TOLERANCE_MM) {
    throw new Error(
      `ID inconsistency for ${key}: id=${r.idMm}, OD-2*WT=${expectedId.toFixed(3)}`
    );
  }
}

// NPS -> DN/OD consistency: same NPS must have same DN and OD across schedules
const npsToDnOd = new Map();
for (const r of rows) {
  const existing = npsToDnOd.get(r.nps);
  if (existing) {
    if (existing.dn !== r.dn) {
      throw new Error(`NPS ${r.nps} maps to multiple DN values: ${existing.dn}, ${r.dn}`);
    }
    if (Math.abs(existing.odMm - r.odMm) > 0.001) {
      throw new Error(`NPS ${r.nps} has multiple OD values: ${existing.odMm}, ${r.odMm}`);
    }
  } else {
    npsToDnOd.set(r.nps, { dn: r.dn, odMm: r.odMm });
  }
}

const npsList = [...new Set(rows.map((r) => r.nps))];
const dnList = [...new Set(rows.map((r) => r.dn))].sort((a, b) => a - b);
const schedulesByNps = new Map();
for (const r of rows) {
  if (!schedulesByNps.has(r.nps)) schedulesByNps.set(r.nps, []);
  schedulesByNps.get(r.nps).push(r.schedule);
}

function quote(s) {
  return JSON.stringify(s);
}

const generatedAt = process.env.SOURCE_DATE_EPOCH
  ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString()
  : undefined;

const generated = `/* eslint-disable */
/**
 * GENERATED FILE — do not edit by hand.
 *
 * Source: PIPINGBOX-BRAIN ${YAML_RELPATH}
 * Source commit: ${commit}
 * Source blob: ${blob}
 * Generator: scripts/generate-pipe-standards.mjs
 * Standard: ${data.standard_id || 'PB-STD-ASME-B36-10M'}
 * Rows: ${rows.length}
${generatedAt ? ` * Generated: ${generatedAt}` : ' * Deterministic generation — no wall-clock timestamp.'}
 *
 * Provenance: CROSS_REFERENCE — values derived from ASME B36.10M cross-reference
 * tables. Do not label VERIFIED_PRIMARY until a licensed primary source is checked.
 */

export interface PipeDimension {
  /** Nominal Pipe Size, e.g. "1/2", "1-1/2", "24". */
  nps: string;
  /** Diametre Nominal (mm). */
  dn: number;
  /** Schedule designation. */
  schedule: string;
  /** Outside diameter (mm). */
  odMm: number;
  /** Wall thickness (mm). */
  wtMm: number;
  /** Inside diameter (mm). */
  idMm: number;
  /** Weight per meter (kg/m). */
  weightKgPerM: number;
  /** Weight per foot (lb/ft). */
  weightLbPerFt: number;
}

export const PIPE_DIMENSIONS: readonly PipeDimension[] = [
${rows.map((r) => `  { nps: ${quote(r.nps)}, dn: ${r.dn}, schedule: ${quote(r.schedule)}, odMm: ${r.odMm}, wtMm: ${r.wtMm}, idMm: ${r.idMm}, weightKgPerM: ${r.weightKgPerM}, weightLbPerFt: ${r.weightLbPerFt} },`).join('\n')}
];

export const NPS_LIST: readonly string[] = [${npsList.map(quote).join(', ')}];

export const DN_LIST: readonly number[] = [${dnList.join(', ')}];

export const SCHEDULES_BY_NPS: Readonly<Record<string, readonly string[]>> = {
${npsList.map((nps) => `  ${quote(nps)}: [${schedulesByNps.get(nps).map(quote).join(', ')}],`).join('\n')}
};

export const PIPE_DIMENSIONS_PROVENANCE = {
  standardId: ${quote(data.standard_id || 'PB-STD-ASME-B36-10M')},
  datasetId: ${quote(data.id || 'PB-DIM-ASME-B36-10M-PIPE')},
  sourceStatus: 'CROSS_REFERENCE' as const,
  sourceNote: 'Values from ASME B36.10M cross-reference tables. Not verified against a licensed primary text.',
  sourceCommit: ${quote(commit)},
  sourceBlob: ${quote(blob)},
  rowCount: ${rows.length},
};
`;

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, generated, 'utf8');
console.log(`Generated ${OUTPUT_PATH} with ${rows.length} rows from ${data.standard_id || data.id}.`);
console.log(`Source commit: ${commit}`);
console.log(`Source blob: ${blob}`);
