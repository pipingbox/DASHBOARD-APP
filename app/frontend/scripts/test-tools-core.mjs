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

let failed = false;

async function run() {
  console.log('PB-TOOLS-CORE tests');
  for (const [name, fn] of Object.entries({
    units: runUnitsTests,
    geometry: runGeometryTests,
    standards: runStandardsTests,
  })) {
    try {
      fn();
    } catch (err) {
      failed = true;
      console.error(`  ${name}: FAIL`);
      console.error(err);
    }
  }
  if (failed) {
    console.error('\nPB-TOOLS-CORE: FAIL');
    process.exit(1);
  } else {
    console.log('\nPB-TOOLS-CORE: PASS');
  }
}

run();
