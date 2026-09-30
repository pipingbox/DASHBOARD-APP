#!/usr/bin/env node
/**
 * Unit tests for src/tools/prefabrication/elbow-cut engine
 * Run with: node --experimental-strip-types src/tools/prefabrication/elbow-cut/engine.test.mjs
 *
 * Regression values use the canonical NPS 6 LR elbow:
 * OD = 168.28 mm (B36.10M, CROSS_REFERENCE), CLR = 228.6 mm (B16.9 / Weldbend p.26,
 * A = 9.00 in, CROSS_REFERENCE). The old approximation defect (CLR = 533.4 mm for
 * NPS 6) must not reappear.
 */

import assert from 'node:assert/strict';
import { solveElbowCut } from './engine.ts';
import { getElbowRadius } from '../../core/standards/index.ts';

function near(a, b, tol = 0.001) {
  return Math.abs(a - b) <= tol;
}

export function runElbowCutTests() {
  let count = 0;
  function test(name, fn) {
    count += 1;
    fn();
  }

  const OD = 168.28;
  const CLR = getElbowRadius('6', 'LR');

  test('NPS 6 LR CLR comes from the canonical table (228.6 mm, not 533.4)', () => {
    assert(near(CLR, 228.6, 1e-9), 'CLR = 9.00 in = 228.6 mm (Weldbend p.26)');
  });

  test('90° elbow cut to 45°: distances from tangent point', () => {
    const res = solveElbowCut({ odMm: OD, clrMm: CLR, totalAngleDeg: 90, betaDeg: 45 });
    assert.strictEqual(res.success, true);
    if (!res.success) return;
    const tanHalf = Math.tan((45 * Math.PI) / 360); // tan(22.5°) = 0.41421356
    assert(near(res.result.cutCenterlineMm, CLR * tanHalf, 1e-6), 'centerline = CLR·tan(β/2)');
    assert(near(res.result.cutIntradosMm, (CLR - OD / 2) * tanHalf, 1e-6), 'intrados = (CLR−OD/2)·tan(β/2)');
    assert(near(res.result.cutExtradosMm, (CLR + OD / 2) * tanHalf, 1e-6), 'extrados = (CLR+OD/2)·tan(β/2)');
    assert(near(res.result.keptArcLengthMm, (CLR * 45 * Math.PI) / 180, 1e-6), 'kept arc = CLR·β(rad)');
    assert(near(res.result.discardedArcLengthMm, (CLR * 45 * Math.PI) / 180, 1e-6), '90→45 discards 45°');
    assert(res.result.cutIntradosMm < res.result.cutCenterlineMm, 'intrados < centerline');
    assert(res.result.cutCenterlineMm < res.result.cutExtradosMm, 'centerline < extrados');
  });

  test('beta equal to total keeps the whole elbow (zero discarded arc)', () => {
    const res = solveElbowCut({ odMm: OD, clrMm: CLR, totalAngleDeg: 90, betaDeg: 90 });
    assert.strictEqual(res.success, true);
    if (!res.success) return;
    assert(near(res.result.discardedArcLengthMm, 0, 1e-9), 'nothing discarded');
    assert(near(res.result.keptArcLengthMm, (CLR * 90 * Math.PI) / 180, 1e-6), 'full 90° arc kept');
  });

  test('180° total angle is the accepted upper limit', () => {
    const res = solveElbowCut({ odMm: OD, clrMm: CLR, totalAngleDeg: 180, betaDeg: 90 });
    assert.strictEqual(res.success, true, 'total = 180° accepted');
    if (!res.success) return;
    assert(near(res.result.keptArcLengthMm, CLR * Math.PI / 2, 1e-6), 'kept arc = CLR·π/2');
    assert(near(res.result.discardedArcLengthMm, CLR * Math.PI / 2, 1e-6), 'discarded arc = CLR·π/2');
  });

  test('total angle above 180° is rejected', () => {
    const res = solveElbowCut({ odMm: OD, clrMm: CLR, totalAngleDeg: 180.0001, betaDeg: 90 });
    assert.strictEqual(res.success, false, 'total > 180° rejected');
    if (res.success) return;
    assert.strictEqual(res.code, 'total_angle_range', 'code identifies range violation');
  });

  test('beta above total is rejected with machine code', () => {
    const res = solveElbowCut({ odMm: OD, clrMm: CLR, totalAngleDeg: 90, betaDeg: 91 });
    assert.strictEqual(res.success, false, 'beta > total rejected');
    if (res.success) return;
    assert.strictEqual(res.code, 'beta_range', 'code identifies beta range');
  });

  test('degenerate inputs are rejected without NaN/Infinity', () => {
    assert.strictEqual(solveElbowCut({ odMm: 0, clrMm: CLR, totalAngleDeg: 90, betaDeg: 45 }).success, false, 'OD=0 rejected');
    assert.strictEqual(solveElbowCut({ odMm: OD, clrMm: OD / 2, totalAngleDeg: 90, betaDeg: 45 }).success, false, 'CLR=OD/2 rejected');
    assert.strictEqual(solveElbowCut({ odMm: OD, clrMm: CLR, totalAngleDeg: 90, betaDeg: 0 }).success, false, 'beta=0 rejected');
    assert.strictEqual(solveElbowCut({ odMm: OD, clrMm: Number.NaN, totalAngleDeg: 90, betaDeg: 45 }).success, false, 'NaN CLR rejected');
    const res = solveElbowCut({ odMm: OD, clrMm: CLR, totalAngleDeg: 90, betaDeg: 45 });
    assert.strictEqual(res.success, true);
    if (!res.success) return;
    for (const v of Object.values(res.result)) {
      assert(Number.isFinite(v), 'every output is finite');
    }
  });

  console.log(`  elbow-cut: PASS (${count} tests)`);
  return count;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runElbowCutTests();
}
