/**
 * Generate TypeScript bolting modules from the canonical Brain YAML.
 *
 * This script is the bridge between the Brain (single source of truth) and the
 * frontend runtime. The generated files MUST NOT be edited manually; rerun this
 * script after updating the Brain YAML.
 *
 * Source: ../../../PIPINGBOX-BRAIN/brain/08-CATALOG/ASME/BOLTING/PB-DIM-ASME-B16-5-STUD-BOLT.yaml
 * Outputs:
 *   - src/lib/bolting/generated/asme-b16-5-stud-bolts.ts
 *   - src/lib/bolting/generated/thread-data.ts
 *   - src/lib/bolting/generated/heavy-hex-nut-data.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BRAIN_PATH = join(__dirname, '../../../PIPINGBOX-BRAIN/brain/08-CATALOG/ASME/BOLTING/PB-DIM-ASME-B16-5-STUD-BOLT.yaml');
const OUT_DIR = join(__dirname, '../src/lib/bolting/generated');

const yamlSource = readFileSync(BRAIN_PATH, 'utf8');
const sourceHash = createHash('sha256').update(yamlSource).digest('hex').slice(0, 16);
const yaml = parse(yamlSource);
const rows = yaml.rows;

function dedupe(arr, keyFn) {
  const seen = new Set();
  return arr.filter((r) => {
    const k = keyFn(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function fmtStr(s) {
  return JSON.stringify(String(s));
}

const NPS_ORDER = [
  '1/2"', '3/4"', '1"', '1-1/4"', '1-1/2"', '2"', '2-1/2"', '3"',
  '3-1/2"', '4"', '5"', '6"', '8"', '10"', '12"', '14"', '16"',
  '18"', '20"', '22"', '24"',
];

const npsOrder = NPS_ORDER;
const classes = [...new Set(rows.map((r) => r.class))].sort((a, b) => a - b);

// Thread data
const threadRows = dedupe(
  rows.map((r) => ({
    diaIn: r.stud_dia_in,
    designation: r.thread_designation,
    series: r.thread_series,
    tpi: r.tpi,
    pitchMm: r.pitch_mm,
    tensileAreaIn2: r.tensile_area_in2,
  })),
  (r) => r.diaIn
).sort((a, b) => a.diaIn - b.diaIn);

// Nut data
const nutRows = dedupe(
  rows.map((r) => ({
    diaIn: r.stud_dia_in,
    afIn: r.nut_af_in,
    afMm: r.nut_af_mm,
    heightIn: r.nut_height_in,
    heightMm: r.nut_height_mm,
  })),
  (r) => r.diaIn
).sort((a, b) => a.diaIn - b.diaIn);

function fmtNum(n) {
  return n === null || n === undefined ? 'null' : String(n);
}

const threadTs = `/**
 * GENERATED FILE — do not edit manually.
 * Source: ${BRAIN_PATH}
 * Source hash: ${sourceHash}
 *
 * Thread data derived from ASME B1.1-2024 Table 6.
 * Stud external thread Class 2A; nut internal thread Class 2B.
 */

export type ThreadSeries = 'UNC' | '8UN';

export interface ThreadSpec {
  readonly diaIn: number;
  readonly designation: string;
  readonly series: ThreadSeries;
  readonly tpi: number;
  readonly pitchMm: number;
  readonly tensileAreaIn2: number;
}

export const IMPERIAL_THREAD_DATA: Readonly<Record<number, ThreadSpec>> = {
${threadRows.map((r) => `  ${r.diaIn}: { diaIn: ${r.diaIn}, designation: ${fmtStr(r.designation)}, series: ${fmtStr(r.series)}, tpi: ${r.tpi}, pitchMm: ${r.pitchMm}, tensileAreaIn2: ${r.tensileAreaIn2} },`).join('\n')}
};

export function getThreadSpec(diaIn: number): ThreadSpec | undefined {
  return IMPERIAL_THREAD_DATA[diaIn];
}

export function minProtrusionMm(diaIn: number): number | undefined {
  const thread = getThreadSpec(diaIn);
  if (!thread) return undefined;
  return Number((3 * thread.pitchMm).toFixed(2));
}
`;

const nutTs = `/**
 * GENERATED FILE — do not edit manually.
 * Source: ${BRAIN_PATH}
 * Source hash: ${sourceHash}
 *
 * Heavy hex nut data derived from ASME B18.2.2-2022.
 */

export interface HeavyHexNutSpec {
  readonly nominalDiaIn: number;
  readonly afIn: number;
  readonly afMm: number;
  readonly heightIn: number;
  readonly heightMm: number;
}

export const HEAVY_HEX_NUT_DATA: Readonly<Record<number, HeavyHexNutSpec>> = {
${nutRows.map((r) => `  ${r.diaIn}: { nominalDiaIn: ${r.diaIn}, afIn: ${r.afIn}, afMm: ${r.afMm}, heightIn: ${r.heightIn}, heightMm: ${r.heightMm} },`).join('\n')}
};

export function getHeavyHexNutSpec(nominalDiaIn: number): HeavyHexNutSpec | undefined {
  return HEAVY_HEX_NUT_DATA[nominalDiaIn];
}
`;

const boltingTs = `/**
 * GENERATED FILE — do not edit manually.
 * Source: ${BRAIN_PATH}
 * Source hash: ${sourceHash}
 *
 * Stud bolt data target standard: ASME B16.5-2025.
 * Verification status of source rows: ${yaml.quality?.validation_status ?? 'unknown'} (confidence ${yaml.quality?.confidence ?? 'unknown'}).
 */

export type FacingType = 'RF' | 'RTJ';

export interface StudBoltingRow {
  readonly nps: string;
  readonly dn: number;
  readonly qty: number;
  readonly diaIn: number;
  readonly lengthRfMm: number;
  readonly lengthRtjMm: number | null;
  readonly threadDesignation: string;
  readonly threadSeries: string;
  readonly tpi: number;
  readonly pitchMm: number;
  readonly tensileAreaIn2: number;
  readonly nutAfIn: number;
  readonly nutAfMm: number;
  readonly nutHeightIn: number;
  readonly nutHeightMm: number;
  readonly verificationStatus: string;
}

export interface PressureClassData {
  readonly standard: string;
  readonly edition: string;
  readonly source: string;
  readonly lengthDefinition: string;
  readonly rows: Readonly<Record<string, StudBoltingRow>>;
}

export const ASME_B16_5_NPS_ORDER: readonly string[] = [${npsOrder.map((n) => `${fmtStr(n)}`).join(', ')}];

export const ASME_B16_5_PRESSURE_CLASSES: readonly number[] = [${classes.join(', ')}];

export const ASME_B16_5_STUD_BOLTS: Readonly<Record<number, PressureClassData>> = {
${classes.map((cls) => {
  const classRows = rows.filter((r) => r.class === cls);
  const rowRecords = classRows.map((r) => {
    const npsDisplay = `${r.nps}"`;
    return `    ${fmtStr(npsDisplay)}: { nps: ${fmtStr(npsDisplay)}, dn: ${r.dn}, qty: ${r.num_studs}, diaIn: ${r.stud_dia_in}, lengthRfMm: ${r.stud_length_rf_mm}, lengthRtjMm: ${fmtNum(r.stud_length_rtj_mm)}, threadDesignation: ${fmtStr(r.thread_designation)}, threadSeries: ${fmtStr(r.thread_series)}, tpi: ${r.tpi}, pitchMm: ${r.pitch_mm}, tensileAreaIn2: ${r.tensile_area_in2}, nutAfIn: ${r.nut_af_in}, nutAfMm: ${r.nut_af_mm}, nutHeightIn: ${r.nut_height_in}, nutHeightMm: ${r.nut_height_mm}, verificationStatus: ${fmtStr(r.verification_status)} }`;
  }).join(',\n');
  return `  ${cls}: {
    standard: "ASME B16.5",
    edition: "2025",
    source: "Brain YAML canonical dataset",
    lengthDefinition: "Stud length L is measured parallel to the axis from first to last full thread, excluding chamfers/points, per ASME B16.5 stud bolt definition.",
    rows: {
${rowRecords}
    }
  }`;
}).join(',\n')}
};

export function getStudBoltRow(pressureClass: number, nps: string): StudBoltingRow | undefined {
  return ASME_B16_5_STUD_BOLTS[pressureClass]?.rows[nps];
}
`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'thread-data.ts'), threadTs, 'utf8');
writeFileSync(join(OUT_DIR, 'heavy-hex-nut-data.ts'), nutTs, 'utf8');
writeFileSync(join(OUT_DIR, 'asme-b16-5-stud-bolts.ts'), boltingTs, 'utf8');

console.log('Generated bolting modules in', OUT_DIR);
console.log('Rows:', rows.length, 'Classes:', classes.join(', '), 'NPS:', npsOrder.length);
