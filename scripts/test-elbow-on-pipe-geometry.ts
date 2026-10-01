/**
 * PB-BRANCH-INJERTO-EXPANSION-001 — U5.1
 * CODO → TUBO pure kernel numeric regression.
 *
 * Run: node --experimental-strip-types scripts/test-elbow-on-pipe-geometry.ts
 *
 * Every expected value comes from scripts/fixtures/elbow-on-pipe-reference.ts,
 * hand-transcribed from the genuine Tubero 2.0 captures. No expected value is
 * produced by the kernel under test.
 */
import {
  computeElbowOnPipe,
  type ElbowOnPipeDatum,
  type ElbowOnPipeInput,
  type ElbowOnPipeResult,
} from '../app/frontend/src/tools/branch/elbowOnPipeGeometry.ts';
import {
  DATUM_EXTENSION_IDS, DERIVATION_IDS, HOLDOUT_IDS, REFERENCE_ANOMALIES,
  REFERENCE_DATASETS, REFERENCE_VALUE_COUNT, type ReferenceDataset,
} from './fixtures/elbow-on-pipe-reference.ts';

let passed = 0;
const failures: string[] = [];
function check(name: string, condition: boolean, detail = ''): void {
  if (condition) passed++;
  else failures.push(`${name}${detail ? ': ' + detail : ''}`);
}

/**
 * Tubero display contract: one decimal of the stored binary double. toFixed is
 * used instead of Math.round(v * 10) / 10 because scaling by ten can push a
 * value such as 69.84999999999999 over the 69.85 bin edge.
 */
function display(value: number): number {
  return Number(value.toFixed(1));
}

/** Residual gate required by the ticket for every non-anomalous source value. */
const RESIDUAL_GATE_MM = 0.15;

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

/**
 * Raw Tubero row index feeding a physical PIPINGBOX station.
 * Picaje X is already in physical station order; Picaje Y, Longitud arco and
 * Radio arco are taken from the mirrored row, which is the exact transform
 * proved in U5-PREFLIGHT-R3 §I (Tubero evaluates those columns with the
 * opposite station phase, x = e - r_in*sin(psi)).
 */
function mirroredRow(station: number, divisions: number): number {
  return (divisions - station) % divisions;
}

type SetName = 'derivation' | 'datumExtension' | 'holdout';
function setOf(id: string): SetName {
  if (DERIVATION_IDS.includes(id)) return 'derivation';
  if (DATUM_EXTENSION_IDS.includes(id)) return 'datumExtension';
  return 'holdout';
}

interface Cell {
  id: string;
  field: string;
  /** Tubero row number, 1 based, as printed on the capture. */
  punto: number;
  station: number;
  shown: number;
  predicted: number;
  residual: number;
  matches: boolean;
  anomaly: boolean;
  set: SetName;
}

const cells: Cell[] = [];
const anomalyKey = (id: string, field: string, punto: number): string => `${id}|${field}|${punto}`;
const anomalyIndex = new Map(REFERENCE_ANOMALIES.map(item =>
  [anomalyKey(item.id, item.field, item.punto), item]));

function record(
  dataset: ReferenceDataset, field: string, punto: number, station: number,
  shown: number, predicted: number,
): void {
  const anomaly = anomalyIndex.get(anomalyKey(dataset.id, field, punto));
  if (anomaly) {
    check(`${dataset.id} ${field} P${punto}: anomaly shown value unchanged`, anomaly.shown === shown,
      `fixture ${shown} vs anomaly ${anomaly.shown}`);
  }
  cells.push({
    id: dataset.id, field, punto, station, shown, predicted,
    residual: Math.abs(predicted - shown), matches: display(predicted) === shown,
    anomaly: anomaly !== undefined, set: setOf(dataset.id),
  });
}

// ---------------------------------------------------------------------------
// 1. Reference regression over REF-01 … REF-08
// ---------------------------------------------------------------------------
const results = new Map<string, ElbowOnPipeResult>();
for (const dataset of REFERENCE_DATASETS) {
  const result = computeElbowOnPipe(inputOf(dataset));
  results.set(dataset.id, result);
  check(`${dataset.id}: valid`, result.valid, JSON.stringify(result.errors));
  if (!result.valid) continue;
  const divisions = dataset.divisions;
  check(`${dataset.id}: stations 0..N`, result.stations.length === divisions + 1 &&
    result.stationCount === divisions + 1 && result.divisions === divisions);
  check(`${dataset.id}: 24 transcribed rows per column`,
    dataset.picajeX.length === divisions && dataset.picajeY.length === divisions &&
    dataset.arcLength.length === divisions && dataset.arcRadius.length === divisions);
  if (dataset.cotaXMm !== null) {
    record(dataset, 'cotaX', 0, 0, dataset.cotaXMm, result.cotaXMm);
  }
  record(dataset, 'div', 0, 0, dataset.divMm, result.stationSpacingMm);
  for (let station = 0; station < divisions; station++) {
    const mirror = mirroredRow(station, divisions);
    const output = result.stations[station];
    record(dataset, 'picajeX', station + 1, station, dataset.picajeX[station], output.picajeXMm);
    record(dataset, 'picajeY', mirror + 1, station, dataset.picajeY[mirror], output.picajeYMm);
    record(dataset, 'arcLength', mirror + 1, station, dataset.arcLength[mirror], output.arcLengthMm);
    record(dataset, 'arcRadius', mirror + 1, station, dataset.arcRadius[mirror], output.arcRadiusMm);
  }
}

// ---------------------------------------------------------------------------
// 2. Fit quality per output type
// ---------------------------------------------------------------------------
const FIELDS = ['cotaX', 'picajeX', 'picajeY', 'arcLength', 'arcRadius', 'div'] as const;
interface Stats { n: number; hits: number; max: number; rms: number; worst: string }
function summarise(selected: Cell[]): Stats {
  let hits = 0;
  let max = 0;
  let squares = 0;
  let worst = '-';
  for (const cell of selected) {
    if (cell.matches) hits++;
    squares += cell.residual * cell.residual;
    if (cell.residual > max) {
      max = cell.residual;
      worst = `${cell.id}/P${cell.punto} pred=${cell.predicted.toFixed(3)} shown=${cell.shown}`;
    }
  }
  return {
    n: selected.length, hits, max,
    rms: selected.length ? Math.sqrt(squares / selected.length) : 0, worst,
  };
}

console.log('CODO→TUBO reference fit (display contract = 0.1 mm)');
console.log('field        N     display        max mm    RMS mm    worst');
for (const field of FIELDS) {
  const stats = summarise(cells.filter(cell => cell.field === field));
  console.log(`${field.padEnd(12)}${String(stats.n).padEnd(6)}`
    + `${`${stats.hits}/${stats.n}`.padEnd(15)}${stats.max.toFixed(4).padEnd(10)}`
    + `${stats.rms.toFixed(4).padEnd(10)}${stats.worst}`);
}
const all = summarise(cells);
const clean = summarise(cells.filter(cell => !cell.anomaly));
console.log(`raw source: ${all.hits}/${all.n} display matches `
  + `(${(100 * all.hits / all.n).toFixed(2)}%), max residual ${all.max.toFixed(4)} mm`);
console.log(`excluding ${REFERENCE_ANOMALIES.length} documented source anomalies: `
  + `${clean.hits}/${clean.n} display matches, max residual ${clean.max.toFixed(4)} mm, `
  + `RMS ${clean.rms.toFixed(4)} mm`);

check('782 transcribed source values', REFERENCE_VALUE_COUNT === 782, `got ${REFERENCE_VALUE_COUNT}`);
check('781 evaluable values (the Cota Y\' echo is not kernel geometry)', all.n === 781, `got ${all.n}`);
check('raw source display matches = 778/781', all.hits === 778, `got ${all.hits}`);
check('all non-anomalous values match the display contract', clean.hits === clean.n,
  cells.filter(cell => !cell.anomaly && !cell.matches)
    .map(cell => `${cell.id}/${cell.field}/P${cell.punto} pred=${cell.predicted.toFixed(4)} shown=${cell.shown}`).join(', '));
check('max unexplained residual <= 0.15 mm', clean.max <= RESIDUAL_GATE_MM, `got ${clean.max.toFixed(4)} mm`);
check('max unexplained residual <= 0.062 mm (R3 baseline)', clean.max <= 0.0621, `got ${clean.max.toFixed(4)} mm`);
for (const cell of cells.filter(item => !item.anomaly)) {
  check(`${cell.id} ${cell.field} P${cell.punto}`, cell.residual <= RESIDUAL_GATE_MM,
    `residual=${cell.residual.toFixed(6)} mm`);
}

// Source anomalies must stay classified as source defects, never as kernel passes.
const mismatched = cells.filter(cell => !cell.matches);
check('display mismatches are exactly the documented anomalies',
  mismatched.length === REFERENCE_ANOMALIES.length &&
  mismatched.every(cell => cell.anomaly),
  mismatched.map(cell => `${cell.id}/${cell.field}/P${cell.punto}`).join(', '));
for (const anomaly of REFERENCE_ANOMALIES) {
  const cell = cells.find(item => item.id === anomaly.id && item.field === anomaly.field
    && item.punto === anomaly.punto);
  check(`${anomaly.id} ${anomaly.field} P${anomaly.punto}: known source anomaly, not kernel failure`,
    cell !== undefined && !cell.matches);
  if (cell) {
    console.log(`anomaly ${anomaly.id}/${anomaly.field}/P${anomaly.punto}: shown ${cell.shown}, `
      + `kernel ${cell.predicted.toFixed(3)}, residual ${cell.residual.toFixed(3)} mm`);
  }
}

// Derivation / datum extension / holdout split, reported without refitting.
for (const [label, ids] of [
  ['derivation  ', DERIVATION_IDS], ['datum extend', DATUM_EXTENSION_IDS], ['holdout     ', HOLDOUT_IDS],
] as const) {
  const stats = summarise(cells.filter(cell => ids.includes(cell.id)));
  console.log(`${label}  ${ids.join(' ')}  ${stats.hits}/${stats.n} display, `
    + `max ${stats.max.toFixed(4)} mm, RMS ${stats.rms.toFixed(4)} mm`);
}
const derivation = summarise(cells.filter(cell => cell.set === 'derivation'));
const extension = summarise(cells.filter(cell => cell.set === 'datumExtension'));
const holdout = summarise(cells.filter(cell => cell.set === 'holdout'));
check('derivation REF-01 = 97/97', derivation.n === 97 && derivation.hits === 97,
  `${derivation.hits}/${derivation.n}`);
check('datum extension REF-02..04 = 293/294', extension.n === 294 && extension.hits === 293,
  `${extension.hits}/${extension.n}`);
check('holdout REF-05..08 = 388/390', holdout.n === 390 && holdout.hits === 388,
  `${holdout.hits}/${holdout.n}`);

// ---------------------------------------------------------------------------
// 3. Structural tests A … P
// ---------------------------------------------------------------------------
const BASE: ElbowOnPipeInput = {
  elbowInnerDiameterMm: 77.92, elbowOuterDiameterMm: 88.90,
  elbowCentrelineRadiusMm: 114.30, receiverOuterDiameterMm: 168.30,
  divisions: 24, datum: { type: 'EJE' },
};
const HALF_CLEARANCE = (168.30 - 88.90) / 2;
const RHO = 168.30 / 2;

// A..D: canonical datum offsets.
for (const [label, datum, expected] of [
  ['A EJE', { type: 'EJE' }, 0],
  ['B BOP', { type: 'BOP' }, HALF_CLEARANCE],
  ['C TOP', { type: 'TOP' }, -HALF_CLEARANCE],
  ['D FE +20', { type: 'FE', fe: 20 }, -20],
] as const) {
  const result = computeElbowOnPipe({ ...BASE, datum });
  check(`${label}: offset and Cota X'`, result.valid &&
    Math.abs(result.datumOffsetMm - expected) < 1e-12 &&
    Math.abs(result.cotaXMm - RHO * Math.asin(expected / RHO)) < 1e-12,
    JSON.stringify(result.errors));
  check(`${label}: seating height from tangency`, result.valid && Math.abs(result.seatingHeightMm -
    (Math.sqrt(RHO * RHO - expected * expected) + 114.30 - 77.92 / 2)) < 1e-12);
}

// E: continuity, e → 0 approaches EJE.
const eje = computeElbowOnPipe({ ...BASE, datum: { type: 'EJE' } });
const nearlyEje = computeElbowOnPipe({ ...BASE, datum: { type: 'FE', fe: 1e-9 } });
let continuity = 0;
for (let index = 0; index < eje.stations.length; index++) {
  continuity = Math.max(continuity,
    Math.abs(eje.stations[index].picajeXMm - nearlyEje.stations[index].picajeXMm),
    Math.abs(eje.stations[index].picajeYMm - nearlyEje.stations[index].picajeYMm),
    Math.abs(eje.stations[index].arcLengthMm - nearlyEje.stations[index].arcLengthMm));
}
check('E continuity: Fe → 0 converges to EJE', eje.valid && nearlyEje.valid && continuity < 1e-6,
  `max delta ${continuity.toExponential(2)} mm`);

// F: FE at the envelope boundaries reproduces BOP and TOP exactly.
for (const [label, fe, datum] of [
  ['F BOP boundary', -HALF_CLEARANCE, { type: 'BOP' }],
  ['F TOP boundary', HALF_CLEARANCE, { type: 'TOP' }],
] as const) {
  const viaFe = computeElbowOnPipe({ ...BASE, datum: { type: 'FE', fe } });
  const viaDatum = computeElbowOnPipe({ ...BASE, datum });
  check(`${label}: identical geometry`, viaFe.valid && viaDatum.valid &&
    Math.abs(viaFe.cotaXMm - viaDatum.cotaXMm) < 1e-12 &&
    viaFe.stations.every((station, index) =>
      Math.abs(station.picajeXMm - viaDatum.stations[index].picajeXMm) < 1e-12 &&
      Math.abs(station.picajeYMm - viaDatum.stations[index].picajeYMm) < 1e-12 &&
      Math.abs(station.arcLengthMm - viaDatum.stations[index].arcLengthMm) < 1e-12 &&
      station.clampedAtElbowEnd === viaDatum.stations[index].clampedAtElbowEnd));
}

// G: closure, station N repeats station 0.
for (const dataset of REFERENCE_DATASETS) {
  const result = results.get(dataset.id)!;
  if (!result.valid) continue;
  const first = result.stations[0];
  const last = result.stations[dataset.divisions];
  check(`G ${dataset.id}: station N closes station 0`,
    Math.abs(first.picajeXMm - last.picajeXMm) < 1e-9 &&
    Math.abs(first.picajeYMm - last.picajeYMm) < 1e-9 &&
    Math.abs(first.arcLengthMm - last.arcLengthMm) < 1e-9 &&
    Math.abs(first.arcRadiusMm - last.arcRadiusMm) < 1e-9 &&
    first.clampedAtElbowEnd === last.clampedAtElbowEnd &&
    Math.abs(last.angleDeg - 360) < 1e-12);
  check(`G ${dataset.id}: finite outputs`, result.stations.every(station =>
    [station.picajeXMm, station.picajeYMm, station.bendAngleRad, station.arcRadiusMm,
      station.arcLengthMm, station.sectionCoordinateMm].every(Number.isFinite)));
}

// H: BOP and TOP mirror under station reversal with X sign inversion.
const bop = computeElbowOnPipe({ ...BASE, datum: { type: 'BOP' } });
const top = computeElbowOnPipe({ ...BASE, datum: { type: 'TOP' } });
let mirrorDelta = 0;
for (let station = 0; station < 24; station++) {
  const mirror = mirroredRow(station, 24);
  mirrorDelta = Math.max(mirrorDelta,
    Math.abs(top.stations[mirror].picajeXMm + bop.stations[station].picajeXMm),
    Math.abs(top.stations[mirror].picajeYMm - bop.stations[station].picajeYMm),
    Math.abs(top.stations[mirror].arcLengthMm - bop.stations[station].arcLengthMm),
    Math.abs(top.stations[mirror].arcRadiusMm - bop.stations[station].arcRadiusMm));
}
check('H BOP/TOP mirror: X sign inverted, Y and arcs preserved under station reversal',
  bop.valid && top.valid && mirrorDelta < 1e-12 &&
  Math.abs(bop.cotaXMm + top.cotaXMm) < 1e-12, `max delta ${mirrorDelta.toExponential(2)} mm`);

// I: the finite-elbow plateau observed in the captures matches the kernel clamp.
for (const dataset of REFERENCE_DATASETS) {
  const result = results.get(dataset.id)!;
  if (!result.valid) continue;
  const observed: number[] = [];
  for (let station = 0; station < dataset.divisions; station++) {
    if (dataset.picajeY[mirroredRow(station, dataset.divisions)] === display(dataset.elbowCentrelineRadiusMm)) {
      observed.push(station);
    }
  }
  const modelled = result.stations.slice(0, dataset.divisions)
    .filter(station => station.clampedAtElbowEnd).map(station => station.index);
  check(`I ${dataset.id}: clamp stations match the captured plateau`,
    JSON.stringify(observed) === JSON.stringify(modelled),
    `observed ${JSON.stringify(observed)} vs model ${JSON.stringify(modelled)}`);
  check(`I ${dataset.id}: clamped stations sit on the 90 degree end face`,
    modelled.every(index => {
      const station = result.stations[index];
      return Math.abs(station.bendAngleRad - Math.PI / 2) < 1e-15 &&
        Math.abs(station.picajeYMm - dataset.elbowCentrelineRadiusMm) < 1e-12 &&
        Math.abs(station.arcLengthMm - station.arcRadiusMm * Math.PI / 2) < 1e-12;
    }));
  // J: every other station is strictly inside the finite elbow.
  check(`J ${dataset.id}: unclamped stations have t < 90 degrees`,
    result.stations.every(station => station.clampedAtElbowEnd ||
      (station.bendAngleRad >= 0 && station.bendAngleRad < Math.PI / 2 - 1e-12)));
  check(`J ${dataset.id}: arc length equals m_ex * t`, result.stations.every(station =>
    Math.abs(station.arcLengthMm - station.outerMeridionalRadiusMm * station.bendAngleRad) < 1e-12 &&
    Math.abs(station.arcRadiusMm - station.outerMeridionalRadiusMm) < 1e-15));
  check(`${dataset.id}: Div is OD based`, Math.abs(result.stationSpacingMm -
    Math.PI * dataset.elbowOuterDiameterMm / dataset.divisions) < 1e-12 &&
    Math.abs(result.circumferenceMm - Math.PI * dataset.elbowOuterDiameterMm) < 1e-12);
}

// K: R variation. REF-05 reaches exactly Y = R at the intrados station.
const ref05 = results.get('REF-05')!;
check('K REF-05 R=228.60: intrados station clamps at Y = R', ref05.valid &&
  ref05.stations[12].clampedAtElbowEnd && Math.abs(ref05.stations[12].picajeYMm - 228.60) < 1e-12);
check('K R scaling: seating height follows R', ref05.valid &&
  Math.abs(ref05.seatingHeightMm - (84.15 + 228.60 - 77.92 / 2)) < 1e-12);

// L: D variation. REF-07 falsifies the linear clearance alternative for Cota X'.
const ref07 = results.get('REF-07')!;
const linearAlternative = (219.10 - 88.90) / 2;
check('L REF-07 D=219.10: arc law gives 69.7, linear clearance 65.1 is falsified',
  ref07.valid && display(ref07.cotaXMm) === 69.7 &&
  Math.abs(ref07.cotaXMm - linearAlternative) > 4,
  `cotaX=${ref07.cotaXMm.toFixed(3)} linear=${linearAlternative.toFixed(3)}`);
const ref06 = results.get('REF-06')!;
check('L REF-06 D=228.60: wider receiver lowers the seating height', ref06.valid &&
  Math.abs(ref06.seatingHeightMm - (228.60 / 2 + 114.30 - 77.92 / 2)) < 1e-12);

// M: Y' is not a kernel input and cannot change any output.
const ref07Input = inputOf(REFERENCE_DATASETS.find(dataset => dataset.id === 'REF-07')!);
const ref08Input = inputOf(REFERENCE_DATASETS.find(dataset => dataset.id === 'REF-08')!);
const withYPrime = computeElbowOnPipe({ ...ref07Input, yPrimeMm: 100 } as unknown as ElbowOnPipeInput);
check('M Y\': REF-07 and REF-08 inputs are identical to the kernel',
  JSON.stringify(ref07Input) === JSON.stringify(ref08Input));
check('M Y\': an extra Y\' property cannot alter the result',
  JSON.stringify(withYPrime) === JSON.stringify(results.get('REF-07')));
check('M Y\': the result exposes no Y\' geometry',
  !Object.keys(results.get('REF-07')!).some(key => key.toLowerCase().includes('yprime')));

// Input immutability and determinism.
const frozen = Object.freeze({ ...BASE, datum: Object.freeze({ type: 'BOP' as const }) });
const snapshot = JSON.stringify(frozen);
const firstRun = computeElbowOnPipe(frozen);
const secondRun = computeElbowOnPipe(frozen);
check('pure: input not mutated', JSON.stringify(frozen) === snapshot);
check('pure: deterministic output', JSON.stringify(firstRun) === JSON.stringify(secondRun));

// N / O: explicit errors, no silent clamping.
const invalidCases: [string, Partial<ElbowOnPipeInput>, string][] = [
  ['N Fe beyond the BOP envelope', { datum: { type: 'FE', fe: -50 } }, 'OFFSET_OUT_OF_RANGE'],
  ['N Fe beyond the TOP envelope', { datum: { type: 'FE', fe: 50 } }, 'OFFSET_OUT_OF_RANGE'],
  ['O elbow wider than receiver', { receiverOuterDiameterMm: 80 }, 'ELBOW_EXCEEDS_RECEIVER'],
  ['O bend radius below the section radius', { elbowCentrelineRadiusMm: 44.45 }, 'ELBOW_RADIUS_TOO_SMALL'],
  ['O inner exceeds outer', { elbowInnerDiameterMm: 88.90 }, 'INNER_EXCEEDS_OUTER'],
  ['O negative bend radius', { elbowCentrelineRadiusMm: -1 }, 'NON_POSITIVE_DIMENSION'],
  ['O zero receiver diameter', { receiverOuterDiameterMm: 0 }, 'NON_POSITIVE_DIMENSION'],
  ['O invalid N', { divisions: 2 }, 'INVALID_DIVISIONS'],
  ['O fractional N', { divisions: 5.5 }, 'INVALID_DIVISIONS'],
  ['O infinite N', { divisions: Infinity }, 'INVALID_DIVISIONS'],
  ['O NaN Fe', { datum: { type: 'FE', fe: NaN } }, 'NON_FINITE_INPUT'],
  ['O NaN bend radius', { elbowCentrelineRadiusMm: NaN }, 'NON_FINITE_INPUT'],
  ['O infinite receiver', { receiverOuterDiameterMm: Infinity }, 'NON_FINITE_INPUT'],
  ['O unknown datum', { datum: { type: 'XX' } as unknown as ElbowOnPipeDatum }, 'INVALID_DATUM'],
];
for (const [name, changed, expectedCode] of invalidCases) {
  const input = { ...BASE, ...changed };
  const first = computeElbowOnPipe(input);
  const second = computeElbowOnPipe(input);
  check(`${name}: deterministic ${expectedCode}`,
    !first.valid && first.errors[0]?.code === expectedCode && first.stations.length === 0 &&
    JSON.stringify(first) === JSON.stringify(second) &&
    [first.cotaXMm, first.seatingHeightMm, first.stationSpacingMm, first.datumOffsetMm].every(Number.isFinite),
    JSON.stringify(first.errors));
}
// O: an elbow buried under its own seating plane must fail, not silently force t = 0.
const buried = computeElbowOnPipe({
  elbowInnerDiameterMm: 198, elbowOuterDiameterMm: 200, elbowCentrelineRadiusMm: 101,
  receiverOuterDiameterMm: 1000, divisions: 24, datum: { type: 'BOP' },
});
check('O elbow section below the receiver surface: NO_INTERSECTION',
  !buried.valid && buried.errors[0]?.code === 'NO_INTERSECTION', JSON.stringify(buried.errors));

// P: asin and sqrt boundaries stay stable at the extreme of the valid envelope.
const extreme = computeElbowOnPipe({
  elbowInnerDiameterMm: 199.9, elbowOuterDiameterMm: 200, elbowCentrelineRadiusMm: 300,
  receiverOuterDiameterMm: 1000, divisions: 720, datum: { type: 'BOP' },
});
check('P extreme envelope: valid, bounded and NaN free', extreme.valid &&
  extreme.stations.every(station =>
    Math.abs(station.sectionCoordinateMm) < 500 &&
    station.bendAngleRad >= 0 && station.bendAngleRad <= Math.PI / 2 + 1e-15 &&
    [station.picajeXMm, station.picajeYMm, station.arcLengthMm].every(Number.isFinite)),
  JSON.stringify(extreme.errors));
const tangent = computeElbowOnPipe({ ...BASE, datum: { type: 'FE', fe: -HALF_CLEARANCE } });
check('P tangency station is reported as the finite-elbow boundary', tangent.valid &&
  tangent.stations[12].clampedAtElbowEnd &&
  Math.abs(tangent.stations[12].picajeYMm - 114.30) < 1e-12);

// ---------------------------------------------------------------------------
// 4. Report
// ---------------------------------------------------------------------------
console.log(`Reference values: ${REFERENCE_VALUE_COUNT} transcribed, ${all.n} evaluable, `
  + `${all.hits} display matches, ${REFERENCE_ANOMALIES.length} documented source anomalies`);
console.log(`Invalid geometry: ${invalidCases.length + 2} cases`);
console.log(`${passed} PASS / ${failures.length} FAIL`);
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
}
