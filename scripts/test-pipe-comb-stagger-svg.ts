/**
 * PB-PIPE-COMB-CORRECTION-001 / P2 — pipe comb stagger SVG view-model tests.
 *
 * Validates the pure visualization model (no React) against the P1 kernel:
 *   - REF-01 positive stagger layout
 *   - REF-03 negative stagger layout (must genuinely reverse)
 *   - zero-stagger aligned layout (Di=200, Df=100, θ=60)
 *   - 90° layout (REF-05)
 * Invariants for every case:
 *   initial adjacent perpendicular spacing = Di
 *   final adjacent perpendicular spacing = Df (consistency identity)
 *   elbow longitudinal stagger = A (signed, from kernel)
 *   all final direction vectors parallel; all initial direction vectors parallel
 *   deterministic output, all coordinates finite, valid bounding box
 * Plus N = 2, 4, 12 pipe counts.
 *
 * The view model never recomputes the core law: stagger values are read
 * from the kernel solution, so these tests cannot pass by re-deriving A.
 *
 * Run: node --experimental-strip-types scripts/test-pipe-comb-stagger-svg.ts
 */

import {
  solvePipeCombStagger,
  type PipeCombStaggerSolution,
} from '../app/frontend/src/tools/core/geometry/pipe-comb-stagger.ts';
import { buildPipeCombStaggerViewModel } from '../app/frontend/src/tools/prefabrication/pipe-comb/pipe-comb-stagger-svg.ts';

let passed = 0;
const failures: string[] = [];
function check(label: string, condition: boolean, detail = ''): void {
  if (condition) passed++;
  else failures.push(`${label}${detail ? ': ' + detail : ''}`);
}
function near(actual: number, expected: number, tolerance = 1e-9): boolean {
  return Math.abs(actual - expected) <= tolerance;
}
function solve(pipeCount: number, di: number, df: number, deg: number): PipeCombStaggerSolution {
  const r = solvePipeCombStagger({
    pipeCount,
    initialSpacingMm: di,
    finalSpacingMm: df,
    elbowAngleDeg: deg,
  });
  if (!r.success) throw new Error(`unexpected invalid: ${r.code}`);
  return r.result;
}

interface CaseSpec {
  name: string;
  pipeCount: number;
  di: number;
  df: number;
  deg: number;
  expectedA: number;
}

const CASES: CaseSpec[] = [
  { name: 'REF-01 positive', pipeCount: 4, di: 200, df: 400, deg: 45, expectedA: 365.68542494923804043 },
  { name: 'REF-03 negative', pipeCount: 4, di: 400, df: 200, deg: 45, expectedA: -117.15728752538102242 },
  { name: 'zero-stagger aligned', pipeCount: 3, di: 200, df: 100, deg: 60, expectedA: 0 },
  { name: 'REF-05 90 degrees', pipeCount: 4, di: 200, df: 400, deg: 90, expectedA: 400 },
];

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

for (const c of CASES) {
  const sol = solve(c.pipeCount, c.di, c.df, c.deg);
  const vm = buildPipeCombStaggerViewModel(sol);
  const theta = (c.deg * Math.PI) / 180;
  const v = { x: Math.sin(theta), y: Math.cos(theta) };
  const normal = { x: Math.cos(theta), y: -Math.sin(theta) };
  const u = { x: 0, y: 1 };

  console.log(`--- ${c.name} (Di=${c.di}, Df=${c.df}, θ=${c.deg}°) ---`);

  check(`${c.name}: pipes count`, vm.pipes.length === c.pipeCount);
  check(`${c.name}: pipe numbers`, vm.pipes.every((p, i) => p.pipeNumber === i + 1));

  // All coordinates finite, no NaN/Infinity anywhere.
  const allFinite = vm.pipes.every(
    (p) =>
      [p.start.x, p.start.y, p.elbow.x, p.elbow.y, p.end.x, p.end.y].every(Number.isFinite),
  );
  const dimsFinite = [vm.dimInitial, vm.dimFinal, vm.dimStagger].every((d) =>
    [d.from.x, d.from.y, d.to.x, d.to.y, d.valueMm].every(Number.isFinite),
  );
  check(`${c.name}: all pipe coordinates finite`, allFinite);
  check(`${c.name}: all dimension coordinates finite`, dimsFinite);
  check(
    `${c.name}: angle arc finite`,
    Number.isFinite(vm.angleArc.center.x) && Number.isFinite(vm.angleArc.radiusMm) && vm.angleArc.radiusMm > 0,
  );

  // Valid bounding box.
  check(
    `${c.name}: valid bounding box`,
    vm.bounds.minX < vm.bounds.maxX && vm.bounds.minY < vm.bounds.maxY,
    JSON.stringify(vm.bounds),
  );
  const insideBounds = vm.pipes.every(
    (p) =>
      p.start.x >= vm.bounds.minX - 1e-6 && p.start.x <= vm.bounds.maxX + 1e-6 &&
      p.elbow.x >= vm.bounds.minX - 1e-6 && p.elbow.x <= vm.bounds.maxX + 1e-6 &&
      p.end.y >= vm.bounds.minY - 1e-6 && p.end.y <= vm.bounds.maxY + 1e-6,
  );
  check(`${c.name}: geometry inside bounds`, insideBounds);

  // Initial adjacent perpendicular spacing = Di (perp of u is +X).
  for (let k = 0; k < c.pipeCount - 1; k++) {
    const dx = vm.pipes[k + 1].elbow.x - vm.pipes[k].elbow.x;
    check(`${c.name}: initial spacing pipe ${k + 1}->${k + 2} = Di`, near(dx, c.di), String(dx));
  }

  // Final adjacent perpendicular spacing = Df (consistency identity, kernel A).
  for (let k = 0; k < c.pipeCount - 1; k++) {
    const ex = vm.pipes[k + 1].elbow.x - vm.pipes[k].elbow.x;
    const ey = vm.pipes[k + 1].elbow.y - vm.pipes[k].elbow.y;
    const df = ex * normal.x + ey * normal.y;
    check(`${c.name}: final spacing pipe ${k + 1}->${k + 2} = Df`, near(df, c.df), String(df));
  }

  // Elbow longitudinal stagger = signed A along u (E_k = (k·Di, −k·A)).
  for (let k = 0; k < c.pipeCount - 1; k++) {
    const alongU = (vm.pipes[k + 1].elbow.y - vm.pipes[k].elbow.y) * u.y;
    check(`${c.name}: stagger pipe ${k + 1}->${k + 2} = −A (signed)`, near(alongU, -c.expectedA), String(alongU));
  }

  // Dimension annotations carry the kernel values.
  check(`${c.name}: dimInitial value = Di`, near(vm.dimInitial.valueMm, c.di));
  check(`${c.name}: dimFinal value = Df`, near(vm.dimFinal.valueMm, c.df));
  check(`${c.name}: dimStagger value = A (signed)`, near(vm.dimStagger.valueMm, c.expectedA));

  // dimFinal lands exactly on pipe 2's final axis.
  {
    const { from, to } = vm.dimFinal;
    const seg = { x: to.x - from.x, y: to.y - from.y };
    check(`${c.name}: dimFinal length = Df`, near(Math.hypot(seg.x, seg.y), c.df));
    // to must lie on line through E_1 with direction v: (to − E_1) parallel v.
    const rel = { x: to.x - vm.pipes[1].elbow.x, y: to.y - vm.pipes[1].elbow.y };
    check(`${c.name}: dimFinal endpoint on pipe 2 final axis`, Math.abs(cross(rel.x, rel.y, v.x, v.y)) < 1e-6);
  }

  // All initial segments parallel to u; all final segments parallel to v.
  const initialParallel = vm.pipes.every((p) => {
    const s = { x: p.elbow.x - p.start.x, y: p.elbow.y - p.start.y };
    return Math.abs(cross(s.x, s.y, u.x, u.y)) < 1e-6;
  });
  const finalParallel = vm.pipes.every((p) => {
    const s = { x: p.end.x - p.elbow.x, y: p.end.y - p.elbow.y };
    return Math.abs(cross(s.x, s.y, v.x, v.y)) < 1e-6;
  });
  check(`${c.name}: initial axes parallel to u`, initialParallel);
  check(`${c.name}: final axes parallel to v`, finalParallel);

  // No collapse: distinct pipes keep distinct initial axes.
  const distinctX = new Set(vm.pipes.map((p) => p.elbow.x.toPrecision(12))).size === c.pipeCount;
  check(`${c.name}: distinct initial axes`, distinctX);

  // Determinism: rebuild and deep-compare.
  const vm2 = buildPipeCombStaggerViewModel(solve(c.pipeCount, c.di, c.df, c.deg));
  check(`${c.name}: deterministic output`, JSON.stringify(vm) === JSON.stringify(vm2));
}

// --- Direction-specific layout behavior -------------------------------------

// Positive vs negative must genuinely differ in longitudinal ordering.
{
  const pos = buildPipeCombStaggerViewModel(solve(4, 200, 400, 45));
  const neg = buildPipeCombStaggerViewModel(solve(4, 400, 200, 45));
  // Positive A: elbows descend (−u) with index; negative A: elbows ascend.
  const posDelta = pos.pipes[1].elbow.y - pos.pipes[0].elbow.y;
  const negDelta = neg.pipes[1].elbow.y - neg.pipes[0].elbow.y;
  check('positive layout: elbow 2 below elbow 1 (−u)', posDelta < 0, String(posDelta));
  check('negative layout: elbow 2 above elbow 1 (+u)', negDelta > 0, String(negDelta));
  check('positive vs negative layouts differ', posDelta * negDelta < 0);
  // The negative drawing is not merely the positive drawing with a minus
  // sign: the elbow sequence reverses its longitudinal ordering.
  const posOrder = pos.pipes.map((p) => p.elbow.y);
  const negOrder = neg.pipes.map((p) => p.elbow.y);
  check(
    'negative layout reverses longitudinal ordering',
    posOrder.every((y, i, a) => i === 0 || y < a[i - 1]) &&
      negOrder.every((y, i, a) => i === 0 || y > a[i - 1]),
  );
  console.log(
    `positive elbow Y sequence: ${posOrder.map((y) => y.toFixed(1)).join(', ')} | ` +
      `negative: ${negOrder.map((y) => y.toFixed(1)).join(', ')}`,
  );
}

// Aligned case: all elbow points on a common longitudinal level.
{
  const vm = buildPipeCombStaggerViewModel(solve(3, 200, 100, 60));
  const ys = vm.pipes.map((p) => p.elbow.y);
  check('aligned: all elbow Y equal', ys.every((y) => y === ys[0]), ys.join(', '));
  check('aligned: dimStagger degenerate to a point', vm.dimStagger.from.x === vm.dimStagger.to.x && vm.dimStagger.from.y === vm.dimStagger.to.y);
  check('aligned: bounding box still valid', vm.bounds.minY < vm.bounds.maxY);
}

// 90°: final direction perpendicular to initial; no degeneration.
{
  const vm = buildPipeCombStaggerViewModel(solve(4, 200, 400, 90));
  const seg = {
    x: vm.pipes[0].end.x - vm.pipes[0].elbow.x,
    y: vm.pipes[0].end.y - vm.pipes[0].elbow.y,
  };
  // v = (1, 0): dot with u = (0,1) must be 0 (perpendicular), not collapsed.
  check('90deg: final direction perpendicular to initial', Math.abs(seg.y) < 1e-9 && seg.x > 0);
  check('90deg: final segments non-degenerate', Math.hypot(seg.x, seg.y) > 1);
  check('90deg: viewBox non-degenerate', vm.bounds.maxX - vm.bounds.minX > 100 && vm.bounds.maxY - vm.bounds.minY > 100);
}

// --- Pipe counts -------------------------------------------------------------

for (const n of [2, 4, 12]) {
  const vm = buildPipeCombStaggerViewModel(solve(n, 200, 400, 45));
  check(`N=${n}: pipes length`, vm.pipes.length === n);
  check(
    `N=${n}: all finite`,
    vm.pipes.every((p) => [p.start.x, p.start.y, p.elbow.x, p.elbow.y, p.end.x, p.end.y].every(Number.isFinite)),
  );
  check(`N=${n}: bounds valid`, vm.bounds.minX < vm.bounds.maxX && vm.bounds.minY < vm.bounds.maxY);
  // Only the first adjacent pair carries Di/Df/A dimensions (readability).
  check(`N=${n}: single initial dimension`, near(vm.dimInitial.valueMm, 200));
  check(`N=${n}: single final dimension`, near(vm.dimFinal.valueMm, 400));
  console.log(`N=${n}: bounds w=${(vm.bounds.maxX - vm.bounds.minX).toFixed(1)} h=${(vm.bounds.maxY - vm.bounds.minY).toFixed(1)}`);
}

// ---------------------------------------------------------------------------
console.log('--- Summary ---');
console.log(`PASS ${passed} / ${passed + failures.length}`);
if (failures.length > 0) {
  console.error('FAILURES:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
} else {
  console.log('ALL PIPE COMB STAGGER SVG TESTS PASS');
}
