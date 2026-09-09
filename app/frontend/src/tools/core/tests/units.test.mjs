#!/usr/bin/env node
/**
 * Unit tests for src/tools/core/units
 * Run with: node --experimental-strip-types src/tools/core/tests/units.test.mjs
 */

import assert from 'node:assert/strict';
import {
  convert,
  toMm,
  fromMm,
  formatFraction,
  formatFeetInches,
} from '../units/index.ts';

function near(a, b, tol = 1e-6) {
  return Math.abs(a - b) <= tol;
}

function testLengthConversions() {
  // Exact definitions
  assert(near(toMm(1, 'in'), 25.4), '1 inch = 25.4 mm');
  assert(near(fromMm(25.4, 'in'), 1), '25.4 mm = 1 inch');
  assert(near(toMm(1, 'ft'), 304.8), '1 ft = 304.8 mm');
  assert(near(convert(1, 'm', 'mm'), 1000), '1 m = 1000 mm');
}

function testMetricImperialPairs() {
  // Common workshop round-trips
  const mm = convert(6, 'in', 'mm');
  assert(near(mm, 152.4), '6" = 152.4 mm');
  assert(near(convert(mm, 'mm', 'in'), 6), '152.4 mm back to 6"');
}

function testWeightAndVolume() {
  assert(near(convert(1, 'kg', 'lb'), 2.20462, 1e-5), '1 kg ≈ 2.20462 lb');
  assert(near(convert(1, 'gal_us', 'l'), 3.78541, 1e-5), '1 US gal ≈ 3.78541 L');
  assert(near(convert(1, 'ftlb', 'Nm'), 1.35582, 1e-5), '1 ft·lb ≈ 1.35582 N·m');
}

function testTemperature() {
  assert(near(convert(32, 'F', 'C'), 0), '32°F = 0°C');
  assert(near(convert(100, 'C', 'F'), 212), '100°C = 212°F');
  assert(near(convert(0, 'C', 'K'), 273.15), '0°C = 273.15 K');
}

function testFractions() {
  assert.strictEqual(formatFraction(0.5), '1/2');
  assert.strictEqual(formatFraction(1.5), '1 1/2');
  assert.strictEqual(formatFraction(2), '2');
  assert.strictEqual(formatFraction(0.25), '1/4');
  assert.strictEqual(formatFeetInches(27.5), "2' 3 1/2\"");
}

export function runUnitsTests() {
  testLengthConversions();
  testMetricImperialPairs();
  testWeightAndVolume();
  testTemperature();
  testFractions();
  console.log('  units: PASS');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runUnitsTests();
}
