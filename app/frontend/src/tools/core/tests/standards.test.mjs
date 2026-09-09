#!/usr/bin/env node
/**
 * Unit tests for src/tools/core/standards
 * Run with: node --experimental-strip-types src/tools/core/tests/standards.test.mjs
 */

import assert from 'node:assert/strict';
import {
  getPipeDimension,
  listNps,
  listSchedules,
  npsToDn,
  dnToNps,
  odMmToNps,
  isPipeCombinationSupported,
  PIPE_DIMENSIONS_PROVENANCE,
} from '../standards/index.ts';

function testLookupKnownCombination() {
  const res = getPipeDimension({ nps: '6', schedule: 'STD' });
  assert.strictEqual(res.success, true, '6" STD exists');
  if (!res.success) return;
  assert.strictEqual(res.dimension.nps, '6');
  assert.strictEqual(res.dimension.schedule, 'STD');
  assert.strictEqual(res.dimension.dn, 150);
  // OD is constant per NPS in B36.10M
  assert.strictEqual(res.dimension.odMm, 168.28);
  assert(res.dimension.idMm > 0, 'ID positive');
  assert(res.dimension.weightKgPerM > 0, 'weight positive');
  assert(res.dimension.weightLbPerFt > 0, 'imperial weight positive');
}

function testExplicitNa() {
  const res = getPipeDimension({ nps: '6', schedule: 'NONEXISTENT' });
  assert.strictEqual(res.success, false, 'unsupported schedule returns N/A');
}

function testNpsDnMapping() {
  assert.strictEqual(npsToDn('2'), 50);
  assert.strictEqual(dnToNps(50), '2');
  assert.strictEqual(odMmToNps(88.9), '3');
}

function testSchedules() {
  const sch = listSchedules('4');
  assert(sch.includes('STD'), '4" has STD schedule');
  assert(sch.includes('XS'), '4" has XS schedule');
}

function testCoverage() {
  assert(listNps().length > 0, 'NPS list not empty');
  assert(listNps().includes('1/2'), 'NPS list includes 1/2"');
  assert.strictEqual(isPipeCombinationSupported('1/2', 'STD'), true);
  assert.strictEqual(isPipeCombinationSupported('1/2', 'FAKE'), false);
}

function testProvenance() {
  assert.strictEqual(PIPE_DIMENSIONS_PROVENANCE.sourceStatus, 'CROSS_REFERENCE');
  assert(PIPE_DIMENSIONS_PROVENANCE.rowCount > 0);
}

export function runStandardsTests() {
  testLookupKnownCombination();
  testExplicitNa();
  testNpsDnMapping();
  testSchedules();
  testCoverage();
  testProvenance();
  console.log('  standards: PASS');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runStandardsTests();
}
