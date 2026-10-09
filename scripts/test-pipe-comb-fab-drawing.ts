/**
 * PB-PIPE-COMB-CORRECTION-001 / P3-C — fabrication drawing model tests.
 *
 * Verifies the pure presentation model against the approved P3-A solution:
 * coordinates are CONSTRUCTED from the solution (never recomputed), and an
 * independent reconstruction recovers Lin/Lout/Di/stagger positions.
 *
 * Run: node --experimental-strip-types scripts/test-pipe-comb-fab-drawing.ts
 */

import { solvePipeCombFabrication } from '../app/frontend/src/tools/prefabrication/pipe-comb/pipe-comb-fabrication.ts';
import {
  buildPipeCombFabDrawing,
  reconstructAssemblyFromDrawing,
  projectPoint,
  PROJECTION,
  type Vec2,
} from '../app/frontend/src/tools/prefabrication/pipe-comb/pipe-comb-fab-drawing.ts';

let passed = 0;
const failures: string[] = [];
function check(label: string, condition: boolean, detail = ''): void {
  if (condition) passed++;
  else failures.push(`${label}${detail ? ': ' + detail : ''}`);
}
function near(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol;
}
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

const DEG = Math.PI / 180;

/* Integration tolerance for values that pass through the solveElbowCut
 * engine (documented precision: outputs rounded to 6 decimals, max error
 * 5e-7 mm per value). Pure constructions keep 1e-9. */
const ENGINE_TOL = 1e-6;

/* ================================================================ *
 * Acceptance case: 3 x 35 deg, NPS 6 LR, Lin 1000, Lout 1200, g=0
 * ================================================================ */
const sol35 = solvePipeCombFabrication({
  pipeCount: 3,
  initialSpacingMm: 250,
  finalSpacingMm: 350,
  elbowAngleDeg: 35,
  nps: '6',
  elbow: { kind: 'catalog', radiusType: 'LR' },
  references: { inletAxisToAxisMm: 1000, outletAxisToAxisMm: 1200, weldGapMm: 0, fittingAllowanceMm: 0 },
});
if (sol35.success === false) throw new Error('fixture failed: ' + sol35.code);
const S = sol35.result;
const A = S.stagger.adjacentStaggerMm; // 253.169377
const t = S.elbow.takeOutMm; // 72.077303
check('fixture A', near(A, 253.169377, 1e-6), String(A));
check('fixture t', near(t, 72.077303, 1e-6), String(t));

const D = buildPipeCombFabDrawing(S);

/* --- Piece inventory: 6 pups (segments) + 3 elbows (arcs) + 6 joints --- */
const pupSegments = D.segments.filter((s) => s.finished);
check('six finished pup segments', pupSegments.length === 6, String(pupSegments.length));
check('three elbow arcs', D.arcs.length === 3, String(D.arcs.length));
check('six joint markers', D.joints.length === 6, String(D.joints.length));
const ids = new Set(pupSegments.map((s) => s.pieceId));
for (const id of ['P1-IN', 'P1-OUT', 'P2-IN', 'P2-OUT', 'P3-IN', 'P3-OUT']) {
  check(`segment ${id}`, ids.has(id));
}

/* --- Segment lengths equal the solution's finished lengths EXACTLY --- */
for (const pipe of S.pipes) {
  for (const piece of pipe.pieces) {
    if (piece.kind === 'elbow') continue;
    const seg = pupSegments.find((s) => s.pieceId === piece.id);
    check(`segment exists ${piece.id}`, seg !== undefined);
    if (seg) {
      check(
        `length ${piece.id} == solution`,
        near(dist(seg.from, seg.to), piece.finishedLengthMm ?? -1, 1e-9),
        `${dist(seg.from, seg.to)} vs ${piece.finishedLengthMm}`,
      );
    }
  }
}
/* Frozen acceptance values (6-decimal display of the fixture). */
const expected: Record<string, number> = {
  'P1-IN': 927.922697, 'P1-OUT': 1127.922697,
  'P2-IN': 674.75332, 'P2-OUT': 1191.9128,
  'P3-IN': 421.583943, 'P3-OUT': 1255.902904,
};
for (const [id, v] of Object.entries(expected)) {
  const seg = pupSegments.find((s) => s.pieceId === id);
  check(`frozen ${id}`, seg !== undefined && near(dist(seg.from, seg.to), v, 1e-6), seg ? String(dist(seg.from, seg.to)) : 'missing');
}

/* --- Axis intersections: E_k = ((k-1)*A, (k-1)*Di) --- */
for (let k = 0; k < 3; k++) {
  const det = D.elbowDetails.find((d) => d.pipeNumber === k + 1);
  check(`E${k + 1} position`, det !== undefined && near(det.axisIntersection.x, k * A, 1e-9) && near(det.axisIntersection.y, k * 250, 1e-9));
}

/* --- Elbow arc: radius CLR, span exactly theta, faces at distance t from E --- */
const CLR = S.elbow.clrMm;
for (const det of D.elbowDetails) {
  const arc = D.arcs.find((a) => a.pieceId === det.pieceId);
  check(`arc exists ${det.pieceId}`, arc !== undefined);
  if (arc) {
    check(`arc radius ${det.pieceId}`, near(arc.radiusMm, CLR, 1e-9));
    check(`arc centre ${det.pieceId}`, dist(arc.center, det.center) < 1e-9);
    const span = Math.abs(arc.endRad - arc.startRad);
    check(`arc span ${det.pieceId} == 35deg`, near(span, 35 * DEG, ENGINE_TOL), String(span / DEG));
    // Kept/cut face points lie ON the arc (distance CLR from centre).
    check(`kept face on arc ${det.pieceId}`, near(dist(det.keptFacePoint, det.center), CLR, ENGINE_TOL));
    check(`cut face on arc ${det.pieceId}`, near(dist(det.cutFacePoint, det.center), CLR, ENGINE_TOL));
    // Faces at take-out distance t from the axis intersection along axes.
    check(`kept face at t ${det.pieceId}`, near(dist(det.keptFacePoint, det.axisIntersection), t, 1e-9));
    check(`cut face at t ${det.pieceId}`, near(dist(det.cutFacePoint, det.axisIntersection), t, 1e-9));
    // The chord between the faces subtends theta at the centre.
    const v1 = { x: det.keptFacePoint.x - det.center.x, y: det.keptFacePoint.y - det.center.y };
    const v2 = { x: det.cutFacePoint.x - det.center.x, y: det.cutFacePoint.y - det.center.y };
    const cosAng = (v1.x * v2.x + v1.y * v2.y) / (CLR * CLR);
    check(`face angle ${det.pieceId} == 35deg`, near(Math.acos(cosAng), 35 * DEG, ENGINE_TOL));
  }
}

/* --- Joints: g=0 -> pup face == elbow face, at the elbow face points --- */
for (const j of D.joints) {
  check(`joint ${j.jointId} gap 0`, j.gapMm === 0 && dist(j.pupFace, j.elbowFace) < 1e-9);
}

/* --- Independent reconstruction: Lin, Lout, Di, stagger positions --- */
const rec = reconstructAssemblyFromDrawing(D);
check('reconstruct Lin', near(rec.linMm, 1000, 1e-9), String(rec.linMm));
check('reconstruct Lout', near(rec.loutMm, 1200, 1e-9), String(rec.loutMm));
check('reconstruct Di', near(rec.diMm, 250, 1e-9), String(rec.diMm));
check('reconstruct 3 intersections', rec.axisIntersections.length === 3);
for (let k = 0; k < 3; k++) {
  check(`reconstruct E${k + 1}`, near(rec.axisIntersections[k].x, k * A, 1e-9) && near(rec.axisIntersections[k].y, k * 250, 1e-9));
}

/* --- REF planes perpendicular to their axes --- */
const refEnt = D.referencePlanes.find((r) => r.id === 'REF-ENT');
const refSal = D.referencePlanes.find((r) => r.id === 'REF-SAL');
check('REF-ENT perpendicular to inlet axis', refEnt !== undefined && near(Math.abs(refEnt.direction.x), 0, 1e-9) && near(Math.abs(refEnt.direction.y), 1, 1e-9));
check('REF-SAL perpendicular to outlet axis', refSal !== undefined && near(
  refSal.direction.x * Math.cos(35 * DEG) + refSal.direction.y * Math.sin(35 * DEG),
  0,
  1e-9,
));

/* --- Dimensions: finished-length dims carry the solution values --- */
const finDims = D.dimensions.filter((d) => d.kind === 'finished-length');
check('six finished-length dims', finDims.length === 6, String(finDims.length));
for (const d of finDims) {
  const piece = S.pipes.flatMap((p) => p.pieces).find((p) => p.id === d.ownerId);
  check(`dim ${d.id} owner`, piece !== undefined);
  check(`dim ${d.id} value`, piece !== undefined && near(d.valueMm, piece.finishedLengthMm ?? -1, 1e-12));
  check(`dim ${d.id} measured run == value`, near(dist(d.from, d.to), d.valueMm, 1e-9));
}
/* Assembly dims: Lin, Lout, Di, stagger A. */
const dimLin = D.dimensions.find((d) => d.id === 'dim-Lin');
const dimLout = D.dimensions.find((d) => d.id === 'dim-Lout');
const dimDi = D.dimensions.find((d) => d.id === 'dim-Di');
const dimA = D.dimensions.find((d) => d.id === 'dim-stagger');
check('dim Lin', dimLin !== undefined && near(dimLin.valueMm, 1000, 1e-12));
check('dim Lout', dimLout !== undefined && near(dimLout.valueMm, 1200, 1e-12));
check('dim Di', dimDi !== undefined && near(dimDi.valueMm, 250, 1e-12));
check('dim A', dimA !== undefined && near(dimA.valueMm, A, 1e-12));
check('dim A measured run == |A|', dimA !== undefined && near(dist(dimA.from, dimA.to), Math.abs(A), 1e-9));

/* --- Projection: fixed, documented, deterministic --- */
const p1 = projectPoint({ x: 100, y: 50 });
const tilt = PROJECTION.tiltDeg * DEG;
check('projection x', near(p1.x, 100 * Math.cos(tilt) - 50 * Math.sin(tilt), 1e-12));
check('projection y', near(p1.y, (100 * Math.sin(tilt) + 50 * Math.cos(tilt)) * PROJECTION.squash, 1e-12));
check('projection deterministic', projectPoint({ x: 100, y: 50 }).x === p1.x);

/* --- Bounds contain everything --- */
for (const seg of D.segments) {
  check('bounds segment', seg.from.x >= D.bounds.min.x - 1e-9 && seg.to.x <= D.bounds.max.x + 1e-9);
}

/* ================================================================ *
 * g = 2 and allowance = 5: distinct joint faces, allowance segments
 * ================================================================ */
const solGap = solvePipeCombFabrication({
  pipeCount: 3, initialSpacingMm: 250, finalSpacingMm: 350, elbowAngleDeg: 35,
  nps: '6', elbow: { kind: 'catalog', radiusType: 'LR' },
  references: { inletAxisToAxisMm: 1000, outletAxisToAxisMm: 1200, weldGapMm: 2, fittingAllowanceMm: 5 },
});
if (solGap.success === false) throw new Error('gap fixture failed');
const DG = buildPipeCombFabDrawing(solGap.result);
for (const j of DG.joints) {
  check(`joint ${j.jointId} gap 2`, j.gapMm === 2 && near(dist(j.pupFace, j.elbowFace), 2, 1e-9), String(dist(j.pupFace, j.elbowFace)));
}
const allowSegs = DG.segments.filter((s) => !s.finished);
check('six allowance segments', allowSegs.length === 6, String(allowSegs.length));
for (const s of allowSegs) {
  check(`allowance length ${s.pieceId}`, near(dist(s.from, s.to), 5, 1e-9));
}
/* Cut-length dimensions exist and carry finished + allowance. */
const cutDims = DG.dimensions.filter((d) => d.kind === 'cut-length');
check('six cut-length dims', cutDims.length === 6, String(cutDims.length));
for (const d of cutDims) {
  const piece = solGap.result.pipes.flatMap((p) => p.pieces).find((p) => p.id === d.ownerId);
  check(`cut dim ${d.id}`, piece !== undefined && near(d.valueMm, piece.cutLengthMm ?? -1, 1e-12));
  check(`cut dim run ${d.id}`, near(dist(d.from, d.to), d.valueMm, 1e-9));
}
/* Finished lengths reduced by the gap: P1-IN = 1000 - t - 2. */
const p1in = solGap.result.pipes[0].pieces.find((p) => p.id === 'P1-IN');
check('gap reduces finished', near(p1in?.finishedLengthMm ?? 0, 1000 - t - 2, 1e-9), String(p1in?.finishedLengthMm));

/* ================================================================ *
 * 45 deg, 90 deg, negative stagger, aligned, N=2, N=12
 * ================================================================ */
function buildCase(count: number, di: number, df: number, angle: number, lin = 2000, lout = 2000) {
  const r = solvePipeCombFabrication({
    pipeCount: count, initialSpacingMm: di, finalSpacingMm: df, elbowAngleDeg: angle,
    nps: '6', elbow: { kind: 'catalog', radiusType: 'LR' },
    references: { inletAxisToAxisMm: lin, outletAxisToAxisMm: lout, weldGapMm: 0, fittingAllowanceMm: 0 },
  });
  if (r.success === false) throw new Error(`case ${count}/${di}/${df}/${angle} failed: ${r.code}`);
  return r.result;
}
/* N=12 uses Lin=5000/Lout=2000 so all 24 pups stay physically positive
 * (P12-IN = 5000 - 11*A - t > 0). */
for (const [count, di, df, angle, lin, lout] of [[3, 250, 250, 45, 2000, 2000], [3, 250, 250, 90, 2000, 2000], [3, 400, 200, 45, 2000, 2000], [3, 250, 250 * Math.cos(35 * DEG), 35, 2000, 2000], [2, 250, 350, 35, 2000, 2000], [12, 250, 350, 35, 5000, 2000]] as const) {
  const s = buildCase(count, di, df, angle, lin, lout);
  const d = buildPipeCombFabDrawing(s);
  const pups = d.segments.filter((x) => x.finished);
  check(`case ${count}/${di}/${df}/${angle}: ${count * 2} pups`, pups.length === count * 2, String(pups.length));
  check(`case ${count}/${di}/${df}/${angle}: ${count} arcs`, d.arcs.length === count, String(d.arcs.length));
  for (const arc of d.arcs) {
    check(`case ${angle}: arc span`, near(Math.abs(arc.endRad - arc.startRad), angle * DEG, ENGINE_TOL));
  }
  const rec2 = reconstructAssemblyFromDrawing(d);
  check(`case ${count}/${di}/${df}/${angle}: reconstruct Lin`, near(rec2.linMm, lin, 1e-9));
  check(`case ${count}/${di}/${df}/${angle}: reconstruct Lout`, near(rec2.loutMm, lout, 1e-9));
  if (count >= 2) check(`case ${di}: reconstruct Di`, near(rec2.diMm, di, 1e-9));
  // Segment lengths match the solution exactly.
  for (const pipe of s.pipes) {
    for (const piece of pipe.pieces) {
      if (piece.kind === 'elbow') continue;
      const seg = pups.find((x) => x.pieceId === piece.id);
      check(`case ${count}/${angle} ${piece.id} length`, seg !== undefined && near(dist(seg.from, seg.to), piece.finishedLengthMm ?? -1, 1e-9));
    }
  }
}

/* Aligned case: A = 0 -> all E on the same x. */
{
  const s = buildCase(3, 250, 250 * Math.cos(35 * DEG), 35);
  check('aligned A == 0', s.stagger.adjacentStaggerMm === 0, String(s.stagger.adjacentStaggerMm));
  const d = buildPipeCombFabDrawing(s);
  for (const det of d.elbowDetails) {
    check('aligned E x == 0', near(det.axisIntersection.x, 0, 1e-12));
  }
}

/* ================================================================ *
 * Bend mode: continuous bars, CLR = 228.6 mm (9 in), no weld joints
 * ================================================================ */
{
  const r = solvePipeCombFabrication({
    pipeCount: 3, initialSpacingMm: 250, finalSpacingMm: 350, elbowAngleDeg: 35,
    nps: '6', elbow: { kind: 'bend', clrMm: 228.6 },
    references: { inletAxisToAxisMm: 1000, outletAxisToAxisMm: 1200, weldGapMm: 0, fittingAllowanceMm: 0 },
  });
  if (r.success === false) throw new Error('bend fixture failed');
  const s = r.result;
  const d = buildPipeCombFabDrawing(s);
  check('bend: 6 straight segments', d.segments.filter((x) => x.finished).length === 6, String(d.segments.length));
  check('bend: 3 arcs', d.arcs.length === 3);
  check('bend: no joints', d.joints.length === 0, String(d.joints.length));
  for (const pipe of s.pipes) {
    const bend = pipe.pieces.find((p) => p.kind === 'bent-tube');
    const segs = d.segments.filter((x) => x.pieceId === bend?.id && x.finished);
    check(`bend ${bend?.id} two straights`, segs.length === 2);
    if (bend && segs.length === 2) {
      const lens = segs.map((x) => dist(x.from, x.to)).sort((a, b) => a - b);
      const expectedStraights = [bend.straightInletMm ?? 0, bend.straightOutletMm ?? 0].sort((a, b) => a - b);
      check(`bend ${bend.id} straight lengths`, near(lens[0], expectedStraights[0], 1e-9) && near(lens[1], expectedStraights[1], 1e-9));
    }
  }
  // Developed bar = straights + arc (solution value, not recomputed).
  const b1 = s.pipes[0].pieces.find((p) => p.id === 'P1-BEND');
  check('bend bar finished', b1 !== undefined && near(
    (b1.straightInletMm ?? 0) + (b1.arcLengthMm ?? 0) + (b1.straightOutletMm ?? 0),
    b1.finishedLengthMm ?? -1,
    1e-9,
  ));
}

/* ================================================================ *
 * Summary
 * ================================================================ */
console.log(`\nfab drawing model: ${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const f of failures.slice(0, 40)) console.error(`FAIL: ${f}`);
  if (failures.length > 40) console.error(`... and ${failures.length - 40} more`);
  process.exit(1);
}
console.log('ALL PASS');
