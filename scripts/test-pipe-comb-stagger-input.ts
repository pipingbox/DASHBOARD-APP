/**
 * PB-PIPE-COMB-CORRECTION-001 / P2 (final review fixes) — numeric input
 * policy and canonical-unit tests.
 *
 * Covers review finding H1 (unit toggle must never change the physical
 * geometry) and the decimal-input observation (one point OR one comma,
 * ambiguous mixes rejected).
 *
 * Internal values and direction are compared, not only rounded display
 * output: the canonical millimetre value and the kernel A/direction must
 * survive ANY number of unit toggles bit-for-bit.
 *
 * Run: node --experimental-strip-types scripts/test-pipe-comb-stagger-input.ts
 */

import {
  parseDecimalInput,
  parseLengthInputToMm,
  formatLengthForUnit,
  createLengthField,
  lengthFieldOnUnitChange,
  lengthFieldOnEdit,
  lengthFieldIsValid,
  type LengthFieldState,
} from '../app/frontend/src/tools/prefabrication/pipe-comb/number-input.ts';
import { toMm } from '../app/frontend/src/tools/core/units/index.ts';
import { solvePipeCombStagger } from '../app/frontend/src/tools/core/geometry/pipe-comb-stagger.ts';

let passed = 0;
const failures: string[] = [];
function check(label: string, condition: boolean, detail = ''): void {
  if (condition) passed++;
  else failures.push(`${label}${detail ? ': ' + detail : ''}`);
}

/* ---------------------------------------------------------- *
 * 1. Decimal separator policy (explicit, no silent guessing)
 * ---------------------------------------------------------- */
check('parse "22.5"', parseDecimalInput('22.5') === 22.5);
check('parse "22,5"', parseDecimalInput('22,5') === 22.5);
check('parse "45"', parseDecimalInput('45') === 45);
check('parse " 45 "', parseDecimalInput(' 45 ') === 45);
check('parse "0.5"', parseDecimalInput('0.5') === 0.5);
check('parse "0,5"', parseDecimalInput('0,5') === 0.5);
check('parse "-5"', parseDecimalInput('-5') === -5);
check('reject "1.2,3" (both separators)', parseDecimalInput('1.2,3') === null);
check('reject "1,2.3" (both separators)', parseDecimalInput('1,2.3') === null);
check('reject "1.2.3" (repeated point)', parseDecimalInput('1.2.3') === null);
check('reject "1,,2" (repeated comma)', parseDecimalInput('1,,2') === null);
check('reject "abc"', parseDecimalInput('abc') === null);
check('reject ""', parseDecimalInput('') === null);
check('reject "   "', parseDecimalInput('   ') === null);
check('reject "-"', parseDecimalInput('-') === null);
check('reject "1.234,5" (thousands+decimal mix)', parseDecimalInput('1.234,5') === null);

/* ---------------------------------------------------------- *
 * 2. H1 reproduction case — the exact review scenario
 *    N=4, Di=200.04, Df=100, θ=60: A≈-0.0231, negative.
 *    After mm -> in -> mm the canonical value and the kernel
 *    result must be IDENTICAL (used to drift to 200 / aligned).
 * ---------------------------------------------------------- */
function solveWithFields(di: LengthFieldState, df: LengthFieldState, count: number, deg: number) {
  const r = solvePipeCombStagger({
    pipeCount: count,
    initialSpacingMm: di.canonicalMm as number,
    finalSpacingMm: df.canonicalMm as number,
    elbowAngleDeg: deg,
  });
  if (!r.success) throw new Error(`unexpected invalid: ${r.code}`);
  return r.result;
}

{
  let di = createLengthField(200.04, 'mm');
  let df = createLengthField(100, 'mm');
  const before = solveWithFields(di, df, 4, 60);
  check('H1 before: A negative', before.adjacentStaggerMm < 0, String(before.adjacentStaggerMm));
  check('H1 before: direction negative', before.staggerDirection === 'negative');

  di = lengthFieldOnUnitChange(di, 'in');
  df = lengthFieldOnUnitChange(df, 'in');
  check('H1 in: display converted', di.text === formatLengthForUnit(200.04, 'in'), di.text);
  check('H1 in: canonical untouched', di.canonicalMm === 200.04);

  di = lengthFieldOnUnitChange(di, 'mm');
  df = lengthFieldOnUnitChange(df, 'mm');
  check('H1 round trip: canonical mm preserved exactly', di.canonicalMm === 200.04, String(di.canonicalMm));
  check('H1 round trip: display shows 200.04', di.text === '200.04', di.text);

  const after = solveWithFields(di, df, 4, 60);
  check('H1: A bit-identical after toggle', after.adjacentStaggerMm === before.adjacentStaggerMm,
    `${before.adjacentStaggerMm} vs ${after.adjacentStaggerMm}`);
  check('H1: direction preserved', after.staggerDirection === 'negative');
  check('H1: NOT flipped to aligned', after.staggerDirection !== 'aligned');
}

/* ---------------------------------------------------------- *
 * 3. At least 20 successive unit toggles without editing
 * ---------------------------------------------------------- */
{
  let di = createLengthField(200.04, 'mm');
  let df = createLengthField(100, 'mm');
  const before = solveWithFields(di, df, 4, 60);
  for (let i = 0; i < 20; i++) {
    di = lengthFieldOnUnitChange(di, 'in');
    df = lengthFieldOnUnitChange(df, 'in');
    di = lengthFieldOnUnitChange(di, 'mm');
    df = lengthFieldOnUnitChange(df, 'mm');
  }
  check('20 toggles: Di canonical bit-identical', di.canonicalMm === 200.04, String(di.canonicalMm));
  check('20 toggles: Df canonical bit-identical', df.canonicalMm === 100);
  const after = solveWithFields(di, df, 4, 60);
  check('20 toggles: A bit-identical', after.adjacentStaggerMm === before.adjacentStaggerMm);
  check('20 toggles: direction identical', after.staggerDirection === before.staggerDirection);
}

/* ---------------------------------------------------------- *
 * 4. Decimals not exactly representable in inches
 * ---------------------------------------------------------- */
{
  const tricky = [0.1, 0.2, 0.3, 123.456, 1.005, 33.333333, 200.04, 0.7];
  for (const v of tricky) {
    let f = createLengthField(v, 'mm');
    f = lengthFieldOnUnitChange(f, 'in');
    const canonicalInInches = f.canonicalMm;
    f = lengthFieldOnUnitChange(f, 'mm');
    check(`non-representable ${v}: canonical preserved`, f.canonicalMm === v,
      `${v} -> ${f.canonicalMm}`);
    check(`non-representable ${v}: untouched while in inches`, canonicalInInches === v);
  }
}

/* ---------------------------------------------------------- *
 * 5. Real edit in inches, then back to mm
 * ---------------------------------------------------------- */
{
  let f = createLengthField(200.04, 'mm');
  f = lengthFieldOnUnitChange(f, 'in');
  f = lengthFieldOnEdit(f, '7.8756', 'in');
  check('edit in inches: canonical = 7.8756 in in mm', f.canonicalMm === toMm(7.8756, 'in'),
    String(f.canonicalMm));
  f = lengthFieldOnUnitChange(f, 'mm');
  check('edit in inches -> mm: canonical preserved', f.canonicalMm === toMm(7.8756, 'in'));
  check('edit in inches -> mm: display readable', f.text === formatLengthForUnit(toMm(7.8756, 'in'), 'mm'), f.text);
  // A second edit in mm replaces the canonical value exactly once.
  f = lengthFieldOnEdit(f, '200,04', 'mm');
  check('comma edit in mm: parsed as 200.04', f.canonicalMm === 200.04, String(f.canonicalMm));
}

/* ---------------------------------------------------------- *
 * 6. Small valid values must never become zero
 * ---------------------------------------------------------- */
{
  for (const v of [0.5, 0.04, 0.004, 0.0004]) {
    let f = createLengthField(v, 'mm');
    check(`small ${v}: mm display not zero`, Number(f.text) !== 0, f.text);
    f = lengthFieldOnUnitChange(f, 'in');
    check(`small ${v}: in display not zero`, Number(f.text) !== 0, f.text);
    f = lengthFieldOnUnitChange(f, 'mm');
    check(`small ${v}: canonical preserved`, f.canonicalMm === v, String(f.canonicalMm));
    check(`small ${v}: display still not zero`, Number(f.text) !== 0, f.text);
  }
}

/* ---------------------------------------------------------- *
 * 7. Invalid edits never destroy the canonical value
 * ---------------------------------------------------------- */
{
  let f = createLengthField(200, 'mm');
  f = lengthFieldOnEdit(f, 'abc', 'mm');
  check('invalid edit: field invalid', !lengthFieldIsValid(f));
  check('invalid edit: canonical preserved', f.canonicalMm === 200);
  f = lengthFieldOnEdit(f, '250', 'mm');
  check('recovery: valid again', lengthFieldIsValid(f));
  check('recovery: canonical updated', f.canonicalMm === 250);
  // parseLengthInputToMm honours the current unit on edits
  check('parse in inches uses inches', parseLengthInputToMm('1', 'in') === 25.4);
  check('parse in mm uses mm', parseLengthInputToMm('1', 'mm') === 1);
}

console.log(`\nPASS ${passed} / ${passed + failures.length}`);
if (failures.length > 0) {
  console.log('FAILURES:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('ALL PIPE COMB INPUT POLICY TESTS PASS');
