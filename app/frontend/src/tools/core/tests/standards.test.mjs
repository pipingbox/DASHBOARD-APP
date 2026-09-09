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
} from '../standards/index.ts';
import {
  PIPE_DIMENSIONS,
  PIPE_DIMENSIONS_PROVENANCE,
} from '../standards/generated/pipe-dimensions.ts';

function near(a, b, tol = 0.001) {
  return Math.abs(a - b) <= tol;
}

export function runStandardsTests() {
  let count = 0;
  function test(name, fn) {
    count += 1;
    fn();
  }

  test('lookup known NPS/schedule combination', () => {
    const res = getPipeDimension({ nps: '6', schedule: 'STD' });
    assert.strictEqual(res.success, true, '6" STD exists');
    if (!res.success) return;
    assert.strictEqual(res.dimension.nps, '6');
    assert.strictEqual(res.dimension.schedule, 'STD');
    assert.strictEqual(res.dimension.dn, 150);
    assert.strictEqual(res.dimension.odMm, 168.28);
    assert(res.dimension.idMm > 0, 'ID positive');
    assert(res.dimension.weightKgPerM > 0, 'weight positive');
    assert(res.dimension.weightLbPerFt > 0, 'imperial weight positive');
  });

  test('unsupported combination returns explicit N/A', () => {
    const res = getPipeDimension({ nps: '6', schedule: 'NONEXISTENT' });
    assert.strictEqual(res.success, false, 'unsupported schedule returns N/A');
  });

  test('NPS/DN/OD mapping consistency', () => {
    assert.strictEqual(npsToDn('2'), 50);
    assert.strictEqual(dnToNps(50), '2');
    assert.strictEqual(odMmToNps(88.9), '3');
  });

  test('schedules list per NPS', () => {
    const sch = listSchedules('4');
    assert(sch.includes('STD'), '4" has STD schedule');
    assert(sch.includes('XS'), '4" has XS schedule');
  });

  test('coverage helpers', () => {
    assert(listNps().length > 0, 'NPS list not empty');
    assert(listNps().includes('1/2'), 'NPS list includes 1/2"');
    assert.strictEqual(isPipeCombinationSupported('1/2', 'STD'), true);
    assert.strictEqual(isPipeCombinationSupported('1/2', 'FAKE'), false);
  });

  test('provenance metadata', () => {
    assert.strictEqual(PIPE_DIMENSIONS_PROVENANCE.sourceStatus, 'CROSS_REFERENCE');
    assert.strictEqual(PIPE_DIMENSIONS_PROVENANCE.rowCount, 193);
    assert(PIPE_DIMENSIONS_PROVENANCE.sourceBlob.length === 40, 'full blob SHA');
    assert(PIPE_DIMENSIONS_PROVENANCE.sourceCommit.length === 40, 'full commit SHA');
  });

  test('embedded Brain source blob is exact expected blob', () => {
    assert.strictEqual(
      PIPE_DIMENSIONS_PROVENANCE.sourceBlob,
      '9985f64062d1cec1999d783c8ef278dc8214b508',
      'source blob matches Design Authority observation'
    );
  });

  test('all rows have finite positive values', () => {
    const seen = new Set();
    for (const r of PIPE_DIMENSIONS) {
      const key = `${r.nps}||${r.schedule}`;
      assert(!seen.has(key), `duplicate key ${key}`);
      seen.add(key);
      assert(r.dn > 0 && Number.isFinite(r.dn), `dn for ${key}`);
      assert(r.odMm > 0 && Number.isFinite(r.odMm), `odMm for ${key}`);
      assert(r.wtMm > 0 && Number.isFinite(r.wtMm), `wtMm for ${key}`);
      assert(r.idMm > 0 && Number.isFinite(r.idMm), `idMm for ${key}`);
      assert(r.weightKgPerM > 0 && Number.isFinite(r.weightKgPerM), `weightKgPerM for ${key}`);
      assert(r.weightLbPerFt > 0 && Number.isFinite(r.weightLbPerFt), `weightLbPerFt for ${key}`);
    }
  });

  test('ID consistency within tolerance', () => {
    const tolerance = 0.5;
    for (const r of PIPE_DIMENSIONS) {
      const expected = r.odMm - 2 * r.wtMm;
      assert(
        Math.abs(r.idMm - expected) <= tolerance,
        `ID inconsistency ${r.nps}/${r.schedule}: id=${r.idMm}, expected≈${expected.toFixed(3)}`
      );
    }
  });

  test('NPS maps to single DN and OD across schedules', () => {
    const npsToDnOd = new Map();
    for (const r of PIPE_DIMENSIONS) {
      const existing = npsToDnOd.get(r.nps);
      if (existing) {
        assert.strictEqual(existing.dn, r.dn, `NPS ${r.nps} multiple DN`);
        assert(near(existing.odMm, r.odMm, 0.001), `NPS ${r.nps} multiple OD`);
      } else {
        npsToDnOd.set(r.nps, { dn: r.dn, odMm: r.odMm });
      }
    }
  });

  console.log(`  standards: PASS (${count} tests)`);
  return count;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runStandardsTests();
}
