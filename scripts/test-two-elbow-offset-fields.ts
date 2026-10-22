/**
 * PB-PIPE-COMB-CORRECTION-001 / P4 — editable length field contract tests.
 *
 * Module under test: two-elbow-offset-fields.ts (P4-local). It exists to
 * close the 2026-10-22 review finding: the shared read-only formatter
 * rounded the EDITABLE field to 2 decimals in mm, so a canonical
 * Df = 400.004 mm redisplayed as "400" after a mm -> in -> mm round trip
 * while the engine kept computing with 400.004 mm.
 *
 * What is asserted here (the frozen parser is composed, never modified):
 *   1. The reported defect: 400.004 mm survives both unit round trips with
 *      the fraction VISIBLE, in mm and in inches.
 *   2. Round-trip faithfulness as a general property: for a battery of
 *      canonical values and both units, re-parsing the produced text
 *      reproduces the canonical value within ROUND_TRIP_TOLERANCE_MM.
 *   3. Readability is preserved for ordinary values (no gratuitous digits).
 *   4. The adopted imperial precision is documented by explicit expectations.
 *   5. Empty / invalid text and a null canonical value survive a toggle
 *      unchanged (the last valid value is never resurrected).
 *   6. A positive quantity never renders as "0" (previous review finding 4
 *      stays covered).
 *
 * Run: node --experimental-strip-types scripts/test-two-elbow-offset-fields.ts
 */

import {
  formatEditableLengthForUnit,
  createEditableLengthField,
  editableLengthFieldOnUnitChange,
  ROUND_TRIP_TOLERANCE_MM,
  BASE_DECIMALS,
  MAX_DECIMALS,
} from '../app/frontend/src/tools/prefabrication/two-elbow-offset/two-elbow-offset-fields.ts';
import { parseLengthInputToMm } from '../app/frontend/src/tools/prefabrication/pipe-comb/number-input.ts';
import { formatLengthForUnit } from '../app/frontend/src/tools/prefabrication/pipe-comb/number-input.ts';

let passed = 0;
let failed = 0;

function check(ok: boolean, label: string): void {
  if (ok) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL  ${label}`);
  }
}

function eq(actual: unknown, expected: unknown, label: string): void {
  const ok = actual === expected;
  if (!ok) console.error(`  FAIL  ${label}: expected ${String(expected)}, got ${String(actual)}`);
  else passed++;
  if (!ok) failed++;
}

/* ------------------------------------------------------------------ *
 * 1. The reported defect
 * ------------------------------------------------------------------ */
{
  console.log('\n1. Reported defect — Df = 400.004 mm');

  const canonical = 400.004;

  // The frozen shared formatter is the documented cause: it hides the fraction.
  eq(formatLengthForUnit(canonical, 'mm'), '400', '1.0 shared read-only formatter still rounds to "400" (cause, unchanged)');

  eq(formatEditableLengthForUnit(canonical, 'mm'), '400.004', '1.1 mm keeps the fraction visible');

  const field = createEditableLengthField(canonical, 'mm');
  const inInches = editableLengthFieldOnUnitChange(field, 'in');
  const backToMm = editableLengthFieldOnUnitChange(inInches, 'mm');

  eq(backToMm.text, '400.004', '1.2 mm -> in -> mm redisplays 400.004, not 400');
  eq(backToMm.canonicalMm, canonical, '1.3 canonical value untouched by the round trip');

  // Retyping exactly what the user sees must reproduce the same geometry.
  const retyped = parseLengthInputToMm(backToMm.text, 'mm');
  check(retyped !== null && Math.abs(retyped - canonical) <= ROUND_TRIP_TOLERANCE_MM, '1.4 retyping the visible text reproduces the canonical value');

  // The same, written with trailing zeros by the user: 400.0040.
  const typedWithZeros = parseLengthInputToMm('400.0040', 'mm');
  eq(typedWithZeros, canonical, '1.5 "400.0040" parses to the same canonical value');

  // In inches the fraction must also be recoverable.
  const inchText = inInches.text;
  const inchBack = parseLengthInputToMm(inchText, 'in');
  check(inchBack !== null && Math.abs(inchBack - canonical) <= ROUND_TRIP_TOLERANCE_MM, `1.6 inch text "${inchText}" is faithful within tolerance`);
  check(inchText !== '15.7482', `1.7 inch text is no longer the lossy 4-decimal "15.7482" (got "${inchText}")`);
}

/* ------------------------------------------------------------------ *
 * 2. Round-trip faithfulness as a general property
 * ------------------------------------------------------------------ */
{
  console.log('\n2. Round-trip faithfulness');

  const canonicals = [
    0, 1, 25.4, 38.1, 100, 152.4, 200, 300, 400, 406.4,
    400.004, 400.0004, 558.578644, 1000.05, 0.004, 0.05, 0.5,
    12.7, 190.5, 1200, 2000.123456, 99.999, 0.0001,
  ];

  for (const unit of ['mm', 'in'] as const) {
    for (const canonical of canonicals) {
      const text = formatEditableLengthForUnit(canonical, unit);
      const back = parseLengthInputToMm(text, unit);
      const ok = back !== null && Math.abs(back - canonical) <= ROUND_TRIP_TOLERANCE_MM;
      check(ok, `2.x ${canonical} mm in ${unit} -> "${text}" -> ${String(back)} mm (faithful)`);
      // Every produced string must be accepted by the frozen decimal policy.
      check(parseLengthInputToMm(text, unit) !== null, `2.x "${text}" parses under the decimal policy`);
      // A positive quantity never renders as "0".
      if (canonical > 0) check(text !== '0', `2.x ${canonical} mm never renders as "0" in ${unit}`);
    }
  }
}

/* ------------------------------------------------------------------ *
 * 3. Readability for ordinary values
 * ------------------------------------------------------------------ */
{
  console.log('\n3. Readability — no gratuitous digits in mm');

  eq(formatEditableLengthForUnit(200, 'mm'), '200', '3.1 200');
  eq(formatEditableLengthForUnit(400, 'mm'), '400', '3.2 400');
  eq(formatEditableLengthForUnit(152.4, 'mm'), '152.4', '3.3 152.4');
  eq(formatEditableLengthForUnit(38.1, 'mm'), '38.1', '3.4 38.1 (NPS 1/2 LR)');
  eq(formatEditableLengthForUnit(558.578644, 'mm'), '558.578644', '3.5 tangent case keeps its six decimals');
  eq(formatEditableLengthForUnit(0, 'mm'), '0', '3.6 true zero');
  eq(formatEditableLengthForUnit(400.0004, 'mm'), '400.0004', '3.7 precision extends further when the value demands it');
}

/* ------------------------------------------------------------------ *
 * 4. Adopted imperial precision
 * ------------------------------------------------------------------ */
{
  console.log('\n4. Adopted imperial precision');

  // Inch-exact values stay short: the rule adds digits only when needed.
  eq(formatEditableLengthForUnit(152.4, 'in'), '6', '4.1 CLR 152.4 mm = 6 in exactly');
  eq(formatEditableLengthForUnit(38.1, 'in'), '1.5', '4.2 38.1 mm = 1.5 in exactly');
  eq(formatEditableLengthForUnit(25.4, 'in'), '1', '4.3 25.4 mm = 1 in exactly');
  eq(formatEditableLengthForUnit(406.4, 'in'), '16', '4.4 406.4 mm = 16 in exactly');

  // Metric-origin values are not inch-exact: digits are added until faithful.
  const inch400 = formatEditableLengthForUnit(400, 'in');
  const inch400004 = formatEditableLengthForUnit(400.004, 'in');
  console.log(`     adopted: 400 mm -> "${inch400}" in | 400.004 mm -> "${inch400004}" in`);
  check(inch400 !== inch400004, '4.5 400 mm and 400.004 mm are distinguishable in inches');
  for (const [label, text, canonical] of [['400', inch400, 400], ['400.004', inch400004, 400.004]] as const) {
    const decimals = text.includes('.') ? text.split('.')[1].length : 0;
    check(decimals >= BASE_DECIMALS.in, `4.6 ${label} mm uses at least the base inch precision (${decimals})`);
    check(decimals <= MAX_DECIMALS.in, `4.7 ${label} mm stays within the inch precision cap (${decimals})`);
    const back = parseLengthInputToMm(text, 'in');
    check(back !== null && Math.abs(back - canonical) <= ROUND_TRIP_TOLERANCE_MM, `4.8 ${label} mm inch text is faithful`);
  }
}

/* ------------------------------------------------------------------ *
 * 5. Empty, invalid and null canonical survive a toggle
 * ------------------------------------------------------------------ */
{
  console.log('\n5. Empty / invalid / null canonical');

  const empty = editableLengthFieldOnUnitChange({ text: '', canonicalMm: null, unit: 'mm' }, 'in');
  eq(empty.text, '', '5.1 empty stays empty');
  eq(empty.canonicalMm, null, '5.2 empty keeps a null canonical');
  eq(empty.unit, 'in', '5.3 empty adopts the new unit');

  const invalid = editableLengthFieldOnUnitChange({ text: 'abc', canonicalMm: 400, unit: 'mm' }, 'in');
  eq(invalid.text, 'abc', '5.4 invalid text is not replaced by the last valid value');
  eq(invalid.canonicalMm, 400, '5.5 invalid text keeps the canonical value for later recovery');

  const ambiguous = editableLengthFieldOnUnitChange({ text: '1.000,5', canonicalMm: 400, unit: 'mm' }, 'in');
  eq(ambiguous.text, '1.000,5', '5.6 ambiguous separator text survives the toggle unchanged');

  // A cleared CLR (untabulated catalog combination) must not be refilled.
  const clearedClr = editableLengthFieldOnUnitChange({ text: '', canonicalMm: null, unit: 'mm' }, 'in');
  eq(clearedClr.text, '', '5.7 cleared CLR stays cleared through a unit toggle');

  const sameUnit = { text: '400.004', canonicalMm: 400.004, unit: 'mm' as const };
  check(editableLengthFieldOnUnitChange(sameUnit, 'mm') === sameUnit, '5.8 toggling to the same unit is identity');
}

/* ------------------------------------------------------------------ *
 * 6. Repeated toggles are stable
 * ------------------------------------------------------------------ */
{
  console.log('\n6. Stability under repeated toggles');

  for (const canonical of [400.004, 200, 152.4, 0.004, 558.578644]) {
    let field = createEditableLengthField(canonical, 'mm');
    const firstText = field.text;
    for (let i = 0; i < 5; i++) {
      field = editableLengthFieldOnUnitChange(field, 'in');
      field = editableLengthFieldOnUnitChange(field, 'mm');
    }
    eq(field.text, firstText, `6.x ${canonical} mm text is identical after 5 round trips`);
    eq(field.canonicalMm, canonical, `6.x ${canonical} mm canonical value is identical after 5 round trips`);
  }
}

/* ------------------------------------------------------------------ */

console.log(`\ntwo-elbow-offset fields: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
console.log('TWO-ELBOW-OFFSET FIELDS: PASS');
