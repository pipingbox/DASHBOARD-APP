import { computeEqualTubeElbowJoint, type EqualTubeElbowInput,
  type EqualTubeElbowSuccess, type EqualTubeElbowErrorCode,
} from '../app/frontend/src/tools/branch/equalTubeElbowGeometry.ts';
import { EQUAL_TUBE_ELBOW_REFERENCES, EQUAL_TUBE_ELBOW_REFERENCE_VALUE_COUNT,
  EQUAL_TUBE_ELBOW_HOLDOUT_IDS, type EqualTubeElbowReference,
} from './fixtures/equal-tube-elbow-reference.ts';

let passed = 0;
const failures: string[] = [];
function check(label: string, condition: boolean, detail = ''): void {
  if (condition) passed++;
  else failures.push(`${label}${detail ? ': ' + detail : ''}`);
}
function near(actual: number, expected: number, tolerance = 1e-9): boolean {
  return Math.abs(actual - expected) <= tolerance;
}
function valid(input: EqualTubeElbowInput): EqualTubeElbowSuccess {
  const result = computeEqualTubeElbowJoint(input);
  if (!result.valid) throw new Error(`unexpected invalid geometry: ${JSON.stringify(result.errors)} for ${JSON.stringify(input)}`);
  return result;
}
function rejected(input: EqualTubeElbowInput, code: EqualTubeElbowErrorCode): void {
  const result = computeEqualTubeElbowJoint(input);
  check(`${code} ${JSON.stringify(input)}`, !result.valid && result.errors[0]?.code === code
    && result.stations.length === 0, JSON.stringify(result));
}
const base: EqualTubeElbowInput = {
  lengthMm: 300, innerDiameterMm: 77.92, outerDiameterMm: 88.9,
  elbowCenterlineRadiusMm: 114.3, divisions: 24,
};

interface Cell {
  ref: string;
  role: string;
  field: 'Cota tubo' | 'Longitud arco' | 'Radio arco' | 'Div';
  point: string;
  shown: number;
  predicted: number;
  residual: number;
}
const cells: Cell[] = [];
function record(ref: EqualTubeElbowReference, field: Cell['field'], point: string,
  shown: number, predicted: number): void {
  const residual = Math.abs(predicted - shown);
  cells.push({ ref: ref.id, role: ref.role, field, point, shown, predicted, residual });
  check(`${ref.id} ${field} ${point}: source display 0.1 mm`, residual <= 0.050000001,
    `${predicted.toFixed(6)} vs ${shown}; residual=${residual.toFixed(6)}`);
}
function summary(label: string, selected: Cell[]): void {
  const matches = selected.filter(cell => cell.residual <= 0.050000001).length;
  const worst = selected.reduce((left, right) => right.residual > left.residual ? right : left);
  const rms = Math.sqrt(selected.reduce((sum, cell) => sum + cell.residual ** 2, 0) / selected.length);
  console.log(`${label}: ${matches}/${selected.length}, max=${worst.residual.toFixed(4)} mm `
    + `(${worst.ref} ${worst.field} ${worst.point}), RMS=${rms.toFixed(4)} mm`);
  check(`${label}: no unexplained residual over 0.15 mm`, worst.residual <= 0.15);
}
for (const reference of EQUAL_TUBE_ELBOW_REFERENCES) {
  const result = valid(reference);
  check(`${reference.id} literal rows`, reference.tubeCutPositionsMm.length === reference.divisions
    && reference.elbowArcLengthsMm.length === reference.divisions
    && reference.elbowArcRadiiMm.length === reference.divisions);
  check(`${reference.id} N physical + closure`, result.stations.length === reference.divisions + 1);
  record(reference, 'Div', '-', reference.divMm, result.stationSpacingMm);
  for (let index = 0; index < reference.divisions; index++) {
    const station = result.stations[index];
    check(`${reference.id} P${index + 1}: physical station`, !station.isClosure && station.index === index);
    record(reference, 'Cota tubo', `P${index + 1}`, reference.tubeCutPositionsMm[index], station.tubeCutPositionMm);
    record(reference, 'Longitud arco', `P${index + 1}`, reference.elbowArcLengthsMm[index], station.elbowArcLengthMm);
    record(reference, 'Radio arco', `P${index + 1}`, reference.elbowArcRadiiMm[index], station.elbowArcRadiusMm);
  }
}
console.log('Genuine Tubero 2.0 source display: 0.1 mm (literal fixture, no fitted coefficients)');
for (const field of ['Cota tubo', 'Longitud arco', 'Radio arco', 'Div'] as const) {
  summary(field, cells.filter(cell => cell.field === field));
}
for (const reference of EQUAL_TUBE_ELBOW_REFERENCES) {
  summary(`${reference.id} ${reference.role}`, cells.filter(cell => cell.ref === reference.id));
}
summary('combined holdout', cells.filter(cell => EQUAL_TUBE_ELBOW_HOLDOUT_IDS.includes(cell.ref)));
summary('TOTAL', cells);
check('183 literal source values', cells.length === EQUAL_TUBE_ELBOW_REFERENCE_VALUE_COUNT);
check('73 derivation and 110 holdout', cells.filter(cell => cell.role === 'DERIVATION').length === 73
  && cells.filter(cell => cell.role !== 'DERIVATION').length === 110);

const baseline = valid(base);
const copiedInput = { ...base };
const first = computeEqualTubeElbowJoint(copiedInput);
const second = computeEqualTubeElbowJoint(copiedInput);
check('deterministic output', JSON.stringify(first) === JSON.stringify(second));
check('input immutability', JSON.stringify(copiedInput) === JSON.stringify(base));
check('P1 theta 0', baseline.stations[0].angleRad === 0);
check('global circumference', near(baseline.circumferenceMm, Math.PI * base.outerDiameterMm));
check('Div and circumference', near(baseline.stationSpacingMm * base.divisions, baseline.circumferenceMm));
check('maximum cutback', near(baseline.maxCutbackMm,
  2 * Math.sqrt(base.elbowCenterlineRadiusMm * base.innerDiameterMm / 2)));

function closure(result: EqualTubeElbowSuccess): void {
  const firstStation = result.stations[0];
  const last = result.stations[result.divisions];
  check(`N${result.divisions} closure flag and index`, last.isClosure && last.index === result.divisions);
  check(`N${result.divisions} closure theta / position`, last.angleRad === 2 * Math.PI
    && last.circumferentialPositionMm === result.circumferenceMm);
  for (const key of ['tubeCutPositionMm', 'elbowBendAngleRad', 'elbowArcRadiusMm',
    'elbowArcLengthMm', 'clampedAtElbowEnd'] as const) {
    check(`N${result.divisions} closure duplicate ${key}`, last[key] === firstStation[key]);
  }
}
closure(baseline);
for (const [divisions, anchors] of [
  [24, [6, 12, 18]], [12, [3, 6, 9]],
] as const) {
  const result = valid({ ...base, divisions });
  for (const [index, angle] of anchors.map((index, place) => [index, (place + 1) * Math.PI / 2] as const)) {
    check(`N${divisions} P${index + 1} angle`, near(result.stations[index].angleRad, angle));
  }
  check(`N${divisions} clamp count`, result.stations.slice(0, divisions)
    .filter(station => station.clampedAtElbowEnd).length === divisions / 2 + 1);
  closure(result);
}
for (const divisions of [5, 7, 23]) {
  const result = valid({ ...base, divisions });
  check(`odd N${divisions} station count`, result.stations.length === divisions + 1);
  check(`odd N${divisions} half-plane classification`, result.stations.slice(0, divisions)
    .every(station => station.clampedAtElbowEnd === !(station.index > 0 && 2 * station.index < divisions)));
  check(`odd N${divisions} clamp count`, result.stations.slice(0, divisions)
    .filter(station => station.clampedAtElbowEnd).length === Math.floor(divisions / 2) + 1);
  check(`odd N${divisions} finite positive geometry`, result.stations.every(station =>
    [station.angleRad, station.circumferentialPositionMm, station.tubeCutPositionMm,
      station.elbowBendAngleRad, station.elbowArcRadiusMm, station.elbowArcLengthMm]
      .every(Number.isFinite) && station.elbowArcRadiusMm > 0));
  closure(result);
}
for (const station of baseline.stations.slice(0, baseline.divisions)) {
  const index = station.index;
  const intersects = index > 0 && 2 * index < baseline.divisions;
  const sine = Math.sin(station.angleRad);
  check(`P${index + 1} integer half-plane`, station.clampedAtElbowEnd === !intersects);
  check(`P${index + 1} OD arc radius`, near(station.elbowArcRadiusMm,
    base.elbowCenterlineRadiusMm + base.outerDiameterMm / 2 * sine));
  check(`P${index + 1} OD arc length`, near(station.elbowArcLengthMm,
    station.elbowArcRadiusMm * station.elbowBendAngleRad));
  check(`P${index + 1} OD pitch`, near(station.circumferentialPositionMm,
    index * Math.PI * base.outerDiameterMm / base.divisions));
  if (intersects) {
    const mIn = base.elbowCenterlineRadiusMm + base.innerDiameterMm / 2 * sine;
    check(`P${index + 1} tube ID and sqrt cutback agree`, near(station.tubeCutPositionMm,
      base.lengthMm - mIn * Math.cos(station.elbowBendAngleRad), 1e-9));
    check(`P${index + 1} physically intersecting angle`, station.elbowBendAngleRad < Math.PI / 2);
  } else {
    check(`P${index + 1} finite elbow end / uncut tube`,
      station.elbowBendAngleRad === Math.PI / 2 && station.tubeCutPositionMm === base.lengthMm);
  }
  check(`P${index + 1} finite fields`, [station.angleRad, station.circumferentialPositionMm,
    station.tubeCutPositionMm, station.elbowBendAngleRad, station.elbowArcRadiusMm,
    station.elbowArcLengthMm].every(Number.isFinite));
}
check('OD / ID separation on P7', near(baseline.stations[6].elbowArcRadiusMm, 158.75)
  && near(baseline.stations[6].tubeCutPositionMm, 166.5364768935, 1e-7)
  && !near(baseline.stations[6].elbowArcRadiusMm, 153.26));
const radiusHoldout = valid({ ...base, elbowCenterlineRadiusMm: 228.6 });
check('R variation changes contour and arc', radiusHoldout.stations[6].tubeCutPositionMm
  !== baseline.stations[6].tubeCutPositionMm && radiusHoldout.stations[6].elbowArcLengthMm
  !== baseline.stations[6].elbowArcLengthMm);
const shifted = valid({ ...base, lengthMm: 500 });
for (let index = 0; index <= base.divisions; index++) {
  const original = baseline.stations[index];
  const later = shifted.stations[index];
  check(`L+200 station ${index} cut only`, near(later.tubeCutPositionMm - original.tubeCutPositionMm, 200)
    && later.elbowArcRadiusMm === original.elbowArcRadiusMm
    && later.elbowArcLengthMm === original.elbowArcLengthMm);
}
const decimated = valid({ ...base, lengthMm: 500, divisions: 12 });
for (let index = 0; index < 12; index++) {
  const fine = baseline.stations[2 * index];
  const coarse = decimated.stations[index];
  check(`N12 decimation P${index + 1} -> N24 P${2 * index + 1}`,
    near(coarse.tubeCutPositionMm - fine.tubeCutPositionMm, 200)
    && near(coarse.elbowArcRadiusMm, fine.elbowArcRadiusMm)
    && near(coarse.elbowArcLengthMm, fine.elbowArcLengthMm, 1e-9));
}
for (let index = 1; index < 6; index++) {
  check(`cut symmetry P${index + 1} / P${13 - index}`,
    near(baseline.stations[index].tubeCutPositionMm,
      baseline.stations[12 - index].tubeCutPositionMm));
}
check('P1 and P13 elbow radius is R', baseline.stations[0].elbowArcRadiusMm === base.elbowCenterlineRadiusMm
  && near(baseline.stations[12].elbowArcRadiusMm, base.elbowCenterlineRadiusMm));

const extreme = valid({ lengthMm: 2000, innerDiameterMm: 999, outerDiameterMm: 1000,
  elbowCenterlineRadiusMm: 1000, divisions: 24 });
const atPi = extreme.stations[12];
const rawSineAtPi = Math.sin(Math.PI);
const rawQAtPi = (1000 - 999 / 2 * rawSineAtPi) / (1000 + 999 / 2 * rawSineAtPi);
check('theta pi extreme would fool q-only classification', rawQAtPi < 1);
check('theta pi extreme stays clamped with exact L', atPi.clampedAtElbowEnd
  && atPi.tubeCutPositionMm === 2000 && atPi.elbowBendAngleRad === Math.PI / 2);

for (const field of ['lengthMm', 'innerDiameterMm', 'outerDiameterMm',
  'elbowCenterlineRadiusMm', 'divisions'] as const) {
  for (const value of [NaN, Infinity, -Infinity]) rejected({ ...base, [field]: value }, 'NON_FINITE_INPUT');
}
rejected({ ...base, lengthMm: 0 }, 'INVALID_LENGTH');
rejected({ ...base, lengthMm: -1 }, 'INVALID_LENGTH');
for (const [innerDiameterMm, outerDiameterMm] of [[0, 88.9], [-1, 88.9], [88.9, 88.9], [90, 88.9], [77.92, 0]]) {
  rejected({ ...base, innerDiameterMm, outerDiameterMm }, 'INVALID_DIAMETERS');
}
for (const elbowCenterlineRadiusMm of [0, 44.45, -1]) {
  rejected({ ...base, elbowCenterlineRadiusMm }, 'ELBOW_RADIUS_TOO_SMALL');
}
valid({ ...base, elbowCenterlineRadiusMm: 44.45000001 });
for (const divisions of [3, 25, 4.5]) rejected({ ...base, divisions }, 'DIVISIONS_OUT_OF_RANGE');
for (const divisions of [4, 24]) check(`N${divisions} accepted`, valid({ ...base, divisions }).stations.length === divisions + 1);
const maxCutbackMm = baseline.maxCutbackMm;
const equalBoundary = valid({ ...base, lengthMm: maxCutbackMm });
check('L=maxCutback accepted / deepest station zero', equalBoundary.stations[6].tubeCutPositionMm === 0);
const nearBoundary = valid({ ...base, lengthMm: maxCutbackMm - 1e-13 });
check('roundoff at L=maxCutback normalized to zero', nearBoundary.stations[6].tubeCutPositionMm === 0);
rejected({ ...base, lengthMm: maxCutbackMm - 0.01 }, 'TUBE_TOO_SHORT');
rejected({ ...base, lengthMm: 1 }, 'TUBE_TOO_SHORT');
rejected({ ...base, outerDiameterMm: Number.MAX_VALUE, elbowCenterlineRadiusMm: Number.MAX_VALUE,
  lengthMm: Number.MAX_VALUE }, 'NON_FINITE_RESULT');

console.log(`${passed} PASS / ${failures.length} FAIL`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
}
