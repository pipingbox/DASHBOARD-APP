/**
 * PB-BRANCH-INJERTO-EXPANSION-001 — U5.2a
 * CODO → TUBO screen projection regression (no browser, no React).
 *
 * Run: node --experimental-strip-types scripts/test-elbow-on-pipe-display.ts
 *
 * Asserts the exact strings `projectElbowOnPipe` hands to the panel, so the
 * Playwright expectations in tests/elbow-on-pipe-ui.spec.ts are derived from the
 * validated Tubero corpus instead of being written by hand.
 *
 * The Tubero row re-indexing (`mirroredRow`) lives HERE and only here. Product
 * code renders the physical station order returned by the kernel.
 */
import {
  computeElbowOnPipe,
  type ElbowOnPipeDatum,
  type ElbowOnPipeInput,
} from '../app/frontend/src/tools/branch/elbowOnPipeGeometry.ts';
import {
  projectElbowOnPipe,
  type ElbowOnPipeDisplay,
} from '../app/frontend/src/tools/branch/elbowOnPipeDisplay.ts';
import {
  REFERENCE_ANOMALIES, REFERENCE_DATASETS, type ReferenceDataset,
} from './fixtures/elbow-on-pipe-reference.ts';

let passed = 0;
const failures: string[] = [];
function check(name: string, condition: boolean, detail = ''): void {
  if (condition) passed++;
  else failures.push(`${name}${detail ? ': ' + detail : ''}`);
}

/** Tubero display contract: one decimal of the stored double. */
function bin(value: number): number {
  return Number(value.toFixed(1));
}

/**
 * The panel renders station cells with 3 decimals while Tubero printed 1, so the
 * contract is "the rendered value sits inside the Tubero display bin", i.e. at
 * most half a bin away. Re-binning the rendered string instead would introduce a
 * double rounding: Radio arco 184.1499999 renders as 184.15, whose own 1 decimal
 * rounding is 184.2 while the source double rounds to the 184.1 Tubero printed.
 * The half-bin test is the one that matches reality and still keeps the three
 * documented source defects outside the bin.
 */
const HALF_BIN_MM = 0.05 + 1e-9;

/**
 * Raw Tubero row index feeding a physical PIPINGBOX station. Proved in
 * U5-PREFLIGHT-R3 section I: Tubero evaluates Picaje Y, Longitud arco and Radio
 * arco with the opposite station phase.
 */
function mirroredRow(station: number, divisions: number): number {
  return (divisions - station) % divisions;
}

function inputOf(dataset: ReferenceDataset): ElbowOnPipeInput {
  const datum: ElbowOnPipeDatum = dataset.datum === 'FE'
    ? { type: 'FE', fe: dataset.feMm as number }
    : { type: dataset.datum };
  return {
    elbowInnerDiameterMm: dataset.elbowInnerDiameterMm,
    elbowOuterDiameterMm: dataset.elbowOuterDiameterMm,
    elbowCentrelineRadiusMm: dataset.elbowCentrelineRadiusMm,
    receiverOuterDiameterMm: dataset.receiverOuterDiameterMm,
    divisions: dataset.divisions,
    datum,
  };
}

const anomalyKey = (id: string, field: string, punto: number): string => `${id}|${field}|${punto}`;
const anomalySet = new Set(REFERENCE_ANOMALIES.map(item =>
  anomalyKey(item.id, item.field, item.punto)));

const displays = new Map<string, ElbowOnPipeDisplay>();

// ---------------------------------------------------------------------------
// 1. Every rendered cell against the Tubero corpus
// ---------------------------------------------------------------------------
for (const dataset of REFERENCE_DATASETS) {
  const result = computeElbowOnPipe(inputOf(dataset));
  check(`${dataset.id}: kernel valid`, result.valid, JSON.stringify(result.errors));
  if (!result.valid) continue;

  const display = projectElbowOnPipe(result, { yPrimeMm: dataset.yPrimeMm });
  check(`${dataset.id}: projection produced`, display !== null);
  if (!display) continue;
  displays.set(dataset.id, display);

  const divisions = dataset.divisions;
  check(`${dataset.id}: ${divisions + 1} rendered rows`, display.rows.length === divisions + 1,
    `got ${display.rows.length}`);

  /* Cota X' and Div as shown in the summary. */
  if (dataset.cotaXMm !== null) {
    const shown = display.summary.find(entry => entry.key === 'cotaX');
    check(`${dataset.id}: summary has Cota X'`, shown !== undefined);
    if (shown) {
      check(`${dataset.id}: Cota X' display = ${dataset.cotaXMm}`,
        Math.abs(Number(shown.value) - dataset.cotaXMm) <= HALF_BIN_MM, `rendered ${shown.value}`);
    }
  }
  const divEntry = display.summary.find(entry => entry.key === 'div');
  check(`${dataset.id}: summary has Div`, divEntry !== undefined);
  if (divEntry) {
    check(`${dataset.id}: Div display = ${dataset.divMm}`,
      Math.abs(Number(divEntry.value) - dataset.divMm) <= HALF_BIN_MM, `rendered ${divEntry.value}`);
  }

  const columns: Array<{
    field: 'picajeX' | 'picajeY' | 'arcLength' | 'arcRadius';
    shown: number[];
    rendered: (row: ElbowOnPipeDisplay['rows'][number]) => string;
    mirrored: boolean;
  }> = [
    { field: 'picajeX', shown: dataset.picajeX, rendered: row => row.picajeX, mirrored: false },
    { field: 'picajeY', shown: dataset.picajeY, rendered: row => row.picajeY, mirrored: true },
    { field: 'arcLength', shown: dataset.arcLength, rendered: row => row.arcLength, mirrored: true },
    { field: 'arcRadius', shown: dataset.arcRadius, rendered: row => row.arcRadius, mirrored: true },
  ];

  for (const column of columns) {
    for (let station = 0; station < divisions; station++) {
      const sourceRow = column.mirrored ? mirroredRow(station, divisions) : station;
      const shown = column.shown[sourceRow];
      const rendered = Number(column.rendered(display.rows[station]));
      const punto = sourceRow + 1;
      const name = `${dataset.id} ${column.field} row ${punto} -> station ${station}`;
      const distance = Math.abs(rendered - shown);
      if (anomalySet.has(anomalyKey(dataset.id, column.field, punto))) {
        /* A documented source defect must STAY a source defect. If one of these
           ever lands inside the bin it means the kernel moved, not that Tubero
           was right, and U5.1 has to be re-audited before shipping UI on top. */
        check(`${name}: documented source defect stays outside the display bin`,
          distance > HALF_BIN_MM, `rendered ${rendered} vs shown ${shown}, distance ${distance}`);
      } else {
        check(`${name}: inside the Tubero display bin`, distance <= HALF_BIN_MM,
          `rendered ${rendered} vs shown ${shown}, distance ${distance.toFixed(6)}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Physical station order, labels and closure
// ---------------------------------------------------------------------------
for (const dataset of REFERENCE_DATASETS) {
  const display = displays.get(dataset.id);
  if (!display) continue;
  const divisions = dataset.divisions;

  for (let index = 0; index < divisions; index++) {
    const row = display.rows[index];
    check(`${dataset.id}: row ${index} index is physical`, row.index === index, `got ${row.index}`);
    check(`${dataset.id}: row ${index} label P${index + 1}`, row.label === `P${index + 1}`,
      `got ${row.label}`);
    check(`${dataset.id}: row ${index} is not the closure`, row.isClosure === false);
  }

  const closure = display.rows[divisions];
  const first = display.rows[0];
  check(`${dataset.id}: station ${divisions} flagged as closure`, closure.isClosure === true);
  check(`${dataset.id}: closure label repeats P1`, closure.label === 'P1', `got ${closure.label}`);
  for (const field of
    ['picajeX', 'picajeY', 'arcRadius', 'arcLength', 'bendAngleDeg', 'clamped'] as const) {
    check(`${dataset.id}: closure ${field} equals station 0`, closure[field] === first[field],
      `${String(closure[field])} vs ${String(first[field])}`);
  }
  check(`${dataset.id}: closure angle completes the revolution`,
    bin(Number(closure.angleDeg)) === 360, `got ${closure.angleDeg}`);
}

// ---------------------------------------------------------------------------
// 3. The 90 degree clamp is always visible, never silently absorbed
// ---------------------------------------------------------------------------
for (const dataset of REFERENCE_DATASETS) {
  const display = displays.get(dataset.id);
  if (!display) continue;
  let flagged = 0;
  for (const row of display.rows) {
    const atEndFace = Number(row.bendAngleDeg) >= 90;
    check(`${dataset.id} station ${row.index}: clamp flag matches a 90 deg bend angle`,
      atEndFace === row.clamped, `t=${row.bendAngleDeg} clamped=${row.clamped}`);
    if (!row.isClosure && row.clamped) flagged++;
  }
  check(`${dataset.id}: clampedCount counts physical stations only`,
    display.clampedCount === flagged, `${display.clampedCount} vs ${flagged}`);
}

/* The BOP, TOP and FE captures all show a 114.3 plateau, so at least one of them
   must surface a clamp. A silent zero here would mean the UI hides a real cut. */
const plateauCases = ['REF-02', 'REF-03', 'REF-04', 'REF-07', 'REF-08'];
for (const id of plateauCases) {
  const display = displays.get(id);
  check(`${id}: plateau is reported as clamped`, (display?.clampedCount ?? 0) > 0,
    `clampedCount ${display?.clampedCount}`);
}
/* Even the symmetric axis case reaches the end face once: REF-01 prints Picaje Y
   = 114.3 = R at station 12, the intrados point where the cut runs out to the
   full 90 degrees. The UI must flag it instead of presenting it as a free cut. */
check('REF-01: the axis case clamps exactly at the intrados station',
  displays.get('REF-01')?.clampedCount === 1,
  `clampedCount ${displays.get('REF-01')?.clampedCount}`);
check('REF-01: the clamped station is station 12',
  displays.get('REF-01')?.rows.filter(row => !row.isClosure && row.clamped)
    .map(row => row.index).join(',') === '12',
  displays.get('REF-01')?.rows.filter(row => row.clamped).map(row => row.index).join(','));

// ---------------------------------------------------------------------------
// 4. Cota Y' is external: it cannot move a single kernel driven cell
// ---------------------------------------------------------------------------
const KERNEL_SUMMARY_KEYS = ['cotaX', 'seatingHeight', 'div', 'circumference'] as const;

for (const dataset of REFERENCE_DATASETS) {
  const result = computeElbowOnPipe(inputOf(dataset));
  if (!result.valid) continue;

  const without = projectElbowOnPipe(result, { yPrimeMm: null });
  const withY = projectElbowOnPipe(result, { yPrimeMm: 100 });
  check(`${dataset.id}: both projections produced`, without !== null && withY !== null);
  if (!without || !withY) continue;

  check(`${dataset.id}: Y' does not change the rows`,
    JSON.stringify(without.rows) === JSON.stringify(withY.rows));
  check(`${dataset.id}: Y' does not change the clamp count`,
    without.clampedCount === withY.clampedCount);

  const kernelOf = (display: ElbowOnPipeDisplay): string => JSON.stringify(
    display.summary.filter(entry =>
      (KERNEL_SUMMARY_KEYS as readonly string[]).includes(entry.key)));
  check(`${dataset.id}: Y' does not change the kernel summary`,
    kernelOf(without) === kernelOf(withY), `${kernelOf(without)} vs ${kernelOf(withY)}`);

  check(`${dataset.id}: Y' absent means no Cota Y' entry`,
    without.summary.every(entry => entry.key !== 'cotaY'));
  const yEntry = withY.summary.find(entry => entry.key === 'cotaY');
  check(`${dataset.id}: Y' present adds exactly one external entry`,
    yEntry !== undefined && yEntry.external === true && yEntry.value === '100');
  check(`${dataset.id}: Y' adds one entry and removes none`,
    withY.summary.length === without.summary.length + 1);
  check(`${dataset.id}: no kernel entry is ever flagged external`,
    without.summary.every(entry => !entry.external));
  check(`${dataset.id}: Cota Y' is appended last`,
    withY.summary[withY.summary.length - 1]?.key === 'cotaY');
}

/* The controlled pair transcribed from the captures: same geometry, Y' = 100 on
   REF-08 only, every printed cell identical. */
const ref07 = computeElbowOnPipe(inputOf(REFERENCE_DATASETS.find(d => d.id === 'REF-07')!));
const ref08 = computeElbowOnPipe(inputOf(REFERENCE_DATASETS.find(d => d.id === 'REF-08')!));
check('REF-07/REF-08: both valid', ref07.valid && ref08.valid);
const p07 = projectElbowOnPipe(ref07, { yPrimeMm: null });
const p08 = projectElbowOnPipe(ref08, { yPrimeMm: 100 });
check('REF-07/REF-08: identical rows', JSON.stringify(p07?.rows) === JSON.stringify(p08?.rows));
check('REF-07/REF-08: only difference is the external Cota Y\'',
  JSON.stringify(p08?.summary.filter(entry => !entry.external))
  === JSON.stringify(p07?.summary.filter(entry => !entry.external)));

/* A non finite Y' must be ignored rather than rendered as NaN. */
const guard = projectElbowOnPipe(ref07, { yPrimeMm: Number.NaN });
check("REF-07: a non finite Y' is dropped, never rendered",
  guard !== null && guard.summary.every(entry => entry.key !== 'cotaY'));

// ---------------------------------------------------------------------------
// 5. An invalid kernel result never yields partial numbers
// ---------------------------------------------------------------------------
const invalidCases: Array<{ name: string; input: ElbowOnPipeInput }> = [
  {
    name: 'elbow larger than the receiver',
    input: {
      elbowInnerDiameterMm: 77.92, elbowOuterDiameterMm: 88.9,
      elbowCentrelineRadiusMm: 114.3, receiverOuterDiameterMm: 60.3,
      divisions: 24, datum: { type: 'EJE' },
    },
  },
  {
    name: 'bend radius smaller than the elbow OD radius',
    input: {
      elbowInnerDiameterMm: 77.92, elbowOuterDiameterMm: 88.9,
      elbowCentrelineRadiusMm: 30, receiverOuterDiameterMm: 168.3,
      divisions: 24, datum: { type: 'EJE' },
    },
  },
  {
    name: 'non finite Fe',
    input: {
      elbowInnerDiameterMm: 77.92, elbowOuterDiameterMm: 88.9,
      elbowCentrelineRadiusMm: 114.3, receiverOuterDiameterMm: 168.3,
      divisions: 24, datum: { type: 'FE', fe: Number.NaN },
    },
  },
  {
    name: 'divisions out of contract',
    input: {
      elbowInnerDiameterMm: 77.92, elbowOuterDiameterMm: 88.9,
      elbowCentrelineRadiusMm: 114.3, receiverOuterDiameterMm: 168.3,
      divisions: 0, datum: { type: 'EJE' },
    },
  },
];

for (const invalid of invalidCases) {
  const result = computeElbowOnPipe(invalid.input);
  check(`invalid (${invalid.name}): kernel rejects`, !result.valid);
  check(`invalid (${invalid.name}): kernel reports a code`, result.errors.length > 0);
  check(`invalid (${invalid.name}): projection is null`,
    projectElbowOnPipe(result, { yPrimeMm: 100 }) === null);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
console.log('PB-BRANCH-INJERTO-EXPANSION-001 — U5.2a display contract');
console.log(`datasets: ${REFERENCE_DATASETS.length}`);
console.log(`checks passed: ${passed}`);
console.log(`checks failed: ${failures.length}`);
if (failures.length > 0) {
  console.log('\nFAILURES');
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
console.log('\nU5.2a DISPLAY CONTRACT PASS');
