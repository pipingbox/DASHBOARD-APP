import { computeBranchOnElbow, type BranchOnElbowDatum, type BranchOnElbowInput } from '../app/frontend/src/tools/branch/branchOnElbowGeometry.ts';
import { computeBranchIntersection } from '../app/frontend/src/tools/branch/branchIntersectionGeometry.ts';

const BASE: BranchOnElbowInput = {
  elbowCentrelineRadiusMm: 114.30, elbowOuterDiameterMm: 168.30,
  branchInnerDiameterMm: 77.92, branchOuterDiameterMm: 88.90,
  axisHeightMm: 150, referenceLengthMm: 200, divisions: 24,
  datum: { type: 'EJE' }, branchCutReferenceRadiusMm: 77.92 / 2,
};
interface ReferenceSeries {
  name: string;
  radius: number;
  datum: BranchOnElbowDatum;
  cotaX: number;
  cotaY: number;
  x?: number[];
  y: number[];
  injerto?: number[];
}
const REFERENCE: ReferenceSeries[] = [
  {
    name: 'EJE R=114.30', radius: 114.30, datum: { type: 'EJE' }, cotaX: 0, cotaY: 141.7,
    x: [0,-10.1,-19.7,-28.1,-34.7,-39.0,-40.5,-39.0,-34.7,-28.1,-19.7,-10.1,0,10.1,19.7,28.1,34.7,39.0,40.5,39.0,34.7,28.1,19.7,10.1],
    y: [80.0,77.4,69.8,58.4,44.1,28.2,11.4,-5.1,-20.4,-33.5,-43.7,-50.0,-52.2,-50.0,-43.7,-33.5,-20.4,-5.1,11.4,28.2,44.1,58.4,69.8,77.4],
    injerto: [253.7,251.6,245.6,236.6,225.4,212.8,199.5,186.4,174.3,164.1,156.3,151.5,149.8,151.5,156.3,164.1,174.3,186.4,199.5,212.8,225.4,236.6,245.6,251.6],
  },
  {
    name: 'EJE R=228.60', radius: 228.60, datum: { type: 'EJE' }, cotaX: 0, cotaY: 334.8,
    y: [46.5,45.2,41.3,35.1,26.7,16.6,5.3,-6.6,-18.1,-28.2,-36.1,-41.2,-42.9,-41.2,-36.1,-28.2,-18.1,-6.6,5.3,16.6,26.7,35.1,41.3,45.2],
    injerto: [179.4,179.1,178.3,176.8,174.2,170.3,165.1,158.9,152.2,145.9,140.7,137.4,136.2,137.4,140.7,145.9,152.2,158.9,165.1,170.3,174.2,176.8,178.3,179.1],
  },
  {
    name: 'BOP R=228.60', radius: 228.60, datum: { type: 'BOP' }, cotaX: -41.3, cotaY: 318.7,
    x: [0,-11.1,-20.9,-29.1,-35.4,-39.3,-40.6,-39.3,-35.4,-29.1,-20.9,-11.1,0,11.9,24.3,36.6,47.9,56.7,60.3,56.7,47.9,36.6,24.3,11.9],
    y: [47.1,42.5,35.8,27.3,17.1,6.0,-5.6,-17.0,-27.3,-35.8,-41.6,-44.3,-43.2,-38.4,-29.8,-17.9,-3.5,11.9,26.1,36.6,43.5,47.7,49.7,49.5],
    injerto: [192.0,185.1,178.6,172.2,166.0,160.0,154.2,148.9,144.6,141.8,140.9,142.5,146.9,154.3,164.6,177.7,192.6,207.3,218.1,221.5,218.8,213.1,206.3,199.1],
  },
  {
    name: 'TOP R=228.60', radius: 228.60, datum: { type: 'TOP' }, cotaX: 41.3, cotaY: 318.7,
    x: [0,-11.9,-24.3,-36.6,-47.9,-56.7,-60.3,-56.7,-47.9,-36.6,-24.3,-11.9,0,11.1,20.9,29.1,35.4,39.3,40.6,39.3,35.4,29.1,20.9,11.1],
    y: [47.1,49.5,49.7,47.7,43.5,36.6,26.1,11.9,-3.5,-17.9,-29.8,-38.4,-43.2,-44.3,-41.6,-35.8,-27.3,-17.0,-5.6,6.0,17.1,27.3,35.8,42.5],
  },
  {
    name: 'FE=20 R=228.60', radius: 228.60, datum: { type: 'FE', fe: 20 }, cotaX: 20.2, cotaY: 330.9,
    x: [0,-10.6,-20.9,-30.3,-38.1,-43.3,-45.1,-43.3,-38.1,-30.3,-20.9,-10.6,0,10.3,19.7,27.8,34.0,38.0,39.3,38.0,34.0,27.8,19.7,10.3],
    y: [46.6,46.9,44.6,39.9,32.7,23.3,12.1,-0.2,-12.7,-24.2,-33.5,-39.9,-43.0,-42.5,-38.7,-31.8,-22.5,-11.7,-0.1,11.3,22.0,31.2,38.6,43.8],
  },
];
let passed = 0;
const failures: string[] = [];
function check(name: string, condition: boolean, detail = ''): void {
  if (condition) passed++;
  else failures.push(`${name}${detail ? ': ' + detail : ''}`);
}
let referenceCount = 0;
let maximumResidual = 0;
let maximumSeries = '';
for (const series of REFERENCE) {
  const result = computeBranchOnElbow({ ...BASE, elbowCentrelineRadiusMm: series.radius, datum: series.datum });
  check(`${series.name}: valid`, result.valid, JSON.stringify(result.errors));
  if (!result.valid) continue;
  const offset = series.datum.type === 'FE' ? series.datum.fe
    : series.datum.type === 'EJE' ? 0
    : (series.datum.type === 'BOP' ? -1 : 1) * (168.30 - 88.90) / 2;
  check(`${series.name}: datum offset`, Math.abs(result.datumOffsetMm - offset) < 1e-12);
  check(`${series.name}: cotaX full precision`, Math.abs(result.cotaX - 84.15 * Math.asin(offset / 84.15)) < 1e-10);
  check(`${series.name}: cotaX displayed`, Math.abs(result.cotaX - series.cotaX) <= 0.051);
  check(`${series.name}: cotaY displayed`, Math.abs(result.cotaY - series.cotaY) <= 0.051);
  check(`${series.name}: closure`, result.stations.length === 25 &&
    Math.abs(result.stations[24].cutOrdinate - result.stations[0].cutOrdinate) < 1e-9 &&
    Math.abs(result.stations[24].picajeX - result.stations[0].picajeX) < 1e-9 &&
    Math.abs(result.stations[24].picajeY - result.stations[0].picajeY) < 1e-9);
  check(`${series.name}: pitch`, result.stationCount === 25 && result.angularStepDeg === 15 &&
    Math.abs(result.stationSpacing - Math.PI * 88.90 / 24) < 1e-10 &&
    Math.abs(result.developedCircumference - Math.PI * 88.90) < 1e-10 &&
    result.stations.every((station, index) => station.index === index &&
      Math.abs(station.thetaDeg - index * 15) < 1e-10 &&
      Math.abs(station.arcPosition - index * result.stationSpacing) < 1e-10));
  for (const [label, values, actual] of [
    ['picajeX', series.x, result.stations.map(station => station.picajeX)],
    ['picajeY', series.y, result.stations.map(station => station.picajeY)],
    ['injerto', series.injerto, result.stations.map(station => station.cutOrdinate)],
  ] as const) {
    if (!values) continue;
    check(`${series.name}: 24 ${label} entries`, values.length === 24);
    for (let index = 0; index < values.length; index++) {
      const residual = Math.abs(actual[index] - values[index]);
      referenceCount++;
      if (residual > maximumResidual) { maximumResidual = residual; maximumSeries = `${series.name} ${label} station ${index + 1}`; }
      check(`${series.name} ${label} station ${index + 1}`, residual <= 0.15, `residual=${residual.toFixed(6)} mm`);
    }
  }
}
check('exactly 288 independent reference ordinates', referenceCount === 288, `got ${referenceCount}`);
check('preflight residual <= 0.0501 mm', maximumResidual <= 0.0501, `got ${maximumResidual.toFixed(6)} mm at ${maximumSeries}`);
const defaultResult = computeBranchOnElbow({ ...BASE, branchCutReferenceRadiusMm: undefined });
const alternativeResult = computeBranchOnElbow(BASE);
const changedHole = computeBranchOnElbow({ ...BASE, holeReferenceRadiusMm: 88.90 / 2 });
const changedDevelopment = computeBranchOnElbow({ ...BASE, developmentRadiusMm: 77.92 / 2 });
check('SET-ON OD default differs from ID cut', defaultResult.valid && alternativeResult.valid &&
  Math.abs(defaultResult.stations[6].cutOrdinate - alternativeResult.stations[6].cutOrdinate) > 1);
check('cut radius does not change picaje', defaultResult.valid && alternativeResult.valid &&
  defaultResult.stations.every((station, index) => Math.abs(station.picajeX - alternativeResult.stations[index].picajeX) < 1e-12 &&
    Math.abs(station.picajeY - alternativeResult.stations[index].picajeY) < 1e-12));
check('hole radius does not change cut', changedHole.valid && alternativeResult.valid &&
  changedHole.stations.every((station, index) => Math.abs(station.cutOrdinate - alternativeResult.stations[index].cutOrdinate) < 1e-12));
check('development radius changes only spacing', changedDevelopment.valid && alternativeResult.valid &&
  changedDevelopment.stationSpacing !== alternativeResult.stationSpacing &&
  changedDevelopment.stations.every((station, index) =>
    Math.abs(station.cutOrdinate - alternativeResult.stations[index].cutOrdinate) < 1e-12 &&
    Math.abs(station.picajeX - alternativeResult.stations[index].picajeX) < 1e-12 &&
    Math.abs(station.picajeY - alternativeResult.stations[index].picajeY) < 1e-12));
let previous = Infinity;
console.log('R→∞ vs current computeBranchIntersection @ β=90° (mm):');
console.log('R         reference      max ΔX       max ΔY       max Δcut');
for (const elbowRadius of [1e6, 1e8, 1e10]) {
  for (const [label, cutRadius] of [['ID', 77.92 / 2], ['OD/SET-ON', 88.90 / 2]] as const) {
    const curved = computeBranchOnElbow({ ...BASE, elbowCentrelineRadiusMm: elbowRadius, branchCutReferenceRadiusMm: cutRadius });
    const straight = computeBranchIntersection({
      headerOuterRadius: 168.30 / 2, branchOuterDiameter: 88.90, branchInnerDiameter: 77.92,
      branchCutReferenceRadius: cutRadius, headerHoleReferenceRadius: 77.92 / 2,
      developmentRadius: 88.90 / 2, betaDeg: 90, divisions: 24, referenceLength: 200,
    });
    check(`R=${elbowRadius} ${label}: both valid`, curved.valid && straight.valid,
      JSON.stringify({ curved: curved.errors, straight: straight.errors }));
    if (!curved.valid || !straight.valid) continue;
    let maxX = 0;
    let maxY = 0;
    let maxCut = 0;
    for (let index = 0; index <= 24; index++) {
      maxX = Math.max(maxX, Math.abs(curved.stations[index].picajeX - straight.stations[index].picajeX));
      maxY = Math.max(maxY, Math.abs(curved.stations[index].picajeY - straight.stations[index].picajeY));
      maxCut = Math.max(maxCut, Math.abs(curved.stations[index].cutOrdinate - straight.stations[index].markFromEnd!));
    }
    console.log(`${elbowRadius.toExponential(0).padEnd(10)}${label.padEnd(15)}${maxX.toExponential(3).padEnd(13)}${maxY.toExponential(3).padEnd(13)}${maxCut.toExponential(3)}`);
    if (elbowRadius === 1e8) check(`R=1e8 ${label}: < 1e-3 mm`, maxX < 1e-3 && maxY < 1e-3 && maxCut < 1e-3);
    if (label === 'OD/SET-ON') {
      if (elbowRadius > 1e6) check(`R=${elbowRadius}: O(1/R) convergence`, Math.max(maxX, maxY, maxCut) < previous / 50);
      previous = Math.max(maxX, maxY, maxCut);
    }
  }
}
const invalidCases: [string, Partial<BranchOnElbowInput>, string][] = [
  ['FE beyond rho', { datum: { type: 'FE', fe: 85 } }, 'OFFSET_OUT_OF_RANGE'],
  ['BOP beyond rho', { elbowOuterDiameterMm: 20, axisHeightMm: 0, datum: { type: 'BOP' } }, 'OFFSET_OUT_OF_RANGE'],
  ['hole outside torus', { datum: { type: 'FE', fe: 50 }, axisHeightMm: 100 }, 'ASIN_OUT_OF_RANGE'],
  ['cut outside torus', { branchCutReferenceRadiusMm: 90, axisHeightMm: 100 }, 'ASIN_OUT_OF_RANGE'],
  ['axis cannot intersect', { axisHeightMm: 250 }, 'NO_INTERSECTION'],
  ['cut cannot intersect', { axisHeightMm: 190 }, 'NO_INTERSECTION'],
  ['negative elbow radius', { elbowCentrelineRadiusMm: -1 }, 'NON_POSITIVE_DIMENSION'],
  ['zero outer diameter', { elbowOuterDiameterMm: 0 }, 'NON_POSITIVE_DIMENSION'],
  ['zero reference radius', { holeReferenceRadiusMm: 0 }, 'NON_POSITIVE_DIMENSION'],
  ['inner exceeds outer', { branchInnerDiameterMm: 90 }, 'INNER_EXCEEDS_OUTER'],
  ['invalid N', { divisions: 2 }, 'INVALID_DIVISIONS'],
  ['fractional N', { divisions: 5.5 }, 'INVALID_DIVISIONS'],
  ['infinite N', { divisions: Infinity }, 'INVALID_DIVISIONS'],
  ['NaN FE', { datum: { type: 'FE', fe: NaN } }, 'NON_FINITE_INPUT'],
  ['infinite FE', { datum: { type: 'FE', fe: Infinity } }, 'NON_FINITE_INPUT'],
  ['NaN R', { elbowCentrelineRadiusMm: NaN }, 'NON_FINITE_INPUT'],
  ['infinite L', { referenceLengthMm: Infinity }, 'NON_FINITE_INPUT'],
  ['NaN a', { axisHeightMm: NaN }, 'NON_FINITE_INPUT'],
  ['infinite reference radius', { branchCutReferenceRadiusMm: Infinity }, 'NON_FINITE_INPUT'],
  ['invalid datum', { datum: { type: 'UNKNOWN' } as unknown as BranchOnElbowDatum }, 'INVALID_DATUM'],
];
for (const [name, changed, expectedCode] of invalidCases) {
  const input = { ...BASE, ...changed };
  const first = computeBranchOnElbow(input);
  const second = computeBranchOnElbow(input);
  check(`${name}: deterministic ${expectedCode}`, !first.valid && first.errors[0]?.code === expectedCode &&
    JSON.stringify(first) === JSON.stringify(second) && first.stations.length === 0 &&
    [first.cotaX, first.cotaY, first.stationSpacing, first.datumOffsetMm].every(Number.isFinite),
    JSON.stringify(first.errors));
}
console.log(`Reference: ${referenceCount}/288 values, maximum residual ${maximumResidual.toFixed(6)} mm (${maximumSeries})`);
console.log(`Invalid geometry: ${invalidCases.length} cases`);
console.log(`${passed} PASS / ${failures.length} FAIL`);
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
}
