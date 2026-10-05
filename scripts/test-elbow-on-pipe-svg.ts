/* ───────────────────────────────────────────────────────────────────────────
   U5.3 — CODO→TUBO SCREEN PREVIEW traceability suite.

   These tests prove that every plotted point in the three generated SVGs
   originates from the U5.1 kernel (elbowOnPipeGeometry.ts) and that the only
   thing the renderers do is apply a documented mm → px transform.

   They also pin the four properties the unit was commissioned for:
     · station order is the kernel's physical order, never a Tubero row remap;
     · clamped stations are visually identifiable and sit exactly on the 90°
       end-face limit;
     · changing R or D changes the drawing, because the drawing is data driven;
     · changing Cota Y' changes nothing geometric.

   Screenshots are review evidence; THIS suite is authoritative.
   ─────────────────────────────────────────────────────────────────────────── */

import {
  computeElbowOnPipe,
  type ElbowOnPipeDatum,
  type ElbowOnPipeInput,
} from '../app/frontend/src/tools/branch/elbowOnPipeGeometry.ts';
import { buildElbowOnPipePicaje } from '../app/frontend/src/tools/branch/elbowOnPipePicajeSvg.ts';
import { buildElbowOnPipeMarking } from '../app/frontend/src/tools/branch/elbowOnPipeMarkingSvg.ts';
import { buildElbowOnPipeSchematic } from '../app/frontend/src/tools/branch/elbowOnPipeSchematicSvg.ts';

/* Verified reference case: elbow 3" Sch 40 on a 6" receiver, R = 114.30, N = 24. */
const BASE: ElbowOnPipeInput = {
  elbowInnerDiameterMm: 77.92,
  elbowOuterDiameterMm: 88.90,
  elbowCentrelineRadiusMm: 114.30,
  receiverOuterDiameterMm: 168.30,
  divisions: 24,
  datum: { type: 'EJE' },
};

const PICAJE_LABELS = {
  title: 'Picaje', originLabel: 'Omega', xAxis: 'X', yAxis: 'Y', cotaX: "X'", cotaY: "Y'",
  datum: 'EJE', closesOn: 'closes on P1', clampedLegend: 'on the 90 end face',
  screenPreviewNote: 'screen preview',
};
const MARKING_LABELS = {
  title: 'Elbow marking preview', note: 'no exact flat development', arcAxis: 'Arc',
  lengthAxis: 'Arc length', angleAxis: 't', limitLabel: '90 end face', closureLabel: '360',
  clampedLegend: 'on the 90 end face', screenPreviewNote: 'screen preview',
};
const SCHEMATIC_LABELS = {
  title: 'Geometry', elevation: 'Elevation', section: 'Receiver section', elbow: 'Elbow',
  receiver: 'Receiver', endFace: 'End face', legPlane: 'Picaje Y = 0', seating: 'yOmega',
  cotaX: "X'", cotaY: "Y'", datumOffset: 'Offset e',
  screenPreviewNote: 'screen preview', notToScale: 'not to scale',
};

let passed = 0;
const failures: string[] = [];
function check(name: string, condition: boolean, detail = ''): void {
  if (condition) passed += 1;
  else failures.push(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Read every occurrence of a tag carrying data-station from the SVG string. */
function readStations(svg: string): Record<string, string>[] {
  const found: Record<string, string>[] = [];
  for (const match of svg.matchAll(/<(?:circle|polygon)[^>]*data-station="\d+"[^>]*\/>/g)) {
    const entry: Record<string, string> = {};
    for (const attribute of match[0].matchAll(/([a-z-]+)="([^"]*)"/g)) entry[attribute[1]] = attribute[2];
    found.push(entry);
  }
  return found;
}

/** The 90° end-face limit of a kernel meridional radius. */
const endFaceLimit = (arcRadiusMm: number) => arcRadiusMm * Math.PI / 2;

const DATUMS: { tag: string; datum: ElbowOnPipeDatum }[] = [
  { tag: 'EJE', datum: { type: 'EJE' } },
  { tag: 'BOP', datum: { type: 'BOP' } },
  { tag: 'TOP', datum: { type: 'TOP' } },
  { tag: 'FE+20', datum: { type: 'FE', fe: 20 } },
  { tag: 'FE-20', datum: { type: 'FE', fe: -20 } },
];

interface Shape { x: number[]; y: number[]; cotaX: number; clamped: number[] }
const picajeByDatum = new Map<string, Shape>();
let tracedPoints = 0;

for (const { tag, datum } of DATUMS) {
  const result = computeElbowOnPipe({ ...BASE, datum });
  check(`${tag}: kernel result valid`, result.valid, JSON.stringify(result.errors));
  if (!result.valid) continue;

  /* ── A. PICAJE ON THE RECEIVER ─────────────────────────────────────────── */
  const picaje = buildElbowOnPipePicaje(result, PICAJE_LABELS);
  check(`${tag}: picaje built`, picaje !== null);
  if (!picaje) continue;
  const picajeStations = readStations(picaje.svg);
  check(`${tag}: 24 picaje points, closure never plotted twice`, picajeStations.length === 24,
    `${picajeStations.length}`);
  check(`${tag}: contour is a closed polygon on the kernel stations`,
    picaje.svg.includes('data-picaje-contour="kernel-stations"')
    && picaje.svg.includes('data-contour-points="24"')
    && picaje.svg.includes('data-closes-on="0"'));

  let picajeExact = true;
  let picajeUniform = true;
  let picajeOrdered = true;
  picajeStations.forEach((marker, position) => {
    const index = Number(marker['data-station']);
    /* Physical order: the k-th emitted point IS kernel station k. */
    if (index !== position) picajeOrdered = false;
    const station = result.stations[index];
    if (Number.parseFloat(marker['data-picaje-x-mm']) !== station.picajeXMm) picajeExact = false;
    if (Number.parseFloat(marker['data-picaje-y-mm']) !== station.picajeYMm) picajeExact = false;
    if (marker['data-clamped'] !== String(station.clampedAtElbowEnd)) picajeExact = false;
    /* One single uniform scale on both axes → the outline keeps its shape. */
    const cx = marker.cx === undefined ? NaN : Number(marker.cx);
    const expectedCx = picaje.origin.x + station.picajeXMm * picaje.scale;
    const expectedCy = picaje.origin.y - station.picajeYMm * picaje.scale;
    const actual = picaje.markers.find(entry => entry.index === index)!;
    if (Math.abs(actual.cx - expectedCx) > 1e-9 || Math.abs(actual.cy - expectedCy) > 1e-9) picajeUniform = false;
    /* Non-clamped stations are circles and expose cx/cy directly. */
    if (!station.clampedAtElbowEnd && Math.abs(cx - expectedCx) > 0.01) picajeUniform = false;
    tracedPoints += 1;
  });
  check(`${tag}: picaje coordinates are verbatim kernel values`, picajeExact);
  check(`${tag}: picaje uses one uniform undistorted scale`, picajeUniform);
  check(`${tag}: picaje keeps the kernel physical station order`, picajeOrdered);
  check(`${tag}: picaje carries the kernel globals`,
    picaje.svg.includes(`data-cota-x-mm="${result.cotaXMm === 0 ? 0 : result.cotaXMm}"`)
    && picaje.svg.includes(`data-seating-height-mm="${result.seatingHeightMm}"`)
    && picaje.svg.includes(`data-datum-offset-mm="${result.datumOffsetMm === 0 ? 0 : result.datumOffsetMm}"`));

  const clampedIndices = result.stations
    .slice(0, result.divisions)
    .filter(station => station.clampedAtElbowEnd)
    .map(station => station.index);
  check(`${tag}: picaje marks every clamped station as a diamond`,
    clampedIndices.every(index => {
      const marker = picajeStations.find(entry => Number(entry['data-station']) === index)!;
      return marker['data-clamped'] === 'true' && marker.points !== undefined && marker.cx === undefined;
    }) && picaje.svg.includes(`data-clamped-count="${clampedIndices.length}"`),
    `clamped ${clampedIndices.join(',')}`);

  picajeByDatum.set(tag, {
    x: picajeStations.map(marker => Number.parseFloat(marker['data-picaje-x-mm'])),
    y: picajeStations.map(marker => Number.parseFloat(marker['data-picaje-y-mm'])),
    cotaX: result.cotaXMm,
    clamped: clampedIndices,
  });

  /* ── B. ELBOW MARKING PREVIEW ──────────────────────────────────────────── */
  const marking = buildElbowOnPipeMarking(result, MARKING_LABELS);
  check(`${tag}: marking built`, marking !== null);
  if (!marking) continue;
  const markingStations = readStations(marking.svg);
  const physical = markingStations.filter(marker => marker['data-station-kind'] === 'physical');
  const closure = markingStations.filter(marker => marker['data-station-kind'] === 'closure');
  check(`${tag}: 24 physical + 1 closure marking point`, physical.length === 24 && closure.length === 1,
    `${physical.length}/${closure.length}`);
  check(`${tag}: a guide line for every kernel station`,
    [...marking.svg.matchAll(/data-station-line="\d+"/g)].length === 25);
  check(`${tag}: marking curve is drawn from the kernel stations`,
    marking.svg.includes('data-cut-curve="kernel-stations"'));
  check(`${tag}: marking never claims to be a flat development`,
    marking.svg.includes('data-flat-development="false"'));

  let markingExact = true;
  let markingAffine = true;
  let markingOrdered = true;
  markingStations.forEach((marker, position) => {
    const index = Number(marker['data-station']);
    if (index !== position) markingOrdered = false;
    const station = result.stations[index];
    if (Number.parseFloat(marker['data-arc-mm']) !== station.arcPositionMm) markingExact = false;
    if (Number.parseFloat(marker['data-arc-length-mm']) !== station.arcLengthMm) markingExact = false;
    if (Number.parseFloat(marker['data-arc-radius-mm']) !== station.arcRadiusMm) markingExact = false;
    if (Number.parseFloat(marker['data-bend-angle-deg']) !== station.bendAngleDeg) markingExact = false;
    if (marker['data-clamped'] !== String(station.clampedAtElbowEnd)) markingExact = false;
    if (!station.clampedAtElbowEnd) {
      const expectedX = marking.scaleArc.map(station.arcPositionMm);
      const expectedY = marking.scaleLength.map(station.arcLengthMm);
      if (Math.abs(Number(marker.cx) - expectedX) > 0.01) markingAffine = false;
      if (Math.abs(Number(marker.cy) - expectedY) > 0.01) markingAffine = false;
    }
    tracedPoints += 1;
  });
  check(`${tag}: marking values are verbatim kernel values`, markingExact);
  check(`${tag}: marking points are the affine image of the kernel`, markingAffine);
  check(`${tag}: marking keeps the kernel physical station order`, markingOrdered);
  /* The closure is station N: the same physical point as station 0, reached by
     ψ = 2π instead of ψ = 0, so the two agree to floating-point noise rather
     than bit for bit. What must be verbatim is the closure marker against the
     kernel station it represents, which the loop above already checked. */
  check(`${tag}: closure repeats station 0`,
    Math.abs(result.stations[24].arcLengthMm - result.stations[0].arcLengthMm) < 1e-9
    && Math.abs(result.stations[24].picajeXMm - result.stations[0].picajeXMm) < 1e-9
    && Math.abs(result.stations[24].picajeYMm - result.stations[0].picajeYMm) < 1e-9
    && Number.parseFloat(closure[0]['data-arc-length-mm']) === result.stations[24].arcLengthMm
    && Number.parseFloat(closure[0]['data-arc-mm']) === result.circumferenceMm,
    `station24 ${result.stations[24].arcLengthMm} vs station0 ${result.stations[0].arcLengthMm}`);
  check(`${tag}: marking exposes the 90° end-face reference`,
    marking.svg.includes('data-limit-curve="elbow-end-face"'));
  check(`${tag}: clamped stations sit exactly on the 90° limit`,
    clampedIndices.every(index => Math.abs(result.stations[index].arcLengthMm - endFaceLimit(result.stations[index].arcRadiusMm)) < 1e-9)
    && marking.clampedCount === clampedIndices.length,
    `${marking.clampedCount} vs ${clampedIndices.length}`);
  check(`${tag}: unclamped stations stay below the 90° limit`,
    result.stations.every(station => station.clampedAtElbowEnd
      || station.arcLengthMm < endFaceLimit(station.arcRadiusMm) - 1e-12));
  check(`${tag}: marking carries the kernel developed circumference`,
    marking.svg.includes(`data-circumference-mm="${result.circumferenceMm}"`)
    && marking.svg.includes(`data-station-spacing-mm="${result.stationSpacingMm}"`));

  /* ── C. SCHEMATIC ──────────────────────────────────────────────────────── */
  const schematic = buildElbowOnPipeSchematic({
    elbowCentrelineRadiusMm: BASE.elbowCentrelineRadiusMm,
    elbowOuterDiameterMm: BASE.elbowOuterDiameterMm,
    elbowInnerDiameterMm: BASE.elbowInnerDiameterMm,
    receiverOuterDiameterMm: BASE.receiverOuterDiameterMm,
    datumOffsetMm: result.datumOffsetMm,
    seatingHeightMm: result.seatingHeightMm,
    cotaXMm: result.cotaXMm,
    datumName: tag,
  }, SCHEMATIC_LABELS);
  check(`${tag}: schematic built`, schematic !== null);
  check(`${tag}: schematic reflects the inputs and the kernel globals`, schematic !== null
    && schematic.svg.includes(`data-datum-offset-mm="${result.datumOffsetMm === 0 ? 0 : result.datumOffsetMm}"`)
    && schematic.svg.includes(`data-seating-height-mm="${result.seatingHeightMm}"`)
    && schematic.svg.includes(`data-cota-x-mm="${result.cotaXMm === 0 ? 0 : result.cotaXMm}"`)
    && schematic.svg.includes('data-r-mm="114.3"') && schematic.svg.includes('data-d-mm="168.3"')
    && schematic.svg.includes('data-elbow-od-mm="88.9"') && schematic.svg.includes('data-elbow-id-mm="77.92"'));
  check(`${tag}: schematic shows the receiver, the elbow and the 90° end face`, schematic !== null
    && schematic.svg.includes('data-receiver-band="true"') && schematic.svg.includes('data-elbow-band="true"')
    && schematic.svg.includes('data-end-face="true"') && schematic.svg.includes('data-leg-plane="true"')
    && schematic.svg.includes('data-elbow-od="true"') && schematic.svg.includes('data-elbow-id="true"')
    && schematic.svg.includes('data-datum-line="true"'));
  check(`${tag}: schematic states it is not to scale`, schematic !== null && schematic.svg.includes('not to scale'));

  /* ── Responsive contract: viewBox, width:100%, never a fixed px width ── */
  for (const [name, svg] of [
    ['picaje', picaje.svg], ['marking', marking.svg], ['schematic', schematic?.svg ?? ''],
  ] as const) {
    check(`${tag}: ${name} is responsive`, svg.includes('viewBox="0 0 ')
      && svg.includes('width:100%') && svg.includes('preserveAspectRatio="xMidYMid meet"')
      && !/<svg[^>]*\swidth="\d/.test(svg));
    check(`${tag}: ${name} is flagged as a screen preview`, svg.includes('data-screen-preview="true"'));
    check(`${tag}: ${name} carries no page format, tiling or calibration marker`,
      !/data-(page-format|tile|calibration)/.test(svg));
  }
}

/* ── Datum must actually change the drawings ────────────────────────────── */
const eje = picajeByDatum.get('EJE')!;
const bop = picajeByDatum.get('BOP')!;
const top = picajeByDatum.get('TOP')!;
const fePlus = picajeByDatum.get('FE+20')!;
const feMinus = picajeByDatum.get('FE-20')!;
const same = (a: number[], b: number[]) => a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) < 1e-9);

check('EJE differs from BOP', !same(eje.x, bop.x) || !same(eje.y, bop.y));
check('EJE differs from TOP', !same(eje.x, top.x) || !same(eje.y, top.y));
check('BOP differs from TOP', !same(bop.x, top.x));
check('FE+20 differs from FE-20', !same(fePlus.x, feMinus.x));
check('EJE is the centred datum', eje.cotaX === 0);
/* This family: BOP toward +X (Cota X' > 0), TOP toward -X, +Fe toward TOP. */
check('BOP sits on the +X side, TOP on the -X side', bop.cotaX > 0 && top.cotaX < 0
  && Math.abs(bop.cotaX + top.cotaX) < 1e-9);
check('+Fe is measured toward TOP', fePlus.cotaX < 0 && feMinus.cotaX > 0
  && Math.abs(fePlus.cotaX + feMinus.cotaX) < 1e-9);
check('FE+20 stays between EJE and TOP', fePlus.cotaX < eje.cotaX && fePlus.cotaX > top.cotaX);
/* The clamp is a geometric fact of the case, not of the datum label. */
check('every datum reaches the 90° end face at the intrados', [eje, bop, top, fePlus, feMinus]
  .every(shape => shape.clamped.length >= 1 && shape.clamped.includes(12)),
  JSON.stringify([eje, bop, top, fePlus, feMinus].map(shape => shape.clamped)));

/* ── Station order is the kernel's, never a mirrored Tubero row order ────── */
const ordered = computeElbowOnPipe({ ...BASE, datum: { type: 'BOP' } });
const orderedPicaje = buildElbowOnPipePicaje(ordered, PICAJE_LABELS)!;
const forward = orderedPicaje.markers.map(marker => marker.picajeXMm);
const mirrored = ordered.stations
  .slice(0, ordered.divisions)
  .map(station => ordered.stations[(ordered.divisions - station.index) % ordered.divisions].picajeXMm);
check('an asymmetric datum makes the two row orders distinguishable', !same(forward, mirrored));
check('the plotted order is the kernel order, not the Tubero mirror', same(forward,
  ordered.stations.slice(0, ordered.divisions).map(station => station.picajeXMm)));

/* ── R and D must change the drawing, because it is data driven ─────────── */
const rVariation = computeElbowOnPipe({ ...BASE, elbowCentrelineRadiusMm: 228.60, datum: { type: 'EJE' } });
check('R = 228.60 is a valid case', rVariation.valid, JSON.stringify(rVariation.errors));
const rPicaje = buildElbowOnPipePicaje(rVariation, PICAJE_LABELS)!;
const rMarking = buildElbowOnPipeMarking(rVariation, MARKING_LABELS)!;
const baseMarking = buildElbowOnPipeMarking(computeElbowOnPipe(BASE), MARKING_LABELS)!;
check('R variation moves the picaje contour',
  !same(rPicaje.markers.map(marker => marker.picajeYMm), eje.y));
check('R variation changes the marking arc lengths',
  rMarking.maxArcLengthMm !== baseMarking.maxArcLengthMm);
check('R variation keeps the same developed circumference (OD unchanged)',
  rVariation.circumferenceMm === computeElbowOnPipe(BASE).circumferenceMm);

const dVariation = computeElbowOnPipe({ ...BASE, receiverOuterDiameterMm: 219.10, datum: { type: 'BOP' } });
check('D = 219.10 BOP is a valid case', dVariation.valid, JSON.stringify(dVariation.errors));
const dPicaje = buildElbowOnPipePicaje(dVariation, PICAJE_LABELS)!;
check('D variation moves the picaje contour',
  !same(dPicaje.markers.map(marker => marker.picajeXMm), bop.x)
  || !same(dPicaje.markers.map(marker => marker.picajeYMm), bop.y));
check('D variation changes Cota X′ and the seating height',
  dVariation.cotaXMm !== computeElbowOnPipe({ ...BASE, datum: { type: 'BOP' } }).cotaXMm
  && dVariation.seatingHeightMm !== computeElbowOnPipe({ ...BASE, datum: { type: 'BOP' } }).seatingHeightMm);

/* ── Cota Y' is external: it cannot move one single plotted point ───────── */
const yBase = computeElbowOnPipe(BASE);
const schematicArgs = {
  elbowCentrelineRadiusMm: BASE.elbowCentrelineRadiusMm,
  elbowOuterDiameterMm: BASE.elbowOuterDiameterMm,
  elbowInnerDiameterMm: BASE.elbowInnerDiameterMm,
  receiverOuterDiameterMm: BASE.receiverOuterDiameterMm,
  datumOffsetMm: yBase.datumOffsetMm,
  seatingHeightMm: yBase.seatingHeightMm,
  cotaXMm: yBase.cotaXMm,
  datumName: 'EJE',
};
const withoutY = {
  picaje: buildElbowOnPipePicaje(yBase, PICAJE_LABELS)!,
  marking: buildElbowOnPipeMarking(yBase, MARKING_LABELS)!,
  schematic: buildElbowOnPipeSchematic(schematicArgs, SCHEMATIC_LABELS)!,
};
const withY = {
  picaje: buildElbowOnPipePicaje(yBase, PICAJE_LABELS, { yPrimeMm: 100 })!,
  marking: buildElbowOnPipeMarking(yBase, MARKING_LABELS, { yPrimeMm: 100 })!,
  schematic: buildElbowOnPipeSchematic(schematicArgs, SCHEMATIC_LABELS, { yPrimeMm: 100 })!,
};
check("Y' leaves every picaje point bit-identical",
  JSON.stringify(withoutY.picaje.markers) === JSON.stringify(withY.picaje.markers)
  && withoutY.picaje.scale === withY.picaje.scale
  && JSON.stringify(withoutY.picaje.origin) === JSON.stringify(withY.picaje.origin));
check("Y' leaves every geometry tag of the picaje identical",
  JSON.stringify(readStations(withoutY.picaje.svg)) === JSON.stringify(readStations(withY.picaje.svg)));
check("Y' leaves the picaje contour polygon identical",
  /<polygon points="([^"]*)"[^>]*data-picaje-contour/.exec(withoutY.picaje.svg)?.[1]
  === /<polygon points="([^"]*)"[^>]*data-picaje-contour/.exec(withY.picaje.svg)?.[1]);
check("Y' leaves every marking point and trace identical",
  JSON.stringify(readStations(withoutY.marking.svg)) === JSON.stringify(readStations(withY.marking.svg))
  && withoutY.marking.clampedCount === withY.marking.clampedCount
  && withoutY.marking.minArcLengthMm === withY.marking.minArcLengthMm
  && withoutY.marking.maxArcLengthMm === withY.marking.maxArcLengthMm
  && /data-cut-curve="kernel-stations"/.test(withY.marking.svg)
  && polylinePoints(withoutY.marking.svg, 'data-cut-curve') === polylinePoints(withY.marking.svg, 'data-cut-curve')
  && polylinePoints(withoutY.marking.svg, 'data-limit-curve') === polylinePoints(withY.marking.svg, 'data-limit-curve')
  && polylinePoints(withoutY.marking.svg, 'data-angle-curve') === polylinePoints(withY.marking.svg, 'data-angle-curve'));
check("Y' leaves the schematic scales identical",
  withoutY.schematic.elevationScale === withY.schematic.elevationScale
  && withoutY.schematic.sectionScale === withY.schematic.sectionScale);
check("Y' only adds its own external annotation",
  !withoutY.picaje.svg.includes('data-external-cota-y-mm')
  && withY.picaje.svg.includes('data-external-cota-y-mm="100"')
  && withY.marking.svg.includes('data-external-cota-y-mm="100"')
  && withY.schematic.svg.includes('data-external-cota-y-mm="100"'));
check("an unusable Y' is simply ignored by the previews",
  !buildElbowOnPipePicaje(yBase, PICAJE_LABELS, { yPrimeMm: Number.NaN })!.svg.includes('data-external-cota-y-mm')
  && !buildElbowOnPipePicaje(yBase, PICAJE_LABELS, { yPrimeMm: null })!.svg.includes('data-external-cota-y-mm'));

function polylinePoints(svg: string, marker: string): string | undefined {
  return new RegExp(`<polyline points="([^"]*)"[^>]*${marker}`).exec(svg)?.[1];
}

/* ── Invalid geometry must never render a misleading preview ────────────── */
const invalidCases: [string, Partial<ElbowOnPipeInput>][] = [
  ['Fe beyond the BOP–TOP range', { datum: { type: 'FE', fe: 85 } }],
  ['elbow larger than the receiver', { receiverOuterDiameterMm: 60.3 }],
  ['elbow radius below its own section radius', { elbowCentrelineRadiusMm: 40 }],
  ['invalid N', { divisions: 3 }],
  ['NaN Fe', { datum: { type: 'FE', fe: Number.NaN } }],
  ['non-positive R', { elbowCentrelineRadiusMm: -1 }],
  ['ID above OD', { elbowInnerDiameterMm: 99 }],
];
for (const [name, changed] of invalidCases) {
  const result = computeElbowOnPipe({ ...BASE, ...changed });
  check(`invalid (${name}): kernel rejects`, !result.valid);
  check(`invalid (${name}): no picaje rendered`, buildElbowOnPipePicaje(result, PICAJE_LABELS) === null);
  check(`invalid (${name}): no marking rendered`, buildElbowOnPipeMarking(result, MARKING_LABELS) === null);
}
check('schematic rejects a non-finite global', buildElbowOnPipeSchematic({
  ...schematicArgs, seatingHeightMm: Number.NaN,
}, SCHEMATIC_LABELS) === null);
check('schematic rejects a radius below the elbow section radius', buildElbowOnPipeSchematic({
  ...schematicArgs, elbowCentrelineRadiusMm: 40,
}, SCHEMATIC_LABELS) === null);
check('schematic rejects an elbow wider than the receiver', buildElbowOnPipeSchematic({
  ...schematicArgs, receiverOuterDiameterMm: 60.3,
}, SCHEMATIC_LABELS) === null);
check('schematic rejects an ID above the OD', buildElbowOnPipeSchematic({
  ...schematicArgs, elbowInnerDiameterMm: 99,
}, SCHEMATIC_LABELS) === null);

/* ── Label thinning must never drop geometry points ─────────────────────── */
const dense = computeElbowOnPipe({ ...BASE, divisions: 48 });
const densePicaje = buildElbowOnPipePicaje(dense, PICAJE_LABELS)!;
const denseMarking = buildElbowOnPipeMarking(dense, MARKING_LABELS)!;
check('N=48 keeps every picaje point', readStations(densePicaje.svg).length === 48);
check('N=48 keeps every marking point', readStations(denseMarking.svg).length === 49);
check('N=48 keeps a guide line per station', [...denseMarking.svg.matchAll(/data-station-line="\d+"/g)].length === 49);
const denseLabels = [...densePicaje.svg.matchAll(/>P\d+</g)].length;
check('N=48 thins text labels only', denseLabels > 0 && denseLabels <= 12, `${denseLabels} labels`);
const sparse = computeElbowOnPipe({ ...BASE, divisions: 12 });
check('N=12 keeps every picaje point', readStations(buildElbowOnPipePicaje(sparse, PICAJE_LABELS)!.svg).length === 12);

/* ── SVG output must not inject unescaped markup ────────────────────────── */
const hostile = buildElbowOnPipePicaje(yBase, { ...PICAJE_LABELS, title: '<script>alert(1)</script>' })!;
check('text content is XML-escaped', !hostile.svg.includes('<script>') && hostile.svg.includes('&lt;script&gt;'));

console.log(`Traced plotted points against the U5.1 kernel: ${tracedPoints}`);
console.log(`${passed} PASS / ${failures.length} FAIL`);
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
}
