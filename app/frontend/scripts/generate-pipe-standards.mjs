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
 * Ticket: PB-TOOLS-FUNCTIONAL-PARITY-001 / W1.A
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

function readCanonicalYaml() {
  const fsPath = join(BRAIN_PATH, YAML_RELPATH);
  try {
    return execSync(`git -C ${BRAIN_PATH} show HEAD:${YAML_RELPATH}`, { encoding: 'utf8' });
  } catch {
    throw new Error(
      `Cannot read canonical B36.10M YAML. Ensure PB_BRAIN_PATH points to a PIPINGBOX-BRAIN checkout containing ${YAML_RELPATH}.`
    );
  }
}

const raw = readCanonicalYaml();
const data = parse(raw);

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

const generated = `/* eslint-disable */
/**
 * GENERATED FILE — do not edit by hand.
 *
 * Source: PIPINGBOX-BRAIN ${YAML_RELPATH}
 * Generator: scripts/generate-pipe-standards.mjs
 * Standard: ${data.standard_id || 'PB-STD-ASME-B36-10M'}
 * Rows: ${rows.length}
 * Generated: ${new Date().toISOString()}
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
  rowCount: ${rows.length},
  generatedAt: ${quote(new Date().toISOString())},
};
`;

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, generated, 'utf8');
console.log(`Generated ${OUTPUT_PATH} with ${rows.length} rows from ${data.standard_id || data.id}.`);
