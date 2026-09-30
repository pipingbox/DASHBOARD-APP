/* ───────────────────────────────────────────────────────────────────────────
   U3 — tubo→codo SCREEN PREVIEW traceability suite.

   These tests prove that every plotted point in the generated SVG originates
   from the U1 kernel (branchOnElbowGeometry.ts) and that the only thing the
   renderer does is apply a documented affine mm → px transform.

   Screenshots are review evidence; THIS suite is authoritative.
   ─────────────────────────────────────────────────────────────────────────── */

import { computeBranchOnElbow, type BranchOnElbowDatum, type BranchOnElbowInput } from '../app/frontend/src/tools/branch/branchOnElbowGeometry.ts';
import { buildBranchOnElbowDevelopment } from '../app/frontend/src/tools/branch/branchOnElbowDevelopmentSvg.ts';
import { buildBranchOnElbowPicaje } from '../app/frontend/src/tools/branch/branchOnElbowPicajeSvg.ts';
import { buildBranchOnElbowSchematic } from '../app/frontend/src/tools/branch/branchOnElbowSchematicSvg.ts';

/* Reference UI case — 3" Sch 40 branch into a 6" elbow, R = 228.60, N = 24. */
const BASE: BranchOnElbowInput = {
  elbowCentrelineRadiusMm: 228.60, elbowOuterDiameterMm: 168.30,
  branchInnerDiameterMm: 77.92, branchOuterDiameterMm: 88.90,
  axisHeightMm: 150, referenceLengthMm: 200, divisions: 24,
  datum: { type: 'EJE' },
};
const DEV_LABELS = {
  title: 'Injerto', arcAxis: 'Arc', injertoAxis: 'Injerto', minLabel: 'min', maxLabel: 'max',
  closureLabel: '360°', screenPreviewNote: 'screen preview',
};
const PICAJE_LABELS = {
  title: 'Picaje', originLabel: 'Omega', xAxis: 'X', yAxis: 'Y', cotaX: "X'", cotaY: "Y'",
  datum: 'EJE', closesOn: 'closes on P1', screenPreviewNote: 'screen preview',
};
const SCHEMATIC_LABELS = {
  title: 'Geometry', elevation: 'Elevation', section: 'Section', branch: 'Branch', elbow: 'Elbow',
  referencePlane: 'x = R', datumOffset: 'Offset e', screenPreviewNote: 'screen preview', notToScale: 'not to scale',
};

let passed = 0;
const failures: string[] = [];
function check(name: string, condition: boolean, detail = ''): void {
  if (condition) passed += 1;
  else failures.push(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Read every occurrence of an attribute set from the rendered SVG string. */
function readMarkers(svg: string, pattern: RegExp): Record<string, string>[] {
  const found: Record<string, string>[] = [];
  for (const match of svg.matchAll(pattern)) {
    const entry: Record<string, string> = {};
    for (const attribute of match[0].matchAll(/([a-z-]+)="([^"]*)"/g)) entry[attribute[1]] = attribute[2];
    found.push(entry);
  }
  return found;
}

const DATUMS: { tag: string; datum: BranchOnElbowDatum }[] = [
  { tag: 'EJE', datum: { type: 'EJE' } },
  { tag: 'BOP', datum: { type: 'BOP' } },
  { tag: 'TOP', datum: { type: 'TOP' } },
  { tag: 'FE+20', datum: { type: 'FE', fe: 20 } },
  { tag: 'FE-20', datum: { type: 'FE', fe: -20 } },
];

const picajeByDatum = new Map<string, { x: number[]; y: number[]; cotaX: number }>();
let tracedPoints = 0;

for (const { tag, datum } of DATUMS) {
  const result = computeBranchOnElbow({ ...BASE, datum });
  check(`${tag}: U1 result valid`, result.valid, JSON.stringify(result.errors));

  /* ── A. INJERTO development ───────────────────────────────────────────── */
  const development = buildBranchOnElbowDevelopment(result, DEV_LABELS);
  check(`${tag}: development built`, development !== null);
  if (!development) continue;
  const devMarkers = readMarkers(development.svg, /<circle[^>]*data-station="\d+"[^>]*\/>/g);
  const physical = devMarkers.filter(marker => marker['data-station-kind'] === 'physical');
  const closure = devMarkers.filter(marker => marker['data-station-kind'] === 'closure');
  check(`${tag}: 24 physical + 1 closure marker`, physical.length === 24 && closure.length === 1,
    `${physical.length}/${closure.length}`);
  check(`${tag}: station guide lines for every station`,
    readMarkers(development.svg, /<line[^>]*data-station-line="\d+"[^>]*\/>/g).length === 25);
  check(`${tag}: curve is drawn from U1 stations`, development.svg.includes('data-cut-curve="u1-stations"'));

  /* Every plotted ordinate must BE the U1 ordinate, and its screen position
     must be the exact affine image of that value (no geometric distortion). */
  let devExact = true;
  let devAffine = true;
  for (const marker of devMarkers) {
    const index = Number(marker['data-station']);
    const station = result.stations[index];
    if (Number.parseFloat(marker['data-arc-mm']) !== station.arcPosition) devExact = false;
    if (Number.parseFloat(marker['data-injerto-mm']) !== station.cutOrdinate) devExact = false;
    const expectedCx = development.scaleX.map(station.arcPosition);
    const expectedCy = development.scaleY.map(station.cutOrdinate);
    if (Math.abs(Number(marker.cx) - expectedCx) > 0.01) devAffine = false;
    if (Math.abs(Number(marker.cy) - expectedCy) > 0.01) devAffine = false;
    tracedPoints += 1;
  }
  check(`${tag}: development values are verbatim U1`, devExact);
  check(`${tag}: development points are the affine image of U1`, devAffine);
  check(`${tag}: development ordinate range equals U1 range`,
    development.minInjertoMm === Math.min(...result.stations.map(s => s.cutOrdinate)) &&
    development.maxInjertoMm === Math.max(...result.stations.map(s => s.cutOrdinate)));
  /* The closure repeats P1, so the polyline closes in ordinate. */
  check(`${tag}: closure repeats P1 ordinate`,
    result.stations[24].cutOrdinate === result.stations[0].cutOrdinate &&
    Number.parseFloat(closure[0]['data-injerto-mm']) === result.stations[0].cutOrdinate);
  check(`${tag}: closure sits at the developed circumference`,
    Number.parseFloat(closure[0]['data-arc-mm']) === result.developedCircumference);

  /* ── B. PICAJE marking ────────────────────────────────────────────────── */
  const picaje = buildBranchOnElbowPicaje(result, PICAJE_LABELS);
  check(`${tag}: picaje built`, picaje !== null);
  if (!picaje) continue;
  const picajeMarkers = readMarkers(picaje.svg, /<circle[^>]*data-station="\d+"[^>]*\/>/g);
  check(`${tag}: 24 picaje markers, no duplicated closure point`, picajeMarkers.length === 24);
  check(`${tag}: contour is a closed polygon on the U1 stations`,
    picaje.svg.includes('data-picaje-contour="u1-stations"') &&
    picaje.svg.includes('data-contour-points="24"') && picaje.svg.includes('data-closes-on="0"'));
  let picajeExact = true;
  let picajeUniform = true;
  for (const marker of picajeMarkers) {
    const index = Number(marker['data-station']);
    const station = result.stations[index];
    if (Number.parseFloat(marker['data-picaje-x-mm']) !== station.picajeX) picajeExact = false;
    if (Number.parseFloat(marker['data-picaje-y-mm']) !== station.picajeY) picajeExact = false;
    /* One single uniform scale on both axes → true shape preserved. */
    if (Math.abs(Number(marker.cx) - (picaje.origin.x + station.picajeX * picaje.scale)) > 0.01) picajeUniform = false;
    if (Math.abs(Number(marker.cy) - (picaje.origin.y - station.picajeY * picaje.scale)) > 0.01) picajeUniform = false;
    tracedPoints += 1;
  }
  check(`${tag}: picaje coordinates are verbatim U1`, picajeExact);
  check(`${tag}: picaje uses one uniform undistorted scale`, picajeUniform);
  check(`${tag}: picaje carries U1 Cota X'/Y' and datum offset`,
    picaje.svg.includes(`data-cota-x-mm="${result.cotaX === 0 ? 0 : result.cotaX}"`) &&
    picaje.svg.includes(`data-cota-y-mm="${result.cotaY}"`) &&
    picaje.svg.includes(`data-datum-offset-mm="${result.datumOffsetMm === 0 ? 0 : result.datumOffsetMm}"`));
  picajeByDatum.set(tag, {
    x: picajeMarkers.map(marker => Number.parseFloat(marker['data-picaje-x-mm'])),
    y: picajeMarkers.map(marker => Number.parseFloat(marker['data-picaje-y-mm'])),
    cotaX: result.cotaX,
  });

  /* ── C. Schematic ─────────────────────────────────────────────────────── */
  const schematic = buildBranchOnElbowSchematic({
    elbowCentrelineRadiusMm: BASE.elbowCentrelineRadiusMm, elbowOuterDiameterMm: BASE.elbowOuterDiameterMm,
    branchOuterDiameterMm: BASE.branchOuterDiameterMm, axisHeightMm: BASE.axisHeightMm,
    referenceLengthMm: BASE.referenceLengthMm, datumOffsetMm: result.datumOffsetMm, datumName: tag,
  }, SCHEMATIC_LABELS);
  check(`${tag}: schematic built`, schematic !== null);
  check(`${tag}: schematic reflects inputs and the U1 datum offset`, schematic !== null &&
    schematic.svg.includes(`data-datum-offset-mm="${result.datumOffsetMm === 0 ? 0 : result.datumOffsetMm}"`) &&
    schematic.svg.includes('data-r-mm="228.6"') && schematic.svg.includes('data-d-mm="168.3"') &&
    schematic.svg.includes('data-a-mm="150"') && schematic.svg.includes('data-l-mm="200"'));

  /* ── Responsive contract: viewBox, width:100%, never a fixed px width ── */
  for (const [name, svg] of [['development', development.svg], ['picaje', picaje.svg], ['schematic', schematic?.svg ?? '']] as const) {
    check(`${tag}: ${name} is responsive`, svg.includes('viewBox="0 0 ') && svg.includes('width:100%')
      && svg.includes('preserveAspectRatio="xMidYMid meet"') && !/<svg[^>]*\swidth="\d/.test(svg));
    check(`${tag}: ${name} is flagged as a screen preview`, svg.includes('data-screen-preview="true"'));
  }
}

/* ── Datum visualization must actually change the picaje drawing ────────── */
const eje = picajeByDatum.get('EJE')!;
const bop = picajeByDatum.get('BOP')!;
const top = picajeByDatum.get('TOP')!;
const fePlus = picajeByDatum.get('FE+20')!;
const feMinus = picajeByDatum.get('FE-20')!;
const sorted = (values: number[]) => [...values].map(value => value + 0).sort((a, b) => a - b);
const sameSet = (a: number[], b: number[]) => sorted(a).every((value, index) => Math.abs(value - sorted(b)[index]) < 1e-9);

check('EJE differs from BOP', !sameSet(eje.x, bop.x) || !sameSet(eje.y, bop.y));
check('EJE differs from TOP', !sameSet(eje.x, top.x) || !sameSet(eje.y, top.y));
check('BOP differs from TOP', !sameSet(bop.x, top.x));
check('TOP mirrors BOP around the elbow', sameSet(top.x, bop.x.map(value => -value)) && sameSet(top.y, bop.y));
check('FE+20 mirrors FE-20 around the elbow', sameSet(fePlus.x, feMinus.x.map(value => -value)) && sameSet(fePlus.y, feMinus.y));
check('+Fe is toward TOP, -Fe toward BOP', fePlus.cotaX > 0 && feMinus.cotaX < 0 && top.cotaX > 0 && bop.cotaX < 0
  && Math.abs(fePlus.cotaX + feMinus.cotaX) < 1e-9);
check('EJE is the centred datum', eje.cotaX === 0);
check('FE+20 stays between EJE and TOP', fePlus.cotaX > eje.cotaX && fePlus.cotaX < top.cotaX);

/* ── Invalid geometry must never render a misleading development ────────── */
const invalidCases: [string, Partial<BranchOnElbowInput>][] = [
  ['offset beyond the elbow surface', { datum: { type: 'FE', fe: 85 } }],
  ['impossible a/R combination', { axisHeightMm: 400 }],
  ['invalid R', { elbowCentrelineRadiusMm: -1 }],
  ['invalid N', { divisions: 3 }],
  ['NaN Fe', { datum: { type: 'FE', fe: Number.NaN } }],
];
for (const [name, changed] of invalidCases) {
  const result = computeBranchOnElbow({ ...BASE, ...changed });
  check(`invalid (${name}): U1 rejects`, !result.valid);
  check(`invalid (${name}): no development rendered`, buildBranchOnElbowDevelopment(result, DEV_LABELS) === null);
  check(`invalid (${name}): no picaje rendered`, buildBranchOnElbowPicaje(result, PICAJE_LABELS) === null);
}
check('schematic rejects non-finite input', buildBranchOnElbowSchematic({
  elbowCentrelineRadiusMm: 228.6, elbowOuterDiameterMm: 168.3, branchOuterDiameterMm: 88.9,
  axisHeightMm: Number.NaN, referenceLengthMm: 200, datumOffsetMm: 0, datumName: 'EJE',
}, SCHEMATIC_LABELS) === null);
check('schematic rejects non-positive radius', buildBranchOnElbowSchematic({
  elbowCentrelineRadiusMm: 0, elbowOuterDiameterMm: 168.3, branchOuterDiameterMm: 88.9,
  axisHeightMm: 150, referenceLengthMm: 200, datumOffsetMm: 0, datumName: 'EJE',
}, SCHEMATIC_LABELS) === null);

/* ── Label thinning must never drop geometry points ─────────────────────── */
const dense = computeBranchOnElbow({ ...BASE, divisions: 48 });
const denseDevelopment = buildBranchOnElbowDevelopment(dense, DEV_LABELS)!;
const denseMarkers = readMarkers(denseDevelopment.svg, /<circle[^>]*data-station="\d+"[^>]*\/>/g);
const denseLabels = [...denseDevelopment.svg.matchAll(/>P\d+</g)].length;
check('N=48 keeps every geometry point', denseMarkers.length === 49);
check('N=48 thins text labels only', denseLabels > 0 && denseLabels <= 12, `${denseLabels} labels`);

/* ── SVG output must not inject unescaped markup ────────────────────────── */
const hostile = buildBranchOnElbowDevelopment(computeBranchOnElbow(BASE), {
  ...DEV_LABELS, title: '<script>alert(1)</script>',
})!;
check('text content is XML-escaped', !hostile.svg.includes('<script>') && hostile.svg.includes('&lt;script&gt;'));

console.log(`Traced plotted points against U1: ${tracedPoints}`);
console.log(`${passed} PASS / ${failures.length} FAIL`);
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
}
