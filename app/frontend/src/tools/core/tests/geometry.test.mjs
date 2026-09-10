#!/usr/bin/env node
/**
 * Unit tests for src/tools/core/geometry
 * Run with: node --experimental-strip-types src/tools/core/tests/geometry.test.mjs
 */

import assert from 'node:assert/strict';
import {
  solveOffsetWithElbows,
  solveOffsetWithoutElbows,
  solveOffsetVerificationPartial,
  solveMiteredElbow,
  solvePipeComb,
} from '../geometry/index.ts';

function near(a, b, tol = 0.001) {
  return Math.abs(a - b) <= tol;
}

export function runGeometryTests() {
  let count = 0;
  function test(name, fn) {
    count += 1;
    fn();
  }

  test('offset with 45° elbows is valid for A=B=300', () => {
    const res = solveOffsetWithElbows({ a: 300, b: 300, clrMm: 50, elbowAngleDeg: 45 });
    assert.strictEqual(res.success, true, 'should accept compatible 45° elbow');
    if (!res.success) return;
    assert(near(res.result.h, 424.264), 'H = sqrt(A²+B²)');
    assert(near(res.result.thetaDeg, 45), 'theta = 45°');
    assert(near(res.result.takeOutPerElbowMm, 50 * Math.tan((45 * Math.PI) / 180 / 2)), 'take-out 45°');
    assert(near(res.result.straightCutLengthMm, res.result.h - 2 * res.result.takeOutPerElbowMm), 'cut length');
  });

  test('offset with 90° elbow rejects incompatible A=B=300 geometry', () => {
    const res = solveOffsetWithElbows({ a: 300, b: 300, clrMm: 50, elbowAngleDeg: 90 });
    assert.strictEqual(res.success, false, '90° elbow must be rejected when geometry requires 45°');
    if (res.success) return;
    assert(res.reason.includes('45.00°'), 'reason names required angle');
  });

  test('offset rejects negative straight cut length', () => {
    // A=100, B=100 => H≈141.42, theta=45°; R=200 => takeOut≈82.84 each => cut≈-24.25
    const res = solveOffsetWithElbows({ a: 100, b: 100, clrMm: 200, elbowAngleDeg: 45 });
    assert.strictEqual(res.success, false, 'negative straight cut must be rejected');
    if (res.success) return;
    assert(res.reason.includes('negative'), 'reason mentions negative cut');
  });

  test('offset rejects degenerate inputs', () => {
    assert.strictEqual(solveOffsetWithElbows({ a: 0, b: 300, clrMm: 50, elbowAngleDeg: 45 }).success, false, 'A=0 rejected');
    assert.strictEqual(solveOffsetWithElbows({ a: 300, b: 0, clrMm: 50, elbowAngleDeg: 45 }).success, false, 'B=0 rejected');
    assert.strictEqual(solveOffsetWithElbows({ a: 300, b: 300, clrMm: -10, elbowAngleDeg: 45 }).success, false, 'negative CLR rejected');
    assert.strictEqual(solveOffsetWithElbows({ a: 300, b: 300, clrMm: 50, elbowAngleDeg: 91 }).success, false, 'angle >90 rejected');
  });

  test('offset without elbows', () => {
    const res = solveOffsetWithoutElbows({ a: 300, b: 300 });
    assert.strictEqual(res.success, true);
    if (!res.success) return;
    assert(near(res.result.h, 424.264), 'H same');
    assert(near(res.result.thetaDeg, 45), 'theta 45°');
    assert(near(res.result.cutAnglePerEndDeg, 22.5), 'cut angle = theta/2');
  });

  test('offset verification partial solver', () => {
    const fromAB = solveOffsetVerificationPartial({ a: 300, b: 300 });
    assert.strictEqual(fromAB.success, true);
    if (fromAB.success) assert(near(fromAB.result.h, 424.264), 'verify from A,B');

    const fromAH = solveOffsetVerificationPartial({ a: 300, h: 424.264 });
    assert.strictEqual(fromAH.success, true);
    if (fromAH.success) assert(near(fromAH.result.b, 300, 0.01), 'verify from A,H');

    const bad = solveOffsetVerificationPartial({ a: 300 });
    assert.strictEqual(bad.success, false, 'only one input rejected');
  });

  test('mitered elbow 3-piece 90° tangent geometry', () => {
    const res = solveMiteredElbow({ totalAngleDeg: 90, segments: 3, radiusMm: 500, odMm: 100 });
    assert.strictEqual(res.success, true);
    if (!res.success) return;
    assert.strictEqual(res.result.segments, 3);
    assert.strictEqual(res.result.numberOfJoints, 2);
    assert(near(res.result.jointDeflectionDeg, 45), 'joint deflection δ = 90/2');
    assert(near(res.result.cutAngleDeg, 22.5), '3-piece 90°: cut φ = 22.5°');

    // Tangent-length model: T = R · tan(δ/2); end piece = T; middle piece = 2T.
    const T = 500 * Math.tan(((45 * Math.PI) / 180) / 2);
    assert(near(res.result.tangentLengthMm, T, 1e-6), 'T = R·tan(δ/2)');
    const end = res.result.segmentsGeometry[0];
    const mid = res.result.segmentsGeometry[1];
    assert.strictEqual(end.kind, 'end');
    assert.strictEqual(mid.kind, 'middle');
    assert(near(end.centerLineLengthMm, T, 1e-6), 'end piece centerline = T');
    assert(near(mid.centerLineLengthMm, 2 * T, 1e-6), 'middle piece centerline = 2T');

    // Swept angle consistency: total centerline = 2·J·T exactly.
    assert(near(res.result.totalCenterLineLengthMm, 2 * res.result.numberOfJoints * T, 1e-6), 'total = 2·J·T');
    // End pieces identical (workshop property).
    assert(near(res.result.segmentsGeometry[2].centerLineLengthMm, end.centerLineLengthMm, 1e-9), 'end pieces identical');

    // Intrados/extrados scale with local bend radius (R ∓ OD/2).
    assert(near(mid.intradosLengthMm, mid.centerLineLengthMm * ((500 - 50) / 500), 1e-6), 'intrados = L·(R−OD/2)/R');
    assert(near(mid.extradosLengthMm, mid.centerLineLengthMm * ((500 + 50) / 500), 1e-6), 'extrados = L·(R+OD/2)/R');
    for (const seg of res.result.segmentsGeometry) {
      assert(seg.intradosLengthMm < seg.extradosLengthMm, 'intrados < extrados');
      assert(near(seg.cutAngleDeg, 22.5), 'per-piece cut angle');
    }
  });

  test('mitered elbow 2-piece 90° is a single miter joint', () => {
    const res = solveMiteredElbow({ totalAngleDeg: 90, segments: 2, radiusMm: 300, odMm: 60 });
    assert.strictEqual(res.success, true);
    if (!res.success) return;
    assert.strictEqual(res.result.numberOfJoints, 1);
    assert(near(res.result.cutAngleDeg, 45), '2-piece 90°: cut = 45°');
    assert(res.result.segmentsGeometry.every((s) => s.kind === 'end'), 'only end pieces');
    // T = R·tan(45°) = R; total = 2T = 2R.
    assert(near(res.result.totalCenterLineLengthMm, 2 * 300, 1e-6), 'total = 2R');
  });

  test('mitered elbow rejects invalid geometry', () => {
    assert.strictEqual(solveMiteredElbow({ totalAngleDeg: 90, segments: 1, radiusMm: 150, odMm: 88.9 }).success, false, 'N<2 rejected');
    assert.strictEqual(solveMiteredElbow({ totalAngleDeg: 190, segments: 3, radiusMm: 150, odMm: 88.9 }).success, false, 'angle>180 rejected');
    assert.strictEqual(solveMiteredElbow({ totalAngleDeg: 90, segments: 3, radiusMm: 40, odMm: 88.9 }).success, false, 'R <= OD/2 rejected');
    const bad = solveMiteredElbow({ totalAngleDeg: 90, segments: 1, radiusMm: 150, odMm: 88.9 });
    if (!bad.success) assert.strictEqual(bad.code, 'segments_min', 'failure carries machine code');
  });

  test('pipe comb equal spacing', () => {
    const res = solvePipeComb({ lineCount: 4, initialSpacingMm: 200, finalSpacingMm: 200, elbowAngleDeg: 45, clrMm: 50 });
    assert.strictEqual(res.success, true);
    if (!res.success) return;
    assert.strictEqual(res.result.lineCount, 4);
    assert(near(res.result.deltaSpacingMm, 0), 'equal spacing => zero delta');
    for (const line of res.result.lines) {
      assert(near(line.offsetMm, 0), 'all offsets zero');
      assert(near(line.advanceMm, 0), 'all advances zero (straight runs)');
      assert(near(line.travelMm, 0), 'all travels zero');
      assert(near(line.takeOutPerElbowMm, 0), 'no take-out without offset');
    }
    assert(near(res.result.travelSpreadMm, 0), 'zero travel spread');
  });

  test('pipe comb expanding keeps ONE common elbow angle for every line', () => {
    const res = solvePipeComb({ lineCount: 3, initialSpacingMm: 200, finalSpacingMm: 400, elbowAngleDeg: 45, clrMm: 50 });
    assert.strictEqual(res.success, true);
    if (!res.success) return;
    const thetaRad = (45 * Math.PI) / 180;
    const [ref, l2, l3] = res.result.lines;
    assert(near(ref.offsetMm, 0), 'line 1 offset zero');
    assert(near(l2.offsetMm, 200), 'line 2 offset = delta');
    assert(near(l3.offsetMm, 400), 'line 3 offset = 2·delta');

    // Common-angle identity per offset line: offset/advance = tan(θ), travel = offset/sin(θ).
    for (const line of [l2, l3]) {
      assert(near(line.offsetAbsMm / line.advanceMm, Math.tan(thetaRad), 1e-9), `line ${line.id}: offset/advance = tan(45°)`);
      assert(near(line.travelMm, line.offsetAbsMm / Math.sin(thetaRad), 1e-6), `line ${line.id}: travel = offset/sin(45°)`);
      assert(near(line.travelMm / line.advanceMm, 1 / Math.cos(thetaRad), 1e-6), `line ${line.id}: travel/advance = 1/cos(45°)`);
    }
    assert(near(l2.advanceMm, 200, 1e-6), 'line 2 advance = 200/tan45');
    assert(near(l3.advanceMm, 400, 1e-6), 'line 3 advance = 400/tan45');
    assert(near(l2.travelMm, 200 / Math.SQRT1_2, 1e-3), 'line 2 travel = 282.843');
    assert(near(l3.travelMm, 400 / Math.SQRT1_2, 1e-3), 'line 3 travel = 565.685');

    // Same angle + same CLR ⇒ same take-out on every offset line.
    const takeOut = 50 * Math.tan(thetaRad / 2);
    assert(near(l2.takeOutPerElbowMm, takeOut, 1e-6), 'line 2 take-out');
    assert(near(l3.takeOutPerElbowMm, takeOut, 1e-6), 'line 3 take-out identical');
    assert(near(l2.straightCutLengthMm, l2.travelMm - 2 * takeOut, 1e-6), 'line 2 cut');
    assert(near(l3.straightCutLengthMm, l3.travelMm - 2 * takeOut, 1e-6), 'line 3 cut');
    assert(near(res.result.travelSpreadMm, res.result.maxTravelMm - res.result.minTravelMm), 'spread consistent');
  });

  test('pipe comb reference line is a straight run without take-out', () => {
    const res = solvePipeComb({ lineCount: 3, initialSpacingMm: 200, finalSpacingMm: 400, elbowAngleDeg: 45, clrMm: 50 });
    assert.strictEqual(res.success, true);
    if (!res.success) return;
    const ref = res.result.lines[0];
    assert(near(ref.takeOutPerElbowMm, 0), 'reference line has no take-out');
    assert(near(ref.advanceMm, 0), 'reference line has no advance');
    assert(near(ref.straightCutLengthMm, ref.travelMm), 'reference line cut equals travel');
    const offset = res.result.lines[1];
    assert(offset.takeOutPerElbowMm > 0, 'offset line uses elbows');
    assert(near(offset.straightCutLengthMm, offset.travelMm - 2 * offset.takeOutPerElbowMm), 'offset line cut = travel - 2 take-out');
  });

  test('pipe comb contracting', () => {
    const res = solvePipeComb({ lineCount: 3, initialSpacingMm: 400, finalSpacingMm: 200, elbowAngleDeg: 45, clrMm: 50 });
    assert.strictEqual(res.success, true);
    if (!res.success) return;
    assert(near(res.result.lines[0].offsetMm, 0), 'reference line offset zero');
    assert(near(res.result.lines[1].offsetMm, -200), 'line 2 offset negative');
    assert(near(res.result.lines[2].offsetMm, -400), 'line 3 offset negative');
    assert(near(res.result.lines[1].offsetAbsMm, 200), 'abs offset positive');
    assert(near(res.result.lines[1].travelMm, 200 / Math.SQRT1_2, 1e-3), 'contracting travel = |offset|/sin45');
  });

  test('pipe comb line count bounds', () => {
    assert.strictEqual(solvePipeComb({ lineCount: 2, initialSpacingMm: 200, finalSpacingMm: 300, elbowAngleDeg: 45, clrMm: 50 }).success, true, '2 lines valid');
    assert.strictEqual(solvePipeComb({ lineCount: 12, initialSpacingMm: 200, finalSpacingMm: 300, elbowAngleDeg: 45, clrMm: 50 }).success, true, '12 lines valid');
    assert.strictEqual(solvePipeComb({ lineCount: 1, initialSpacingMm: 200, finalSpacingMm: 300, elbowAngleDeg: 45, clrMm: 50 }).success, false, '1 line rejected');
    assert.strictEqual(solvePipeComb({ lineCount: 13, initialSpacingMm: 200, finalSpacingMm: 300, elbowAngleDeg: 45, clrMm: 50 }).success, false, '13 lines rejected');
    const bad = solvePipeComb({ lineCount: 13, initialSpacingMm: 200, finalSpacingMm: 300, elbowAngleDeg: 45, clrMm: 50 });
    if (!bad.success) assert.strictEqual(bad.code, 'line_count_range', 'failure carries machine code');
  });

  test('pipe comb per-line CLR validation', () => {
    const bad = solvePipeComb({
      lineCount: 2,
      initialSpacingMm: 200,
      finalSpacingMm: 300,
      elbowAngleDeg: 45,
      clrMm: 50,
      lines: [{ id: '1' }, { id: '2', clrMm: Number.NaN }],
    });
    assert.strictEqual(bad.success, false, 'NaN per-line CLR rejected');
    if (!bad.success) assert.strictEqual(bad.code, 'per_line_clr_invalid', 'code identifies per-line CLR');

    const negative = solvePipeComb({
      lineCount: 2,
      initialSpacingMm: 200,
      finalSpacingMm: 300,
      elbowAngleDeg: 45,
      clrMm: 50,
      lines: [{ id: '1' }, { id: '2', clrMm: -5 }],
    });
    assert.strictEqual(negative.success, false, 'negative per-line CLR rejected');

    const ok = solvePipeComb({
      lineCount: 2,
      initialSpacingMm: 200,
      finalSpacingMm: 300,
      elbowAngleDeg: 45,
      clrMm: 50,
      lines: [{ id: '1' }, { id: '2', clrMm: 80 }],
    });
    assert.strictEqual(ok.success, true, 'valid per-line CLR override accepted');
    if (ok.success) assert(near(ok.result.lines[1].takeOutPerElbowMm, 80 * Math.tan((45 * Math.PI) / 180 / 2), 1e-6), 'override used');
  });

  test('pipe comb rejects negative straight cut', () => {
    // delta=50, 12 lines, θ=45°: line 2 offset=50, travel=50/sin45≈70.71;
    // CLR=700 ⇒ takeOut≈289.9 ⇒ cut≈70.71−579.87 < 0 ⇒ explicit rejection.
    const res = solvePipeComb({ lineCount: 12, initialSpacingMm: 200, finalSpacingMm: 250, elbowAngleDeg: 45, clrMm: 700 });
    assert.strictEqual(res.success, false, 'negative straight cut must be rejected');
    if (res.success) return;
    assert.strictEqual(res.code, 'negative_cut', 'code identifies negative cut');
    assert(res.reason.includes('negative'), 'reason mentions negative cut');
  });

  console.log(`  geometry: PASS (${count} tests)`);
  return count;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runGeometryTests();
}
