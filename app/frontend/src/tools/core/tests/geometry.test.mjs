#!/usr/bin/env node
/**
 * Unit tests for src/tools/core/geometry
 * Run with: node --experimental-strip-types src/tools/core/tests/geometry.test.mjs
 */

import assert from 'node:assert/strict';
import {
  solveOffsetWithElbows,
  solveOffsetWithoutElbows,
  solveOffsetVerification,
  solveMiteredElbow,
  solvePipeComb,
} from '../geometry/index.ts';

function near(a, b, tol = 0.001) {
  return Math.abs(a - b) <= tol;
}

function testOffsetWithElbows() {
  // 90° elbows, A=B=300 mm, CLR=50 mm
  const res = solveOffsetWithElbows({ a: 300, b: 300, clrMm: 50 });
  assert(near(res.h, 424.264), 'H = sqrt(A²+B²)');
  assert(near(res.thetaDeg, 45), 'theta = 45°');
  assert(near(res.takeOutPerElbowMm, 50), 'take-out 90° = R');
  assert(near(res.straightCutLengthMm, 324.264), 'cut length = H - 2R');
}

function testOffsetWith45Elbows() {
  // 45° elbows, A=300, B=300, R=50
  const res = solveOffsetWithElbows({ a: 300, b: 300, clrMm: 50, elbowAngleDeg: 45 });
  assert(near(res.h, 424.264), 'H unchanged');
  assert(near(res.takeOutPerElbowMm, 50 * Math.tan((45 * Math.PI) / 180 / 2)), 'take-out 45°');
}

function testOffsetWithoutElbows() {
  const res = solveOffsetWithoutElbows({ a: 300, b: 300 });
  assert(near(res.h, 424.264), 'H same');
  assert(near(res.thetaDeg, 45), 'theta 45°');
  assert(near(res.cutAnglePerEndDeg, 22.5), 'cut angle = theta/2');
}

function testOffsetVerification() {
  const fromAB = solveOffsetVerification({ a: 300, b: 300 });
  assert(near(fromAB.h, 424.264), 'verify from A,B');

  const fromAH = solveOffsetVerification({ a: 300, h: 424.264 });
  assert(near(fromAH.b, 300, 0.01), 'verify from A,H');

  const fromThetaB = solveOffsetVerification({ thetaDeg: 45, b: 300 });
  assert(near(fromThetaB.a, 300, 0.01), 'verify from theta,B');
}

function testMiteredElbow() {
  const res = solveMiteredElbow({ totalAngleDeg: 90, segments: 3, radiusMm: 150, odMm: 88.9 });
  assert.strictEqual(res.segments, 3);
  assert.strictEqual(res.numberOfCuts, 2);
  assert(near(res.cutAngleDeg, 22.5), '3-piece 90°: cut = 22.5°');
  assert(near(res.totalCenterLineLengthMm, 150 * (Math.PI / 2)), 'arc length');
  assert.strictEqual(res.segmentsGeometry.length, 3);
  // Intrados shorter than extrados for each segment
  for (const seg of res.segmentsGeometry) {
    assert(seg.intradosLengthMm < seg.extradosLengthMm, 'intrados < extrados');
  }
}

function testPipeComb() {
  const res = solvePipeComb([
    { id: '1', a: 300, b: 300, clrMm: 50 },
    { id: '2', a: 320, b: 300, clrMm: 50 },
    { id: '3', a: 340, b: 300, clrMm: 50 },
  ]);
  assert.strictEqual(res.lines.length, 3);
  assert(near(res.lines[0].h, 424.264), 'line 1 travel');
  assert(res.maxTravelMm > res.minTravelMm, 'spread positive');
  assert(near(res.travelSpreadMm, res.maxTravelMm - res.minTravelMm), 'spread consistent');
}

export function runGeometryTests() {
  testOffsetWithElbows();
  testOffsetWith45Elbows();
  testOffsetWithoutElbows();
  testOffsetVerification();
  testMiteredElbow();
  testPipeComb();
  console.log('  geometry: PASS');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runGeometryTests();
}
