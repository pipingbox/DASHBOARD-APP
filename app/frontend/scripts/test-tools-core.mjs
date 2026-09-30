#!/usr/bin/env node
/**
 * Test runner for PipingBox Tools Core (W1.A).
 *
 * Run from app/frontend:
 *   node --experimental-strip-types scripts/test-tools-core.mjs
 *
 * Ticket: PB-TOOLS-FUNCTIONAL-PARITY-001 / W1.A
 */

import { runUnitsTests } from '../src/tools/core/tests/units.test.mjs';
import { runGeometryTests } from '../src/tools/core/tests/geometry.test.mjs';
import { runStandardsTests } from '../src/tools/core/tests/standards.test.mjs';
import { runElbowCutTests } from '../src/tools/prefabrication/elbow-cut/engine.test.mjs';

let failed = false;
let totalTests = 0;

async function run() {
  console.log('PB-TOOLS-CORE tests');
  const suites = [
    ['units', runUnitsTests],
    ['geometry', runGeometryTests],
    ['standards', runStandardsTests],
    ['elbow-cut', runElbowCutTests],
  ];
  for (const [name, fn] of suites) {
    try {
      const count = fn();
      totalTests += count;
      console.log(`  ${name}: ${count} tests`);
    } catch (err) {
      failed = true;
      console.error(`  ${name}: FAIL`);
      console.error(err);
    }
  }
  console.log(`TOTAL: ${totalTests} tests`);
  if (failed) {
    console.error('\nPB-TOOLS-CORE: FAIL');
    process.exit(1);
  } else {
    console.log('\nPB-TOOLS-CORE: PASS');
  }
}

run();
