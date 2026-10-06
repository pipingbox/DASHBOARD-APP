/**
 * PB-PIPE-COMB-CORRECTION-001 / P1 — genuine pipe comb stagger kernel tests.
 *
 * Sections:
 *   1. Genuine Tubero source corpus (5 refs, one-decimal display tolerance)
 *   2. Full-precision independent references (IEEE tolerance)
 *   3. 90-degree invariant (A = Df)
 *   4. Equal-spacing invariant (Di = Df does NOT imply A = 0)
 *   5. Zero-stagger invariant (Df = Di*cos(theta) -> exact 0) + noise policy
 *   6. Negative-stagger invariant (signed, no abs)
 *   7. Multi-pipe cumulative invariant (N = 2, 3, 4, 12)
 *   8. Linearity / scaling invariant (k = 2, k = 0.5)
 *   9. Angle coverage (15, 22.5, 30, 45, 60, 90, 37) + explicit-intersection
 *      independent cross-check (different algorithm, not the frozen formula)
 *  10. Small positive angle (0.1 deg)
 *  11. Invalid input matrix (NaN / Infinity / 0 / negative / bad counts)
 *  11b. Computational resource-safety boundary (10_000 / 10_001 / MAX_SAFE_INTEGER)
 *
 * Run: node --experimental-strip-types scripts/test-pipe-comb-stagger-geometry.ts
 */

import {
  solvePipeCombStagger,
  type PipeCombStaggerInput,
  type PipeCombStaggerSolution,
} from '../app/frontend/src/tools/core/geometry/pipe-comb-stagger.ts';
import {
  PIPE_COMB_STAGGER_REFERENCES,
  PIPE_COMB_STAGGER_REFERENCE_COUNT,
} from './fixtures/pipe-comb-stagger-reference.ts';

let passed = 0;
const failures: string[] = [];
function check(label: string, condition: boolean, detail = ''): void {
  if (condition) passed++;
  else failures.push(`${label}${detail ? ': ' + detail : ''}`);
}
function near(actual: number, expected: number, tolerance = 1e-9): boolean {
  return Math.abs(actual - expected) <= tolerance;
}
function solve(input: PipeCombStaggerInput): PipeCombStaggerSolution {
  const result = solvePipeCombStagger(input);
  if (!result.success) {
    throw new Error(`unexpected invalid geometry: ${result.code} ${result.reason} for ${JSON.stringify(input)}`);
  }
  return result.result;
}
function expectFail(input: Partial<PipeCombStaggerInput>, code: string): void {
  const result = solvePipeCombStagger({ pipeCount: 4, initialSpacingMm: 200, finalSpacingMm: 400, elbowAngleDeg: 45, ...input });
  check(
    `${code} <- ${JSON.stringify(input)}`,
    !result.success && result.code === code,
    JSON.stringify(result),
  );
}

// ---------------------------------------------------------------------------
// 1. Genuine Tubero source corpus
// ---------------------------------------------------------------------------
console.log('--- 1. Genuine source corpus (display tolerance 0.05 mm) ---');
const DISPLAY_TOL = 0.05;
const sourceResiduals: number[] = [];
for (const ref of PIPE_COMB_STAGGER_REFERENCES) {
  const sol = solve({
    pipeCount: 2,
    initialSpacingMm: ref.initialSpacingMm,
    finalSpacingMm: ref.finalSpacingMm,
    elbowAngleDeg: ref.elbowAngleDeg,
  });
  const residual = Math.abs(sol.adjacentStaggerMm - ref.sourceDisplayedStaggerMm);
  sourceResiduals.push(residual);
  const match = residual <= DISPLAY_TOL + 1e-9;
  check(`${ref.id} source MATCH`, match, `${sol.adjacentStaggerMm} vs displayed ${ref.sourceDisplayedStaggerMm}`);
  console.log(
    `${ref.id}  Di=${ref.initialSpacingMm} Df=${ref.finalSpacingMm} theta=${ref.elbowAngleDeg}deg  `
      + `kernel=${sol.adjacentStaggerMm.toFixed(6)}  source=${ref.sourceDisplayedStaggerMm}  `
      + `residual=${residual.toFixed(6)}  ${match ? 'MATCH' : 'MISMATCH'}`,
  );
}
const sourceMatches = sourceResiduals.filter((r) => r <= DISPLAY_TOL + 1e-9).length;
const maxSourceResidual = Math.max(...sourceResiduals);
const rmsSourceResidual = Math.sqrt(
  sourceResiduals.reduce((sum, r) => sum + r ** 2, 0) / sourceResiduals.length,
);
check('source corpus 5/5 MATCH', sourceMatches === PIPE_COMB_STAGGER_REFERENCE_COUNT);
check('source corpus count is 5', PIPE_COMB_STAGGER_REFERENCE_COUNT === 5);
console.log(
  `source corpus: ${sourceMatches}/${PIPE_COMB_STAGGER_REFERENCE_COUNT} MATCH, `
    + `max residual=${maxSourceResidual.toFixed(4)} mm, RMS=${rmsSourceResidual.toFixed(4)} mm`,
);

// ---------------------------------------------------------------------------
// 2. Full-precision independent references
// ---------------------------------------------------------------------------
console.log('--- 2. Full-precision independent references (tol 1e-9) ---');
for (const ref of PIPE_COMB_STAGGER_REFERENCES) {
  const sol = solve({
    pipeCount: 2,
    initialSpacingMm: ref.initialSpacingMm,
    finalSpacingMm: ref.finalSpacingMm,
    elbowAngleDeg: ref.elbowAngleDeg,
  });
  check(
    `${ref.id} full precision`,
    near(sol.adjacentStaggerMm, ref.independentStaggerMm),
    `${sol.adjacentStaggerMm} vs ${ref.independentStaggerMm}`,
  );
  console.log(`${ref.id}  kernel=${sol.adjacentStaggerMm}  independent=${ref.independentStaggerMm}`);
}

// ---------------------------------------------------------------------------
// 3. 90-degree invariant: theta = 90 => A = Df regardless of Di
// ---------------------------------------------------------------------------
console.log('--- 3. 90-degree invariant ---');
for (const di of [100, 200, 500]) {
  const sol = solve({ pipeCount: 2, initialSpacingMm: di, finalSpacingMm: 400, elbowAngleDeg: 90 });
  check(`90deg Di=${di}: A = Df = 400`, near(sol.adjacentStaggerMm, 400), String(sol.adjacentStaggerMm));
  console.log(`90deg Di=${di} -> A=${sol.adjacentStaggerMm}`);
}
check('90deg direction positive', solve({ pipeCount: 2, initialSpacingMm: 200, finalSpacingMm: 400, elbowAngleDeg: 90 }).staggerDirection === 'positive');

// ---------------------------------------------------------------------------
// 4. Equal-spacing invariant: Di = Df does NOT imply A = 0
// ---------------------------------------------------------------------------
console.log('--- 4. Equal-spacing invariant ---');
{
  const sol = solve({ pipeCount: 3, initialSpacingMm: 200, finalSpacingMm: 200, elbowAngleDeg: 45 });
  check('Di=Df=200 @45: A = 82.842712474619006', near(sol.adjacentStaggerMm, 82.842712474619006002));
  check('Di=Df=200 @45: A != 0', sol.adjacentStaggerMm !== 0);
  check('Di=Df=200 @45: direction positive', sol.staggerDirection === 'positive');
  console.log(`Di=Df=200 @45 -> A=${sol.adjacentStaggerMm}`);
}
{
  // Generic proof sweep: for 0 < theta < 90 and Di > 0, A = Di*(1-cos)/sin > 0.
  for (const deg of [15, 22.5, 30, 45, 60, 89]) {
    const sol = solve({ pipeCount: 2, initialSpacingMm: 150, finalSpacingMm: 150, elbowAngleDeg: deg });
    check(`Di=Df=150 @${deg}: A > 0`, sol.adjacentStaggerMm > 0, String(sol.adjacentStaggerMm));
  }
}

// ---------------------------------------------------------------------------
// 5. Zero-stagger invariant + noise normalization policy
// ---------------------------------------------------------------------------
console.log('--- 5. Zero-stagger invariant ---');
{
  // Exact mathematical zero: Df = Di*cos(60deg) = 100.
  // IEEE cos(pi/3) = 0.5000000000000001, so the raw value is ~-3.3e-14 and
  // ONLY the conditioning-aware epsilon turns it into an exact 0.
  const sol = solve({ pipeCount: 3, initialSpacingMm: 200, finalSpacingMm: 100, elbowAngleDeg: 60 });
  check('Df=Di*cos(60): A is exactly 0', sol.adjacentStaggerMm === 0, String(sol.adjacentStaggerMm));
  check('Df=Di*cos(60): direction aligned', sol.staggerDirection === 'aligned');
  check('Df=Di*cos(60): all cumulatives exactly 0', sol.pipes.every((p) => p.cumulativeStaggerMm === 0));
  console.log(`Df=Di*cos(60) -> A=${sol.adjacentStaggerMm} (exact), direction=${sol.staggerDirection}`);
}
{
  // Machine-noise-level perturbation of the zero condition: still exactly 0.
  const sol = solve({ pipeCount: 2, initialSpacingMm: 200, finalSpacingMm: 100 + 1e-13, elbowAngleDeg: 60 });
  check('noise-level Df (100+1e-13): A normalized to exactly 0', sol.adjacentStaggerMm === 0, String(sol.adjacentStaggerMm));
}
{
  // Above-noise perturbation: preserved, NOT normalized (no blanket zeroing).
  const sol = solve({ pipeCount: 2, initialSpacingMm: 200, finalSpacingMm: 100 + 1e-9, elbowAngleDeg: 60 });
  check('Df=100+1e-9: A preserved (not zeroed)', sol.adjacentStaggerMm !== 0 && sol.adjacentStaggerMm > 0, String(sol.adjacentStaggerMm));
  check('Df=100+1e-9: A ~ 1.15e-9', near(sol.adjacentStaggerMm, 1e-9 / Math.sin(Math.PI / 3), 1e-12));
  console.log(`Df=100+1e-9 -> A=${sol.adjacentStaggerMm.toExponential(6)} (preserved)`);
}

// ---------------------------------------------------------------------------
// 6. Negative-stagger invariant (signed, never abs)
// ---------------------------------------------------------------------------
console.log('--- 6. Negative-stagger invariant ---');
{
  const A = -117.15728752538102242; // REF-03 independent literal
  const sol = solve({ pipeCount: 4, initialSpacingMm: 400, finalSpacingMm: 200, elbowAngleDeg: 45 });
  check('REF-03 params: A < 0', sol.adjacentStaggerMm < 0, String(sol.adjacentStaggerMm));
  check('REF-03 params: A = -117.157287525381', near(sol.adjacentStaggerMm, A));
  check('REF-03 params: direction negative', sol.staggerDirection === 'negative');
  for (let k = 0; k < 4; k++) {
    check(
      `REF-03 params: pipe ${k + 1} cumulative = ${k}*A`,
      near(sol.pipes[k].cumulativeStaggerMm, k * A),
      `${sol.pipes[k].cumulativeStaggerMm} vs ${k * A}`,
    );
  }
  console.log(
    'REF-03 params cumulatives: '
      + sol.pipes.map((p) => `P${p.pipeNumber}=${p.cumulativeStaggerMm.toFixed(6)}`).join(', '),
  );
}

// ---------------------------------------------------------------------------
// 7. Multi-pipe cumulative invariant
// ---------------------------------------------------------------------------
console.log('--- 7. Multi-pipe invariant (N = 2, 3, 4, 12) ---');
const A_REF01 = 365.68542494923804043;
for (const n of [2, 3, 4, 12]) {
  const sol = solve({ pipeCount: n, initialSpacingMm: 200, finalSpacingMm: 400, elbowAngleDeg: 45 });
  check(`N=${n}: pipes count`, sol.pipes.length === n && sol.pipeCount === n);
  check(`N=${n}: pipe numbers 1..N`, sol.pipes.every((p, i) => p.pipeNumber === i + 1));
  check(`N=${n}: pipe 1 cumulative exactly 0`, sol.pipes[0].cumulativeStaggerMm === 0);
  check(
    `N=${n}: last pipe cumulative = (N-1)*A`,
    near(sol.pipes[n - 1].cumulativeStaggerMm, (n - 1) * A_REF01),
  );
  for (let i = 0; i < n - 1; i++) {
    const delta = sol.pipes[i + 1].cumulativeStaggerMm - sol.pipes[i].cumulativeStaggerMm;
    check(`N=${n}: adjacent delta ${i + 1}->${i + 2} = A`, near(delta, A_REF01), String(delta));
  }
  console.log(`N=${n}: last cumulative=${sol.pipes[n - 1].cumulativeStaggerMm.toFixed(6)}`);
}

// ---------------------------------------------------------------------------
// 8. Linearity / scaling invariant
// ---------------------------------------------------------------------------
console.log('--- 8. Linearity / scaling ---');
{
  const k2 = solve({ pipeCount: 2, initialSpacingMm: 400, finalSpacingMm: 800, elbowAngleDeg: 45 });
  check('k=2: A scales by 2', near(k2.adjacentStaggerMm, 2 * A_REF01), String(k2.adjacentStaggerMm));
  const kHalf = solve({ pipeCount: 2, initialSpacingMm: 100, finalSpacingMm: 200, elbowAngleDeg: 45 });
  check('k=0.5: A scales by 0.5', near(kHalf.adjacentStaggerMm, 0.5 * A_REF01), String(kHalf.adjacentStaggerMm));
  console.log(`k=2 -> ${k2.adjacentStaggerMm}; k=0.5 -> ${kHalf.adjacentStaggerMm}`);
}

// ---------------------------------------------------------------------------
// 9. Angle coverage + independent explicit-intersection cross-check
// ---------------------------------------------------------------------------
console.log('--- 9. Angle coverage ---');
// Independent full-precision literals (Di=200, Df=400), derived offline.
const ANGLE_LITERALS: Record<string, number> = {
  '15': 799.07116054873392841,
  '22.5': 562.40765942648215514,
  '30': 453.58983848622455071,
  '37': 399.24709212491126209,
  '45': 365.68542494923804043,
  '60': 346.41016151377550614,
  '90': 400.0,
};
/**
 * Independent algorithm: explicit coordinate intersections, NOT the frozen
 * formula. Pipe k (0-based): initial axis y = k*Di (direction X); final axis
 * = k*Df*n + t*v with v = (cos t, sin t), n = (-sin t, cos t). Elbow of pipe
 * k sits at their intersection; the Tubero stagger is A = -(x_{k+1} - x_k).
 */
function staggerViaExplicitIntersections(Di: number, Df: number, thetaDeg: number): number {
  const t = (thetaDeg * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const xOf = (k: number): number => {
    const s = (k * (Di - Df * cos)) / sin;
    return -k * Df * sin + s * cos;
  };
  return -(xOf(1) - xOf(0));
}
for (const [degStr, expected] of Object.entries(ANGLE_LITERALS)) {
  const deg = Number(degStr);
  const sol = solve({ pipeCount: 2, initialSpacingMm: 200, finalSpacingMm: 400, elbowAngleDeg: deg });
  check(`angle ${degStr}: A = independent literal`, near(sol.adjacentStaggerMm, expected), String(sol.adjacentStaggerMm));
  const viaIntersections = staggerViaExplicitIntersections(200, 400, deg);
  check(`angle ${degStr}: matches explicit-intersection algorithm`, near(sol.adjacentStaggerMm, viaIntersections));
  console.log(`angle ${degStr} -> kernel=${sol.adjacentStaggerMm}  intersections=${viaIntersections}`);
}

// ---------------------------------------------------------------------------
// 10. Small positive angle
// ---------------------------------------------------------------------------
console.log('--- 10. Small positive angle ---');
{
  const sol = solve({ pipeCount: 2, initialSpacingMm: 200, finalSpacingMm: 400, elbowAngleDeg: 0.1 });
  check('0.1deg: finite success', Number.isFinite(sol.adjacentStaggerMm));
  check('0.1deg: A = 114591.7917367966', near(sol.adjacentStaggerMm, 114591.79173679655651, 1e-6), String(sol.adjacentStaggerMm));
  console.log(`0.1deg -> A=${sol.adjacentStaggerMm}`);
}

// ---------------------------------------------------------------------------
// 11. Invalid input matrix
// ---------------------------------------------------------------------------
console.log('--- 11. Invalid inputs ---');
for (const v of [NaN, Infinity, -Infinity]) {
  expectFail({ pipeCount: v }, 'non_finite_input');
  expectFail({ initialSpacingMm: v }, 'non_finite_input');
  expectFail({ finalSpacingMm: v }, 'non_finite_input');
  expectFail({ elbowAngleDeg: v }, 'non_finite_input');
}
for (const v of [0, -200]) {
  expectFail({ initialSpacingMm: v }, 'initial_spacing_positive');
  expectFail({ finalSpacingMm: v }, 'final_spacing_positive');
}
for (const v of [0, -30, 90.0001]) {
  expectFail({ elbowAngleDeg: v }, 'elbow_angle_range');
}
for (const v of [1, 2.5, 0]) {
  expectFail({ pipeCount: v }, 'pipe_count_range');
}
// Positive controls: valid boundary values must succeed.
check('pipeCount=2 valid', solve({ pipeCount: 2, initialSpacingMm: 200, finalSpacingMm: 400, elbowAngleDeg: 45 }).pipeCount === 2);
check('angle=90 valid', solve({ pipeCount: 2, initialSpacingMm: 200, finalSpacingMm: 400, elbowAngleDeg: 90 }).adjacentStaggerMm > 0);

// ---------------------------------------------------------------------------
// 11b. Computational resource-safety boundary (NOT a geometric limit)
// ---------------------------------------------------------------------------
console.log('--- 11b. Resource-safety boundary ---');
{
  // At the ceiling: full success, complete array, exact invariants.
  const sol = solve({ pipeCount: 10_000, initialSpacingMm: 200, finalSpacingMm: 400, elbowAngleDeg: 45 });
  check('10_000 pipes: SUCCESS with full array', sol.pipeCount === 10_000 && sol.pipes.length === 10_000);
  check('10_000 pipes: pipe 1 cumulative exactly 0', sol.pipes[0].cumulativeStaggerMm === 0);
  check('10_000 pipes: last pipe number is 10_000', sol.pipes[9_999].pipeNumber === 10_000);
  check(
    '10_000 pipes: last cumulative = 9999*A',
    near(sol.pipes[9_999].cumulativeStaggerMm, 9_999 * A_REF01, 1e-6),
    String(sol.pipes[9_999].cumulativeStaggerMm),
  );
  console.log(`10_000 pipes -> last cumulative=${sol.pipes[9_999].cumulativeStaggerMm.toFixed(6)}`);
}
// One above the ceiling: deterministic resource-limit failure, distinct from
// the geometric pipe_count_range code.
expectFail({ pipeCount: 10_001 }, 'pipe_count_resource_limit');
// Extreme integer: must fail immediately with the same resource-limit code,
// without attempting any allocation or iteration (validated before the loop).
expectFail({ pipeCount: Number.MAX_SAFE_INTEGER }, 'pipe_count_resource_limit');
{
  // Code sanity: 10_001 is still an integer >= 2, so it must NOT be
  // classified as pipe_count_range; params must carry the ceiling.
  const result = solvePipeCombStagger({ pipeCount: 10_001, initialSpacingMm: 200, finalSpacingMm: 400, elbowAngleDeg: 45 });
  check(
    '10_001: code pipe_count_resource_limit with max param 10000',
    !result.success && result.code === 'pipe_count_resource_limit' && result.params?.max === 10_000,
    JSON.stringify(result),
  );
  if (!result.success) console.log(`10_001 -> ${result.code} params=${JSON.stringify(result.params)}`);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('--- Summary ---');
console.log(`PASS ${passed} / ${passed + failures.length}`);
if (failures.length > 0) {
  console.error('FAILURES:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
} else {
  console.log('ALL PIPE COMB STAGGER GEOMETRY TESTS PASS');
}
