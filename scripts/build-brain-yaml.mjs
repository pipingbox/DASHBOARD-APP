/**
 * Build the canonical Brain YAML for ASME B16.5 stud bolts from reference tables.
 *
 * This script is the single source of truth generator. The output YAML is the
 * canonical dataset; the frontend TypeScript modules are generated from it
 * via generate-bolting-data.mjs.
 *
 * Reference tables used:
 * - Texas Flange ASME B16.5 bolt/stud chart (Classes 150, 300, 600, 900, 1500, 2500)
 *   https://texasflange.com/products/flange-dims-weights/bolt-and-stud-dimensions-asme-b16-5-flanges
 * - Flange Bolt Chart Class 400
 *   https://www.flangeboltchart.com/bolt-charts/400-flange-bolt-chart
 * - ASME B1.1-2024 thread data (UNC <= 1", 8UN > 1")
 * - ASME B18.2.2-2022 heavy hex nut dimensions (via Wermac cross-reference)
 *
 * NOTE: ASME B16.5-2025 primary text is not available in this environment.
 * All rows are tagged with verification status. Rows that cannot be verified
 * against a primary source are marked UNVERIFIED rather than estimated.
 */

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BRAIN_PATH = join(__dirname, '../PIPINGBOX-BRAIN/brain/08-CATALOG/ASME/BOLTING/PB-DIM-ASME-B16-5-STUD-BOLT.yaml');

const NPS_ORDER = [
  '1/2"', '3/4"', '1"', '1-1/4"', '1-1/2"', '2"', '2-1/2"', '3"',
  '3-1/2"', '4"', '5"', '6"', '8"', '10"', '12"', '14"', '16"',
  '18"', '20"', '22"', '24"',
];

const DN_MAP = {
  '1/2"': 15, '3/4"': 20, '1"': 25, '1-1/4"': 32, '1-1/2"': 40,
  '2"': 50, '2-1/2"': 65, '3"': 80, '3-1/2"': 90, '4"': 100,
  '5"': 125, '6"': 150, '8"': 200, '10"': 250, '12"': 300,
  '14"': 350, '16"': 400, '18"': 450, '20"': 500, '22"': 550, '24"': 600,
};

function fracToDecimal(s) {
  if (s === null || s === undefined || s === '—' || s === '-') return null;
  const str = String(s).trim().replace(/"/g, '');
  if (str === '') return null;
  const parts = str.split('-');
  let whole = 0;
  let fracPart = str;
  if (parts.length === 2) {
    whole = parseInt(parts[0], 10);
    fracPart = parts[1];
  }
  const [num, den] = fracPart.split('/').map((x) => parseInt(x, 10));
  if (!den) return parseFloat(str);
  return whole + num / den;
}

function mm(inches) {
  if (inches === null) return null;
  return Math.round(inches * 25.4);
}

// Texas Flange table values (NPS, qty, dia, L_RF, L_RTJ)
const TEXAS_FLANGE = {
  150: [
    ['1/2', 4, '1/2', '2-1/4', null],
    ['3/4', 4, '1/2', '2-1/2', null],
    ['1', 4, '1/2', '2-1/2', '3'],
    ['1-1/4', 4, '1/2', '2-3/4', '3-1/4'],
    ['1-1/2', 4, '1/2', '2-3/4', '3-1/4'],
    ['2', 4, '5/8', '3-1/4', '3-3/4'],
    ['2-1/2', 4, '5/8', '3-1/2', '4'],
    ['3', 4, '5/8', '3-1/2', '4'],
    ['3-1/2', 8, '5/8', '3-1/2', '4'],
    ['4', 8, '5/8', '3-1/2', '4'],
    ['5', 8, '3/4', '3-3/4', '4-1/4'],
    ['6', 8, '3/4', '4', '4-1/2'],
    ['8', 8, '3/4', '4-1/4', '4-3/4'],
    ['10', 12, '7/8', '4-1/2', '5'],
    ['12', 12, '7/8', '4-3/4', '5-1/4'],
    ['14', 12, '1', '5-1/4', '5-3/4'],
    ['16', 16, '1', '5-1/4', '5-3/4'],
    ['18', 16, '1-1/8', '5-3/4', '6-1/4'],
    ['20', 20, '1-1/8', '6-1/4', '6-3/4'],
    ['24', 20, '1-1/4', '6-3/4', '7-1/4'],
  ],
  300: [
    ['1/2', 4, '1/2', '2-1/2', '3'],
    ['3/4', 4, '5/8', '3', '3-1/2'],
    ['1', 4, '5/8', '3', '3-1/2'],
    ['1-1/4', 4, '5/8', '3-1/4', '3-3/4'],
    ['1-1/2', 4, '3/4', '3-1/2', '4'],
    ['2', 8, '5/8', '3-1/2', '4'],
    ['2-1/2', 8, '3/4', '4', '4-1/2'],
    ['3', 8, '3/4', '4-1/4', '4-3/4'],
    ['3-1/2', 8, '3/4', '4-1/4', '5'],
    ['4', 8, '3/4', '4-1/2', '5'],
    ['5', 8, '3/4', '4-3/4', '5-1/4'],
    ['6', 12, '3/4', '4-3/4', '5-1/2'],
    ['8', 12, '7/8', '5-1/2', '6'],
    ['10', 16, '1', '6-1/4', '6-3/4'],
    ['12', 16, '1-1/8', '6-3/4', '7-1/4'],
    ['14', 20, '1-1/8', '7', '7-1/2'],
    ['16', 20, '1-1/4', '7-1/2', '8'],
    ['18', 24, '1-1/4', '7-3/4', '8-1/4'],
    ['20', 24, '1-1/4', '8', '8-3/4'],
    ['22', 24, '1-1/2', '9', '10'],
    ['24', 24, '1-1/2', '9', '10'],
  ],
  600: [
    ['1/2', 4, '1/2', '3', '3'],
    ['3/4', 4, '5/8', '3-1/2', '3-1/2'],
    ['1', 4, '5/8', '3-1/2', '3-1/2'],
    ['1-1/4', 4, '5/8', '3-3/4', '3-3/4'],
    ['1-1/2', 4, '3/4', '4-1/4', '4-1/4'],
    ['2', 8, '5/8', '4-1/4', '4-1/4'],
    ['2-1/2', 8, '3/4', '4-3/4', '4-3/4'],
    ['3', 8, '3/4', '5', '5'],
    ['3-1/2', 8, '7/8', '5-1/2', '5-1/2'],
    ['4', 8, '7/8', '5-3/4', '5-3/4'],
    ['5', 8, '1', '6-1/2', '6-1/2'],
    ['6', 12, '1', '6-3/4', '6-3/4'],
    ['8', 12, '1-1/8', '7-1/2', '7-3/4'],
    ['10', 16, '1-1/4', '8-1/2', '8-1/2'],
    ['12', 20, '1-1/4', '8-3/4', '8-3/4'],
    ['14', 20, '1-3/8', '9-1/4', '9-1/4'],
    ['16', 20, '1-1/2', '10', '10'],
    ['18', 20, '1-5/8', '10-3/4', '10-3/4'],
    ['20', 24, '1-5/8', '11-1/4', '11-1/2'],
    ['24', 24, '1-7/8', '13', '13-1/4'],
  ],
  900: [
    ['1/2', 4, '3/4', '4-1/4', '4-1/4'],
    ['3/4', 4, '3/4', '4-1/2', '4-1/2'],
    ['1', 4, '7/8', '5', '5'],
    ['1-1/4', 4, '7/8', '5', '5'],
    ['1-1/2', 4, '1', '5-1/2', '5-1/2'],
    ['2', 8, '7/8', '5-3/4', '5-3/4'],
    ['2-1/2', 8, '1', '6-1/4', '6-1/4'],
    ['3', 8, '7/8', '5-3/4', '5-3/4'],
    ['3-1/2', 8, '1', '6-1/4', '6-1/4'],
    ['4', 8, '1-1/8', '6-3/4', '6-3/4'],
    ['5', 8, '1-1/4', '7-1/2', '7-1/2'],
    ['6', 12, '1-1/8', '7-1/2', '7-3/4'],
    ['8', 12, '1-3/8', '8-3/4', '8-3/4'],
    ['10', 16, '1-3/8', '9-1/4', '9-1/4'],
    ['12', 20, '1-3/8', '10', '10'],
    ['14', 20, '1-1/2', '10-3/4', '11'],
    ['16', 20, '1-5/8', '11-1/4', '11-1/2'],
    ['18', 20, '1-7/8', '12-3/4', '13-1/4'],
    ['20', 20, '2', '13-3/4', '14-1/4'],
    ['24', 20, '2-1/2', '17-1/4', '18'],
  ],
  1500: [
    ['1/2', 4, '3/4', '4-1/4', '4-1/4'],
    ['3/4', 4, '3/4', '4-1/2', '4-1/2'],
    ['1', 4, '7/8', '5', '5'],
    ['1-1/4', 4, '7/8', '5', '5'],
    ['1-1/2', 4, '1', '5-1/2', '5-1/2'],
    ['2', 8, '7/8', '5-3/4', '5-3/4'],
    ['2-1/2', 8, '1', '6-1/4', '6-1/4'],
    ['3', 8, '1-1/8', '7', '7'],
    ['3-1/2', 8, '1-1/4', '7-3/4', '7-3/4'],
    ['4', 8, '1-1/4', '7-3/4', '7-3/4'],
    ['5', 8, '1-1/2', '9-3/4', '9-3/4'],
    ['6', 12, '1-3/8', '10-1/4', '10-1/2'],
    ['8', 12, '1-5/8', '11-1/2', '11-3/4'],
    ['10', 12, '1-7/8', '13-1/4', '13-1/2'],
    ['12', 16, '2', '14-3/4', '15-1/4'],
    ['14', 16, '2-1/4', '16', '16-3/4'],
    ['16', 16, '2-1/2', '17-1/2', '18-1/2'],
    ['18', 16, '2-3/4', '19-1/2', '20-3/4'],
    ['20', 16, '3', '21-1/4', '22-1/4'],
    ['24', 16, '3-1/2', '24-1/4', '25-1/2'],
  ],
  2500: [
    ['1/2', 4, '3/4', '4-3/4', '4-3/4'],
    ['3/4', 4, '3/4', '5', '5'],
    ['1', 4, '7/8', '5-1/2', '5-1/2'],
    ['1-1/4', 4, '1', '6', '6'],
    ['1-1/2', 4, '1-1/8', '6-3/4', '6-3/4'],
    ['2', 8, '1', '7', '7'],
    ['2-1/2', 8, '1-1/8', '7-3/4', '8'],
    ['3', 8, '1-1/4', '8-3/4', '9'],
    ['4', 8, '1-1/2', '10', '10-1/4'],
    ['5', 8, '1-3/4', '11-3/4', '12-1/4'],
    ['6', 8, '2', '13-1/2', '14'],
    ['8', 12, '2', '15', '15-1/2'],
    ['10', 12, '2-1/2', '19-1/4', '20'],
    ['12', 12, '2-3/4', '21-1/4', '22'],
    // Class 2500 not defined by B16.5 above NPS 12.
  ],
};

// Class 400 from flangeboltchart.com (cites ASME B16.5-2020 Table 13C)
const CLASS_400 = [
  ['1/2', 4, '1/2', '3', '3'],
  ['3/4', 4, '5/8', '3-1/2', '3-1/2'],
  ['1', 4, '5/8', '3-1/2', '3-1/2'],
  ['1-1/4', 4, '5/8', '3-3/4', '3-3/4'],
  ['1-1/2', 4, '3/4', '4-1/4', '4-1/4'],
  ['2', 8, '5/8', '4-1/4', '4-1/4'],
  ['2-1/2', 8, '3/4', '4-3/4', '4-3/4'],
  ['3', 8, '3/4', '5', '5'],
  ['3-1/2', 8, '7/8', '5-1/2', '5-1/2'],
  ['4', 8, '7/8', '5-1/2', '5-1/2'],
  ['5', 8, '7/8', '5-3/4', '5-3/4'],
  ['6', 12, '7/8', '6', '6'],
  ['8', 12, '1', '6-3/4', '6-3/4'],
  ['10', 16, '1-1/8', '7-1/2', '7-1/2'],
  ['12', 16, '1-1/4', '8', '8'],
  ['14', 20, '1-1/4', '8-1/4', '8-1/4'],
  ['16', 20, '1-3/8', '8-3/4', '8-3/4'],
  ['18', 24, '1-3/8', '9', '9'],
  ['20', 24, '1-1/2', '9-1/2', '9-3/4'],
  ['22', 24, '1-5/8', '10', '10-1/4'],
  ['24', 24, '1-3/4', '10-1/2', '11'],
];

// ASME B1.1-2024 Table 6 coarse / 8-thread series.
// Class 2A for external thread (stud), 2B implied for internal thread (nut).
const THREAD_DATA = {
  0.500: { tpi: 13, series: 'UNC', tensile_area_in2: 0.142 },
  0.625: { tpi: 11, series: 'UNC', tensile_area_in2: 0.226 },
  0.750: { tpi: 10, series: 'UNC', tensile_area_in2: 0.334 },
  0.875: { tpi: 9, series: 'UNC', tensile_area_in2: 0.462 },
  1.000: { tpi: 8, series: 'UNC', tensile_area_in2: 0.606 },
  1.125: { tpi: 8, series: '8UN', tensile_area_in2: 0.763 },
  1.250: { tpi: 8, series: '8UN', tensile_area_in2: 0.969 },
  1.375: { tpi: 8, series: '8UN', tensile_area_in2: 1.155 },
  1.500: { tpi: 8, series: '8UN', tensile_area_in2: 1.405 },
  1.625: { tpi: 8, series: '8UN', tensile_area_in2: 1.653 },
  1.750: { tpi: 8, series: '8UN', tensile_area_in2: 1.918 },
  1.875: { tpi: 8, series: '8UN', tensile_area_in2: 2.199 },
  2.000: { tpi: 8, series: '8UN', tensile_area_in2: 2.496 },
  2.250: { tpi: 8, series: '8UN', tensile_area_in2: 3.16 },
  2.500: { tpi: 8, series: '8UN', tensile_area_in2: 4.00 },
  2.750: { tpi: 8, series: '8UN', tensile_area_in2: 4.93 },
  3.000: { tpi: 8, series: '8UN', tensile_area_in2: 5.97 },
  3.250: { tpi: 8, series: '8UN', tensile_area_in2: 7.10 },
  3.500: { tpi: 8, series: '8UN', tensile_area_in2: 8.33 },
  3.750: { tpi: 8, series: '8UN', tensile_area_in2: 9.66 },
  4.000: { tpi: 8, series: '8UN', tensile_area_in2: 11.08 },
};

// ASME B18.2.2-2022 heavy hex nut basic dimensions (across flats F, thickness T).
const NUT_DATA = {
  0.500: { af_in: 7 / 8, height_in: 31 / 64 },
  0.625: { af_in: 17 / 16, height_in: 39 / 64 },
  0.750: { af_in: 5 / 4, height_in: 47 / 64 },
  0.875: { af_in: 23 / 16, height_in: 55 / 64 },
  1.000: { af_in: 13 / 8, height_in: 63 / 64 },
  1.125: { af_in: 1 + 29 / 64, height_in: 71 / 64 },
  1.250: { af_in: 2.000, height_in: 31 / 32 },
  1.375: { af_in: 35 / 16, height_in: 43 / 32 },
  1.500: { af_in: 19 / 8, height_in: 47 / 32 },
  1.625: { af_in: 41 / 16, height_in: 51 / 32 },
  1.750: { af_in: 11 / 4, height_in: 55 / 32 },
  1.875: { af_in: 47 / 16, height_in: 59 / 32 },
  2.000: { af_in: 25 / 8, height_in: 63 / 32 },
  2.250: { af_in: 7 / 2, height_in: 91 / 64 },
  2.500: { af_in: 31 / 8, height_in: 105 / 64 },
  2.750: { af_in: 17 / 4, height_in: 119 / 64 },
  3.000: { af_in: 37 / 8, height_in: 133 / 64 },
  3.250: { af_in: 5.000, height_in: 51 / 16 },
  3.500: { af_in: 43 / 8, height_in: 55 / 16 },
  3.750: { af_in: 23 / 4, height_in: 59 / 16 },
  4.000: { af_in: 49 / 8, height_in: 63 / 16 },
};

function displayDia(inches) {
  const map = {
    0.5: '1/2"', 0.625: '5/8"', 0.75: '3/4"', 0.875: '7/8"', 1: '1"',
    1.125: '1-1/8"', 1.25: '1-1/4"', 1.375: '1-3/8"', 1.5: '1-1/2"',
    1.625: '1-5/8"', 1.75: '1-3/4"', 1.875: '1-7/8"', 2: '2"',
    2.25: '2-1/4"', 2.5: '2-1/2"', 2.75: '2-3/4"', 3: '3"',
    3.25: '3-1/4"', 3.5: '3-1/2"', 3.75: '3-3/4"', 4: '4"',
  };
  return map[inches] || `${inches.toFixed(4)}"`;
}

function threadDesignation(diaIn) {
  const td = THREAD_DATA[diaIn];
  if (!td) return null;
  const suffix = td.series === '8UN' ? '8 UN' : `${td.tpi} UNC`;
  return `${displayDia(diaIn)}-${suffix}-2A`;
}

function buildRows() {
  const all = { ...TEXAS_FLANGE, 400: CLASS_400 };
  const rows = [];
  for (const cls of [150, 300, 400, 600, 900, 1500, 2500]) {
    const classRows = all[cls] || [];
    for (const [npsRaw, qty, diaStr, rfStr, rtjStr] of classRows) {
      const nps = npsRaw.includes('"') ? npsRaw : `${npsRaw}"`;
      const dia = fracToDecimal(diaStr);
      const rf = fracToDecimal(rfStr);
      const rtj = fracToDecimal(rtjStr);
      const td = THREAD_DATA[dia];
      const nd = NUT_DATA[dia];
      rows.push({
        nps: nps.replace(/"$/, ''),
        dn: DN_MAP[nps],
        class: cls,
        num_studs: qty,
        stud_dia_in: Number(dia.toFixed(4)),
        stud_dia_mm: mm(dia),
        thread_designation: threadDesignation(dia),
        thread_series: td.series,
        tpi: td.tpi,
        pitch_mm: Number((25.4 / td.tpi).toFixed(3)),
        tensile_area_in2: td.tensile_area_in2,
        stud_length_rf_in: Number(rf.toFixed(4)),
        stud_length_rf_mm: mm(rf),
        stud_length_rtj_in: rtj === null ? null : Number(rtj.toFixed(4)),
        stud_length_rtj_mm: rtj === null ? null : mm(rtj),
        nut_af_in: Number(nd.af_in.toFixed(4)),
        nut_af_mm: mm(nd.af_in),
        nut_height_in: Number(nd.height_in.toFixed(4)),
        nut_height_mm: mm(nd.height_in),
        verification_status: 'cross_reference_only',
        verification_note: 'Value reproduced from industrial reference table; pending validation against ASME B16.5-2025 primary text.',
      });
    }
  }
  return rows;
}

const rows = buildRows();

const yaml = `# PIDM-003 Compliant — Dimension Set
# Updated for PB-TOOLS-STUDBOLT-REVISION-001
# Ticket: PB-TOOLS-STUDBOLT-REVISION-001
schema_version: 1.2.0
id: PB-DIM-ASME-B16-5-STUD-BOLT
component_id: PB-COMP-STUD-BOLT-ASME-B16-5
standard_id: PB-STD-ASME-B16-5
dataset_type: standard
system: mixed

selectors:
  - key: nps
    label: Nominal Pipe Size
    unit: in
    type: string
  - key: dn
    label: Diametre Nominal
    unit: mm
    type: integer
  - key: class
    label: Pressure Class
    unit: dimensionless
    type: integer
  - key: facing
    label: Flange Facing
    type: string

fields:
  - key: num_studs
    label: Number of Studs
    unit: ""
    type: integer
    fabrication_priority: 1
  - key: stud_dia_in
    label: Stud Diameter
    unit: in
    type: number
    fabrication_priority: 2
  - key: stud_dia_mm
    label: Stud Diameter
    unit: mm
    type: number
    fabrication_priority: 3
  - key: thread_designation
    label: Thread Designation
    type: string
    fabrication_priority: 4
  - key: thread_series
    label: Thread Series
    type: string
    fabrication_priority: 4
  - key: tpi
    label: Threads Per Inch
    type: integer
    fabrication_priority: 5
  - key: pitch_mm
    label: Thread Pitch
    unit: mm
    type: number
    fabrication_priority: 6
  - key: tensile_area_in2
    label: Tensile Stress Area
    unit: in2
    type: number
    fabrication_priority: 6
  - key: stud_length_rf_in
    label: Stud Length RF
    unit: in
    type: number
    fabrication_priority: 7
  - key: stud_length_rf_mm
    label: Stud Length RF
    unit: mm
    type: number
    fabrication_priority: 8
  - key: stud_length_rtj_in
    label: Stud Length RTJ
    unit: in
    type: number
    fabrication_priority: 9
  - key: stud_length_rtj_mm
    label: Stud Length RTJ
    unit: mm
    type: number
    fabrication_priority: 10
  - key: nut_af_in
    label: Heavy Hex Nut Across Flats
    unit: in
    type: number
    fabrication_priority: 11
  - key: nut_af_mm
    label: Heavy Hex Nut Across Flats
    unit: mm
    type: number
    fabrication_priority: 12
  - key: nut_height_in
    label: Heavy Hex Nut Height
    unit: in
    type: number
    fabrication_priority: 13
  - key: nut_height_mm
    label: Heavy Hex Nut Height
    unit: mm
    type: number
    fabrication_priority: 14

rows:
${rows.map((r) => `  - {nps: "${r.nps}", dn: ${r.dn}, class: ${r.class}, num_studs: ${r.num_studs}, stud_dia_in: ${r.stud_dia_in}, stud_dia_mm: ${r.stud_dia_mm}, thread_designation: '${r.thread_designation}', thread_series: "${r.thread_series}", tpi: ${r.tpi}, pitch_mm: ${r.pitch_mm}, tensile_area_in2: ${r.tensile_area_in2}, stud_length_rf_in: ${r.stud_length_rf_in}, stud_length_rf_mm: ${r.stud_length_rf_mm}, stud_length_rtj_in: ${r.stud_length_rtj_in === null ? 'null' : r.stud_length_rtj_in}, stud_length_rtj_mm: ${r.stud_length_rtj_mm === null ? 'null' : r.stud_length_rtj_mm}, nut_af_in: ${r.nut_af_in}, nut_af_mm: ${r.nut_af_mm}, nut_height_in: ${r.nut_height_in}, nut_height_mm: ${r.nut_height_mm}, verification_status: "${r.verification_status}"}`).join('\n')}

notes:
  - "Stud bolt dimensional data target: ASME B16.5-2025."
  - "Thread data: ASME B1.1-2024 Table 6. Stud external thread Class 2A; nut internal thread Class 2B."
  - "Nut data: ASME B18.2.2-2022 Heavy Hex Nut."
  - "UNC for nominal diameter <= 1 in; 8UN for nominal diameter > 1 in."
  - "Stud length L excludes chamfers/points, per ASME B16.5 stud bolt definition."
  - "RF and RTJ lengths are separated; null means undefined for that facing."
  - "Material pairing typical: ASTM A193/A193M studs with ASTM A194/A194M heavy hex nuts."
  - "Minimum 3 full threads visible beyond each nut face is a PipingBox project criterion, not an ASME B16.5 requirement."

quality:
  validation_status: draft
  confidence: 0.55
  verification_policy: "Rows marked cross_reference_only are reproduced from respected industrial tables. They MUST be re-validated against the primary ASME B16.5-2025 text before being marked verified."
  sources:
    - name: ASME B16.5-2025 (target standard, primary text not available in this environment)
      type: standard
      priority: 1
    - name: ASME B1.1-2024 Table 6
      type: standard
      priority: 2
    - name: ASME B18.2.2-2022 Heavy Hex Nuts
      type: standard
      priority: 3
    - name: Texas Flange ASME B16.5 Bolt and Stud Chart
      type: reference
      url: https://texasflange.com/products/flange-dims-weights/bolt-and-stud-dimensions-asme-b16-5-flanges
    - name: Flange Bolt Chart Class 400
      type: reference
      url: https://www.flangeboltchart.com/bolt-charts/400-flange-bolt-chart

lifecycle:
  created_at: "2026-07-24"
  updated_at: "2026-09-09"
`;

writeFileSync(BRAIN_PATH, yaml, 'utf8');
console.log('Wrote', BRAIN_PATH);
console.log('Rows:', rows.length);
console.log('Classes:', [...new Set(rows.map((r) => r.class))].sort((a, b) => a - b).join(', '));
