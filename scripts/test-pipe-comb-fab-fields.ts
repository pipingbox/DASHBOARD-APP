/**
 * PB-PIPE-COMB-CORRECTION-001 / P3-B (integration review fixes) — local
 * fabrication field adapter tests (findings H1 + H2).
 *
 * The adapter contract under test:
 *  - The canonical physical value is the ONLY thing the module may consume;
 *    it changes ONLY on an explicit valid edit, never on a unit toggle and
 *    never from re-parsing the rounded display text.
 *  - Empty is absence, invalid text is a review state: a unit toggle never
 *    resurrects a deleted or invalid value.
 *
 * Run: node --experimental-strip-types scripts/test-pipe-comb-fab-fields.ts
 */

import {
  createFabField,
  fabFieldOnEdit,
  fabFieldOnUnitChange,
  fabFieldStatus,
  type FabFieldState,
} from '../app/frontend/src/tools/prefabrication/pipe-comb/fab-fields.ts';
import { parseLengthInputToMm } from '../app/frontend/src/tools/prefabrication/pipe-comb/number-input.ts';

let passed = 0;
const failures: string[] = [];
function check(label: string, condition: boolean, detail = ''): void {
  if (condition) passed++;
  else failures.push(`${label}${detail ? ': ' + detail : ''}`);
}

/* ---------------------------------------------------------- *
 * 1. H1 reproduction A — CLR limit value (mm, NPS 6 bend)
 *    OD/2 = 84.14 exactly. The canonical value must stay 84.14
 *    through unit toggles; re-parsing "3.3126" in would give
 *    84.14004 and silently flip validity.
 * ---------------------------------------------------------- */
{
  let f = createFabField('mm');
  f = fabFieldOnEdit(f, '84.14');
  check('H1a canonical after edit', f.canonicalMm === 84.14, String(f.canonicalMm));
  f = fabFieldOnUnitChange(f, 'in');
  check('H1a inch text is the rounded display', f.text === '3.3126', f.text);
  check('H1a canonical survives the toggle', f.canonicalMm === 84.14, String(f.canonicalMm));
  check(
    'H1a re-parsing the display would differ (bug premise)',
    parseLengthInputToMm(f.text, 'in') !== 84.14,
  );
  f = fabFieldOnUnitChange(f, 'mm');
  check('H1a canonical survives the round trip', f.canonicalMm === 84.14, String(f.canonicalMm));
  // Neighbours keep their own state.
  for (const [raw, expected] of [['84.13', 84.13], ['84.15', 84.15]] as const) {
    let n = fabFieldOnEdit(createFabField('mm'), raw);
    n = fabFieldOnUnitChange(n, 'in');
    n = fabFieldOnUnitChange(n, 'mm');
    check(`H1a neighbour ${raw} stable`, n.canonicalMm === expected, String(n.canonicalMm));
  }
}

/* ---------------------------------------------------------- *
 * 2. H1 reproduction B — Lin 1000.004 mm: the mm display is
 *    "1000" but the canonical value must stay 1000.004.
 * ---------------------------------------------------------- */
{
  let f = createFabField('mm');
  f = fabFieldOnEdit(f, '1000.004');
  check('H1b canonical after edit', f.canonicalMm === 1000.004, String(f.canonicalMm));
  f = fabFieldOnUnitChange(f, 'in');
  check('H1b inch display', f.text === '39.3702', f.text);
  check('H1b canonical in inch phase', f.canonicalMm === 1000.004, String(f.canonicalMm));
  f = fabFieldOnUnitChange(f, 'mm');
  check('H1b mm display collapses to 1000', f.text === '1000', f.text);
  check('H1b canonical NOT collapsed', f.canonicalMm === 1000.004, String(f.canonicalMm));
}

/* ---------------------------------------------------------- *
 * 3. 20 full unit cycles, checking EVERY phase (inch too):
 *    canonical is bit-for-bit identical after each toggle.
 * ---------------------------------------------------------- */
{
  const fields: Array<[string, FabFieldState, number]> = [
    ['Lin', createFabField('mm'), 0],
    ['Lout', createFabField('mm'), 0],
    ['CLR', createFabField('mm'), 0],
    ['g', createFabField('mm'), 0],
    ['margin', createFabField('mm'), 0],
  ];
  const initials = [1000.004, 1200.006, 228.6, 0.03, 0.05];
  for (let i = 0; i < fields.length; i++) {
    fields[i][1] = fabFieldOnEdit(fields[i][1], String(initials[i]));
  }
  let unit: 'mm' | 'in' = 'mm';
  for (let cycle = 0; cycle < 20; cycle++) {
    unit = unit === 'mm' ? 'in' : 'mm';
    for (let i = 0; i < fields.length; i++) {
      fields[i][1] = fabFieldOnUnitChange(fields[i][1], unit);
      check(
        `cycle ${cycle} ${unit} ${fields[i][0]} canonical`,
        fields[i][1].canonicalMm === initials[i],
        `${fields[i][1].canonicalMm} !== ${initials[i]}`,
      );
      check(
        `cycle ${cycle} ${unit} ${fields[i][0]} valid`,
        fabFieldStatus(fields[i][1]) === 'valid',
      );
    }
  }
  // Real edit in inches and back: only the edit changes the value.
  fields[0][1] = fabFieldOnUnitChange(fields[0][1], 'in'); // display switches to inches
  fields[0][1] = fabFieldOnEdit(fields[0][1], '40'); // 40 in = 1016 mm
  check('explicit inch edit updates canonical', fields[0][1].canonicalMm === 1016, String(fields[0][1].canonicalMm));
  fields[0][1] = fabFieldOnUnitChange(fields[0][1], 'mm');
  check('after edit, mm display is exact', fields[0][1].text === '1016', fields[0][1].text);
  check('after edit, canonical is exact', fields[0][1].canonicalMm === 1016, String(fields[0][1].canonicalMm));
}

/* ---------------------------------------------------------- *
 * 4. H2 — deleted (empty) field stays empty across toggles.
 * ---------------------------------------------------------- */
{
  let f = createFabField('mm');
  f = fabFieldOnEdit(f, '1000');
  check('H2a valid before delete', fabFieldStatus(f) === 'valid');
  f = fabFieldOnEdit(f, '');
  check('H2a empty after delete', fabFieldStatus(f) === 'absent');
  check('H2a canonical cleared on delete', f.canonicalMm === null, String(f.canonicalMm));
  f = fabFieldOnUnitChange(f, 'in');
  check('H2a no resurrection in inches', f.text === '' && f.canonicalMm === null, `${f.text}/${f.canonicalMm}`);
  f = fabFieldOnUnitChange(f, 'mm');
  check('H2a still empty back in mm', f.text === '' && f.canonicalMm === null, `${f.text}/${f.canonicalMm}`);
  // Valid recovery, edited while the field displays inches.
  f = fabFieldOnUnitChange(f, 'in');
  f = fabFieldOnEdit(f, '39.3701');
  check('H2a recovery edit in inches', f.canonicalMm === 1000.00054, String(f.canonicalMm));
}

/* ---------------------------------------------------------- *
 * 5. H2 — invalid text survives toggles until corrected.
 * ---------------------------------------------------------- */
for (const bad of ['abc', '10.0,5', '-']) {
  let f = createFabField('mm');
  f = fabFieldOnEdit(f, '1000');
  f = fabFieldOnEdit(f, bad);
  check(`H2b ${bad} invalid`, fabFieldStatus(f) === 'invalid');
  check(`H2b ${bad} canonical cleared`, f.canonicalMm === null, String(f.canonicalMm));
  f = fabFieldOnUnitChange(f, 'in');
  check(`H2b ${bad} text untouched in inches`, f.text === bad, f.text);
  check(`H2b ${bad} still invalid in inches`, fabFieldStatus(f) === 'invalid');
  f = fabFieldOnUnitChange(f, 'mm');
  check(`H2b ${bad} still invalid in mm`, fabFieldStatus(f) === 'invalid');
  f = fabFieldOnEdit(f, '1000');
  check(`H2b ${bad} explicit correction`, fabFieldStatus(f) === 'valid' && f.canonicalMm === 1000);
}

/* ---------------------------------------------------------- *
 * 6. Small valid values never collapse to zero (display guard
 *    inherited from formatLengthForUnit).
 * ---------------------------------------------------------- */
{
  let f = createFabField('mm');
  f = fabFieldOnEdit(f, '0.03');
  check('small value valid', fabFieldStatus(f) === 'valid' && f.canonicalMm === 0.03);
  f = fabFieldOnUnitChange(f, 'in');
  check('small value inch display non-zero', f.text !== '0' && f.text !== '', f.text);
  check('small value canonical exact', f.canonicalMm === 0.03, String(f.canonicalMm));
  f = fabFieldOnUnitChange(f, 'mm');
  check('small value back to mm display', f.text === '0.03', f.text);
}

/* ---------------------------------------------------------- *
 * 7. Defaults with initial value (g = 0, margin = 0).
 * ---------------------------------------------------------- */
{
  const f = createFabField('mm', 0);
  check('default 0 valid', fabFieldStatus(f) === 'valid' && f.canonicalMm === 0);
  const g = fabFieldOnUnitChange(f, 'in');
  check('default 0 survives toggle', g.text === '0' && g.canonicalMm === 0, `${g.text}/${g.canonicalMm}`);
}

/* ---------------------------------------------------------- *
 * Summary
 * ---------------------------------------------------------- */
console.log(`\nfab-fields adapter: ${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const f of failures) console.error(`FAIL: ${f}`);
  process.exit(1);
}
console.log('ALL PASS');
