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

  test('mitered elbow 3-piece 90° geometry', () => {
    const res = solveMiteredElbow({ totalAngleDeg: 90, segments: 3, radiusMm: 150, odMm: 88.9 });
    assert.strictEqual(res.success, true);
    if (!res.success) return;
    assert.strictEqual(res.result.segments, 3);
    assert.strictEqual(res.result.numberOfJoints, 2);
    assert(near(res.result.jointDeflectionDeg, 45), 'joint deflection = 90/2');
    assert(near(res.result.cutAngleDeg, 22.5), '3-piece 90°: cut = 22.5°');
    assert.strictEqual(res.result.segmentsGeometry.length, 3);

    // Straight-piece centerline length (chord), not arc length
    const beta = 45 * (Math.PI / 180);
    const piece = 2 * 150 * Math.sin(beta / 2);
    assert(near(res.result.totalCenterLineLengthMm, 3 * piece, 0.01), 'total = N * chord');
    assert(near(res.result.totalCenterLineLengthMm, 3 * piece, 0.01));

    for (const seg of res.result.segmentsGeometry) {
      assert(seg.intradosLengthMm < seg.extradosLengthMm, 'intrados < extrados');
      assert(near(seg.cutAngleDeg, 22.5), 'per-piece cut angle');
    }
  });

  test('mitered elbow rejects invalid geometry', () => {
    assert.strictEqual(solveMiteredElbow({ totalAngleDeg: 90, segments: 1, radiusMm: 150, odMm: 88.9 }).success, false, 'N<2 rejected');
    assert.strictEqual(solveMiteredElbow({ totalAngleDeg: 190, segments: 3, radiusMm: 150, odMm: 88.9 }).success, false, 'angle>180 rejected');
    assert.strictEqual(solveMiteredElbow({ totalAngleDeg: 90, segments: 3, radiusMm: 40, odMm: 88.9 }).success, false, 'R <= OD/2 rejected');
  });

  test('pipe comb equal spacing', () => {
    const res = solvePipeComb({ lineCount: 4, initialSpacingMm: 200, finalSpacingMm: 200, elbowAngleDeg: 45, clrMm: 50 });
    assert.strictEqual(res.success, true);
    if (!res.success) return;
    assert.strictEqual(res.result.lineCount, 4);
    assert(near(res.result.advanceMm, 0), 'equal spacing => zero advance');
    assert(near(res.result.lines[0].offsetMm, 0), 'reference line offset zero');
    assert(near(res.result.lines[3].offsetMm, 0), 'last line offset zero');
    assert(near(res.result.travelSpreadMm, 0), 'zero travel spread');
  });

  test('pipe comb expanding', () => {
    const res = solvePipeComb({ lineCount: 3, initialSpacingMm: 200, finalSpacingMm: 400, elbowAngleDeg: 45, clrMm: 50 });
    assert.strictEqual(res.success, true);
    if (!res.success) return;
    assert(near(res.result.advanceMm, 200), 'advance = delta/tan(45)');
    assert(near(res.result.lines[0].offsetMm, 0), 'line 1 offset zero');
    assert(near(res.result.lines[1].offsetMm, 200), 'line 2 offset = delta');
    assert(near(res.result.lines[2].offsetMm, 400), 'line 3 offset = 2*delta');
    assert(near(res.result.lines[2].travelMm, Math.hypot(200, 400)), 'line 3 travel');
    assert(near(res.result.travelSpreadMm, res.result.maxTravelMm - res.result.minTravelMm), 'spread consistent');
  });

  test('pipe comb contracting', () => {
    const res = solvePipeComb({ lineCount: 3, initialSpacingMm: 400, finalSpacingMm: 200, elbowAngleDeg: 45, clrMm: 50 });
    assert.strictEqual(res.success, true);
    if (!res.success) return;
    assert(near(res.result.lines[0].offsetMm, 0), 'reference line offset zero');
    assert(near(res.result.lines[1].offsetMm, -200), 'line 2 offset negative');
    assert(near(res.result.lines[2].offsetMm, -400), 'line 3 offset negative');
    assert(near(res.result.lines[1].offsetAbsMm, 200), 'abs offset positive');
  });

  test('pipe comb line count bounds', () => {
    assert.strictEqual(solvePipeComb({ lineCount: 2, initialSpacingMm: 200, finalSpacingMm: 300, elbowAngleDeg: 45, clrMm: 50 }).success, true, '2 lines valid');
    assert.strictEqual(solvePipeComb({ lineCount: 12, initialSpacingMm: 200, finalSpacingMm: 300, elbowAngleDeg: 45, clrMm: 50 }).success, true, '12 lines valid');
    assert.strictEqual(solvePipeComb({ lineCount: 1, initialSpacingMm: 200, finalSpacingMm: 300, elbowAngleDeg: 45, clrMm: 50 }).success, false, '1 line rejected');
    assert.strictEqual(solvePipeComb({ lineCount: 13, initialSpacingMm: 200, finalSpacingMm: 300, elbowAngleDeg: 45, clrMm: 50 }).success, false, '13 lines rejected');
  });

  test('pipe comb rejects negative straight cut', () => {
    // delta=300, elbow=45 => advance=300; line 2 offset=300 => travel=424.26; R=200 => takeOut=82.84 => cut≈258.6 positive.
    // Use R=300 to force negative on line 2: takeOut=124.26 => cut≈175.7 still positive. Need larger offset or smaller travel? Try elbow=60 => advance=173, line2 offset=300 travel=346, R=200 takeOut=107.5 cut=131. ok. Need make cut negative: line with offset large relative travel. For contracting final 100 initial 400 delta=-300, elbow=60 => advance=173, line2 offset=-300 travel=346, R=250 takeOut=155.5 cut=35; line3 offset=-600 travel=624, ok. To get negative on line 3, need R large. Use R=350 takeOut=218 => line3 cut=624-436=188 positive. Hmm. Use high line count? line 11 offset=10*delta=3000, travel>3000, R=1000 takeOut=577 cut>0. Need straightCut <0 means travel < 2*takeOut. travel = sqrt(advance^2+offset^2), advance=|delta|/tan(theta). For last line offset=(N-1)*delta. Min travel is offset (if advance=0, delta=0 not possible). Need 2*R*tan(theta/2) > offset. Choose delta small, many lines, R big. E.g. lineCount=12, initial=200, final=250 (delta=50), elbow=45, advance=50, line11 offset=550, travel=552.3. R=300 takeOut=124.3, 2*take=248.5 < travel. R=500 takeOut=207.1, 2*take=414.2 < travel. To get > travel need R very large ~350? For offset=550, need 2*R*tan(22.5)>552 => R>552/(0.828)=666. So R=700 => takeOut=289.9, 2take=579.9>552 -> negative. Use that.
    const res = solvePipeComb({ lineCount: 12, initialSpacingMm: 200, finalSpacingMm: 250, elbowAngleDeg: 45, clrMm: 700 });
    assert.strictEqual(res.success, false, 'negative straight cut must be rejected');
    if (res.success) return;
    assert(res.reason.includes('negative'), 'reason mentions negative cut');
  });

  console.log(`  geometry: PASS (${count} tests)`);
  return count;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runGeometryTests();
}
