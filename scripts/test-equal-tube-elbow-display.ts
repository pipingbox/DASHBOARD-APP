import { computeEqualTubeElbowJoint, type EqualTubeElbowInput, type EqualTubeElbowSuccess } from '../app/frontend/src/tools/branch/equalTubeElbowGeometry.ts';
import { projectEqualTubeElbow, EQUAL_TUBE_ELBOW_DECIMALS } from '../app/frontend/src/tools/branch/equalTubeElbowDisplay.ts';
import { EQUAL_TUBE_ELBOW_REFERENCES, EQUAL_TUBE_ELBOW_REFERENCE_VALUE_COUNT, type EqualTubeElbowReference } from './fixtures/equal-tube-elbow-reference.ts';

/**
 * PB-BRANCH-EQUAL-TUBE-ELBOW-001 — U6.2 display regression.
 *
 * Pins the U6.2 screen projection against the same literal Tubero corpus that
 * validated the U6.1 kernel (183 shown values, 0.05 mm tolerance). If a string
 * the panel renders ever disagrees with the corpus, this file fails — the UI
 * cannot drift from the validated numbers.
 */

let passed = 0;
const failures: string[] = [];
function check(label: string, condition: boolean, detail = ''): void {
  if (condition) passed++;
  else failures.push(`${label}${detail ? ': ' + detail : ''}`);
}
function valid(input: EqualTubeElbowInput): EqualTubeElbowSuccess {
  const result = computeEqualTubeElbowJoint(input);
  if (!result.valid) throw new Error(`unexpected invalid geometry: ${JSON.stringify(result.errors)}`);
  return result;
}

const toShown = (value: number, decimals: number) => value.toFixed(decimals);
const tolerance = 0.050000001;

let corpusCells = 0;
for (const ref of EQUAL_TUBE_ELBOW_REFERENCES) {
  const result = valid(ref);
  const display = projectEqualTubeElbow(result);
  check(`${ref.id} display of a valid result`, display !== null);
  if (!display) continue;

  /* Summary: Div and the wrap circumference are corpus-visible quantities. */
  corpusCells++;
  check(`${ref.id} summary Div = ${ref.divMm}`, display.summary.find(e => e.key === 'div')!.value
    === toShown(ref.divMm, EQUAL_TUBE_ELBOW_DECIMALS.summary)
    || Math.abs(Number(display.summary.find(e => e.key === 'div')!.value) - ref.divMm) <= 0.05,
    `${display.summary.find(e => e.key === 'div')!.value} vs ${ref.divMm}`);
  check(`${ref.id} summary rows`, display.summary.length === 5 && display.summary.every(e => !e.external));

  /* Station rows: physical order, closure flag, corpus values. */
  check(`${ref.id} row count N+1`, display.rows.length === ref.divisions + 1);
  check(`${ref.id} closure is last`, display.rows[ref.divisions].isClosure === true
    && display.rows.slice(0, ref.divisions).every(r => !r.isClosure));
  check(`${ref.id} closure label repeats P1`, display.rows[ref.divisions].label === 'P1');

  for (let i = 0; i < ref.divisions; i++) {
    const row = display.rows[i];
    corpusCells++;
    check(`${ref.id} Cota tubo P${i + 1}: corpus 0.1 mm`,
      Math.abs(Number(row.tubeCota) - ref.tubeCutPositionsMm[i]) <= tolerance,
      `${row.tubeCota} vs ${ref.tubeCutPositionsMm[i]}`);
    corpusCells++;
    check(`${ref.id} L arco P${i + 1}: corpus 0.1 mm`,
      Math.abs(Number(row.arcLength) - ref.elbowArcLengthsMm[i]) <= tolerance,
      `${row.arcLength} vs ${ref.elbowArcLengthsMm[i]}`);
    corpusCells++;
    check(`${ref.id} R arco P${i + 1}: corpus 0.1 mm`,
      Math.abs(Number(row.arcRadius) - ref.elbowArcRadiiMm[i]) <= tolerance,
      `${row.arcRadius} vs ${ref.elbowArcRadiiMm[i]}`);
    /* Internal consistency: cota + markFromEnd = L, verbatim kernel arithmetic. */
    check(`${ref.id} cota+fromEnd=L P${i + 1}`,
      Math.abs(Number(row.tubeCota) + Number(row.markFromEnd) - ref.lengthMm) <= 5e-3,
      `${row.tubeCota}+${row.markFromEnd} vs ${ref.lengthMm}`);
  }

  /* Clamped accounting: the acotada half sits at t = 90°, the curved half below. */
  const clampedRows = display.rows.filter(r => !r.isClosure && r.clamped);
  check(`${ref.id} clamped count integer-half`, clampedRows.length === ref.divisions - Math.floor((ref.divisions - 1) / 2),
    `${clampedRows.length}`);
  check(`${ref.id} clamped bend angle is 90`, clampedRows.every(r => Number(r.bendAngleDeg) === 90));
  check(`${ref.id} display clampedCount matches rows`, display.clampedCount === clampedRows.length);
}

/* Corpus coverage accounting: every shown value must have been checked. */
check('corpus value count', corpusCells === EQUAL_TUBE_ELBOW_REFERENCE_VALUE_COUNT,
  `${corpusCells} vs ${EQUAL_TUBE_ELBOW_REFERENCE_VALUE_COUNT}`);

/* Invalid results never project: no partial numbers next to an error. */
const badCases: EqualTubeElbowInput[] = [
  { lengthMm: 300, innerDiameterMm: 77.92, outerDiameterMm: 88.9, elbowCenterlineRadiusMm: 88.9 / 2, divisions: 24 },
  { lengthMm: 10, innerDiameterMm: 77.92, outerDiameterMm: 88.9, elbowCenterlineRadiusMm: 114.3, divisions: 24 },
  { lengthMm: 300, innerDiameterMm: 88.9, outerDiameterMm: 88.9, elbowCenterlineRadiusMm: 114.3, divisions: 24 },
  { lengthMm: 300, innerDiameterMm: 77.92, outerDiameterMm: 88.9, elbowCenterlineRadiusMm: 114.3, divisions: 48 },
];
for (const bad of badCases) {
  const failed = computeEqualTubeElbowJoint(bad);
  check(`invalid ${JSON.stringify(bad)} does not project`, !failed.valid && projectEqualTubeElbow(failed) === null);
}

/* Boundary case L = max cut-back: valid, deepest cut exactly 0 mm (U6.1 rule). */
const boundary = valid({ lengthMm: 2 * Math.sqrt(114.3 * (77.92 / 2)), innerDiameterMm: 77.92, outerDiameterMm: 88.9, elbowCenterlineRadiusMm: 114.3, divisions: 8 });
const boundaryDisplay = projectEqualTubeElbow(boundary);
check('boundary L = max cut-back projects', boundaryDisplay !== null);
if (boundaryDisplay) {
  const deepest = Math.min(...boundaryDisplay.rows.map(r => Number(r.tubeCota)));
  check('boundary deepest cota is 0', Math.abs(deepest) <= 5e-4, `${deepest}`);
  check('boundary markFromEnd max = L', Math.abs(Math.max(...boundaryDisplay.rows.map(r => Number(r.markFromEnd))) - boundary.lengthMm) <= 5e-3);
}

if (failures.length > 0) {
  console.error(`equal-tube-elbow display: ${failures.length} FAIL`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`equal-tube-elbow display: ${passed} PASS / 0 FAIL`);
