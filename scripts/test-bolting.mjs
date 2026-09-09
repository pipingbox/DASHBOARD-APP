/**
 * Regression tests for the canonical bolting dataset and resolver.
 *
 * Run with: node scripts/test-bolting.mjs
 *
 * Covers:
 * - Known combinations from cross-reference tables
 * - RF vs RTJ independence
 * - 3P protrusion rule
 * - Thread designation / TPI / pitch consistency
 * - Single source of truth (SVG table vs resolver)
 * - N/A behavior for undefined combinations
 */

import assert from 'node:assert/strict';
import { resolveBoltingSpec } from '../app/frontend/src/lib/bolting/resolve-bolting-spec.ts';
import { ASME_B16_5_STUD_BOLTS, ASME_B16_5_PRESSURE_CLASSES } from '../app/frontend/src/lib/bolting/asme-b16-5-stud-bolts.ts';
import { getThreadSpec, minProtrusionMm } from '../app/frontend/src/lib/bolting/thread-data.ts';
import { getHeavyHexNutSpec } from '../app/frontend/src/lib/bolting/heavy-hex-nut-data.ts';

function near(a, b, tol = 0.01) {
  return Math.abs(a - b) <= tol;
}

function testRegressionCases() {
  const cases = [
    // NPS 2" Class 150 — regression case requested in ticket
    { nps: '2"', cls: 150, facing: 'RF', qty: 4, dia: 0.625, thread: '5/8"-11 UNC-2A', tpi: 11, pitch: 2.309, len: 83 },
    { nps: '2"', cls: 150, facing: 'RTJ', qty: 4, dia: 0.625, thread: '5/8"-11 UNC-2A', tpi: 11, pitch: 2.309, len: 95 },
    // Class 400
    { nps: '2"', cls: 400, facing: 'RF', qty: 8, dia: 0.625, thread: '5/8"-11 UNC-2A', tpi: 11, pitch: 2.309, len: 108 },
    { nps: '6"', cls: 400, facing: 'RF', qty: 12, dia: 0.875, thread: '7/8"-9 UNC-2A', tpi: 9, pitch: 2.822, len: 152 },
    // Missing NPS added
    { nps: '3-1/2"', cls: 150, facing: 'RF', qty: 8, dia: 0.625, thread: '5/8"-11 UNC-2A', tpi: 11, pitch: 2.309, len: 89 },
    { nps: '5"', cls: 150, facing: 'RF', qty: 8, dia: 0.75, thread: '3/4"-10 UNC-2A', tpi: 10, pitch: 2.54, len: 95 },
    { nps: '22"', cls: 300, facing: 'RF', qty: 24, dia: 1.5, thread: '1-1/2"-8 UN-2A', tpi: 8, pitch: 3.175, len: 229 },
    // 8UN transition
    { nps: '18"', cls: 150, facing: 'RF', qty: 16, dia: 1.125, thread: '1-1/8"-8 UN-2A', tpi: 8, pitch: 3.175, len: 146 },
  ];

  for (const c of cases) {
    const spec = resolveBoltingSpec(c.nps, c.cls, c.facing);
    assert.equal(spec.available, true, `expected available for ${c.nps} Class ${c.cls} ${c.facing}`);
    assert.equal(spec.stud.quantity, c.qty, `qty mismatch ${c.nps} Class ${c.cls}`);
    assert.equal(spec.stud.diameterIn, c.dia, `dia mismatch ${c.nps} Class ${c.cls}`);
    assert.equal(spec.stud.threadDesignation, c.thread, `thread mismatch ${c.nps} Class ${c.cls}`);
    assert.equal(spec.stud.tpi, c.tpi, `tpi mismatch ${c.nps} Class ${c.cls}`);
    assert.ok(near(spec.stud.pitchMm, c.pitch), `pitch mismatch ${c.nps} Class ${c.cls}`);
    assert.equal(spec.stud.lengthMm, c.len, `length mismatch ${c.nps} Class ${c.cls} ${c.facing}`);
  }
}

function testRfRtjIndependence() {
  const specRf = resolveBoltingSpec('2"', 150, 'RF');
  const specRtj = resolveBoltingSpec('2"', 150, 'RTJ');
  assert.notEqual(specRf.stud.lengthMm, specRtj.stud.lengthMm, 'RF and RTJ lengths must differ for NPS 2" Class 150');
}

function testThreeThreadsRule() {
  for (const cls of ASME_B16_5_PRESSURE_CLASSES) {
    const classData = ASME_B16_5_STUD_BOLTS[cls];
    if (!classData) continue;
    const rows = Object.values(classData.rows);
    for (const row of rows) {
      const thread = getThreadSpec(row.diaIn);
      if (!thread) continue;
      const expected = 3 * thread.pitchMm;
      const actual = minProtrusionMm(row.diaIn);
      assert.ok(near(actual, expected), `3P rule failed for dia ${row.diaIn}: ${actual} vs ${expected}`);
    }
  }
}

function testPitchFromTpi() {
  for (const cls of ASME_B16_5_PRESSURE_CLASSES) {
    const classData = ASME_B16_5_STUD_BOLTS[cls];
    if (!classData) continue;
    const rows = Object.values(classData.rows);
    for (const row of rows) {
      const expectedPitch = Number((25.4 / row.tpi).toFixed(3));
      assert.ok(near(row.pitchMm, expectedPitch), `pitch != 25.4/tpi for ${row.nps} Class ${cls}`);
    }
  }
}

function testNaForUndefined() {
  // Class 2500 is not defined above NPS 12
  const spec = resolveBoltingSpec('14"', 2500, 'RF');
  assert.equal(spec.available, false, 'NPS 14 Class 2500 must be unavailable');
  assert.ok(spec.reason, 'unavailable spec should provide a reason');
}

function testSingleSourceOfTruth() {
  // The resolver and the raw dataset must agree for every combination.
  for (const cls of ASME_B16_5_PRESSURE_CLASSES) {
    const classData = ASME_B16_5_STUD_BOLTS[cls];
    if (!classData) continue;
    const rows = Object.values(classData.rows);
    for (const row of rows) {
      for (const facing of ['RF', 'RTJ']) {
        const spec = resolveBoltingSpec(row.nps, cls, facing);
        if (facing === 'RTJ' && row.lengthRtjMm === null) {
          assert.equal(spec.available, false, `RTJ should be unavailable for ${row.nps} Class ${cls}`);
          continue;
        }
        assert.equal(spec.available, true);
        assert.equal(spec.stud.quantity, row.qty);
        assert.equal(spec.stud.diameterIn, row.diaIn);
        const expectedLen = facing === 'RTJ' ? row.lengthRtjMm : row.lengthRfMm;
        assert.equal(spec.stud.lengthMm, expectedLen);
      }
    }
  }
}

function testNutDataFromTables() {
  // Sanity check: AF must not be 1.5 × diameter (legacy approximation).
  const spec = resolveBoltingSpec('2"', 150, 'RF');
  const diaMm = spec.stud.diameterIn * 25.4;
  const afMm = spec.nut.afMm;
  assert.ok(afMm > diaMm * 1.55, `AF ${afMm} too close to legacy approximation ${diaMm * 1.5}`);
  assert.ok(afMm < diaMm * 2.5, `AF ${afMm} unreasonably large`);
}

const tests = [
  { name: 'regression cases', fn: testRegressionCases },
  { name: 'RF/RTJ independence', fn: testRfRtjIndependence },
  { name: '3 full threads rule', fn: testThreeThreadsRule },
  { name: 'pitch from TPI', fn: testPitchFromTpi },
  { name: 'N/A for undefined combinations', fn: testNaForUndefined },
  { name: 'single source of truth', fn: testSingleSourceOfTruth },
  { name: 'nut AF not 1.5×d', fn: testNutDataFromTables },
];

let failed = 0;
for (const t of tests) {
  try {
    t.fn();
    console.log(`  ✓ ${t.name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${t.name}`);
    console.error(err.message);
  }
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log('\nAll bolting tests passed.');
