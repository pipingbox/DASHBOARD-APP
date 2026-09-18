#!/usr/bin/env node
/**
 * Unit tests for src/tools/core/units
 * Run with: node --experimental-strip-types src/tools/core/tests/units.test.mjs
 */

import assert from 'node:assert/strict';
import {
  convert,
  convertLength,
  convertPressure,
  convertTorque,
  convertAngle,
  convertTemperatureTyped,
  toMm,
  fromMm,
  formatFraction,
  formatFeetInches,
} from '../units/index.ts';

function near(a, b, tol = 1e-6) {
  return Math.abs(a - b) <= tol;
}

export function runUnitsTests() {
  let count = 0;
  function test(name, fn) {
    count += 1;
    fn();
  }

  test('length conversions', () => {
    assert(near(toMm(1, 'in'), 25.4), '1 inch = 25.4 mm');
    assert(near(fromMm(25.4, 'in'), 1), '25.4 mm = 1 inch');
    assert(near(toMm(1, 'ft'), 304.8), '1 ft = 304.8 mm');
    assert(near(convert(1, 'm', 'mm'), 1000), '1 m = 1000 mm');
    assert(near(convertLength(500, 'mm', 'ft'), 1.64042, 1e-5), '500 mm -> ft');
  });

  test('metric-imperial round trips', () => {
    const mm = convert(6, 'in', 'mm');
    assert(near(mm, 152.4), '6" = 152.4 mm');
    assert(near(convert(mm, 'mm', 'in'), 6), '152.4 mm back to 6"');
  });

  test('pressure psi -> bar', () => {
    const bar = convertPressure(1, 'psi', 'bar');
    assert(near(bar, 0.0689476, 1e-6), '1 psi ≈ 0.0689476 bar');
  });

  test('torque ft.lb -> N.m', () => {
    assert(near(convertTorque(1, 'ftlb', 'Nm'), 1.35582, 1e-5), '1 ft·lb ≈ 1.35582 N·m');
  });

  test('angle deg -> rad', () => {
    assert(near(convertAngle(180, 'deg', 'rad'), Math.PI, 1e-6), '180° = π rad');
    assert(near(convertAngle(Math.PI, 'rad', 'deg'), 180, 1e-6), 'π rad = 180°');
  });

  test('temperature conversions', () => {
    assert(near(convert(32, 'F', 'C'), 0), '32°F = 0°C');
    assert(near(convert(100, 'C', 'F'), 212), '100°C = 212°F');
    assert(near(convert(0, 'C', 'K'), 273.15), '0°C = 273.15 K');
    assert(near(convertTemperatureTyped(68, 'F', 'C'), 20), '68°F = 20°C');
  });

  test('dimension mismatch rejects m -> kg', () => {
    assert.throws(
      () => convert(1, 'm', 'kg'),
      /Incompatible dimensions/
    );
  });

  test('dimension mismatch rejects C -> m', () => {
    assert.throws(
      () => convert(1, 'C', 'm'),
      /Incompatible dimensions/
    );
  });

  test('temperature cannot fall through to length', () => {
    assert.throws(
      () => convert(20, 'C', 'mm'),
      /Incompatible dimensions/
    );
  });

  test('fraction and feet-inch formatting', () => {
    assert.strictEqual(formatFraction(0.5), '1/2');
    assert.strictEqual(formatFraction(1.5), '1 1/2');
    assert.strictEqual(formatFraction(2), '2');
    assert.strictEqual(formatFraction(0.25), '1/4');
    assert.strictEqual(formatFeetInches(27.5), "2' 3 1/2\"");
  });

  console.log(`  units: PASS (${count} tests)`);
  return count;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runUnitsTests();
}
