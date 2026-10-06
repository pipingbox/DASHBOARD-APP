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
import { buildPipeCombStaggerViewModel, buildPipeCombStaggerScreenLayout } from '../app/frontend/src/tools/prefabrication/pipe-comb/pipe-comb-stagger-svg.ts';

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
// P2 final-review fixes: real angle-arc path (H2) and screen layout (H3).
// ---------------------------------------------------------------------------

/** Reconstruct the centre of an SVG circular arc (SVG 1.1 F.6.5, phi = 0). */
function arcCenterFromPath(
  sx: number, sy: number, r: number, largeArc: number, sweep: number, ex: number, ey: number,
): { cx: number; cy: number } {
  const x1p = (sx - ex) / 2;
  const y1p = (sy - ey) / 2;
  const d2 = x1p * x1p + y1p * y1p;
  const coef = Math.sqrt(Math.max(0, (r * r - d2) / d2));
  const sign = largeArc !== sweep ? 1 : -1;
  return { cx: (sx + ex) / 2 + sign * coef * y1p, cy: (sy + ey) / 2 - sign * coef * x1p };
}

function parseArcPath(d: string) {
  const m = d.match(
    /M\s*([\d.eE+-]+)\s+([\d.eE+-]+)\s+A\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+0\s+0\s+([01])\s+([\d.eE+-]+)\s+([\d.eE+-]+)/,
  );
  if (!m) throw new Error(`unparseable arc path: ${d}`);
  return { sx: +m[1], sy: +m[2], r: +m[3], sweep: +m[5], ex: +m[6], ey: +m[7] };
}

for (const deg of [15, 45, 60, 90]) {
  for (const displayWidth of [288, 600]) {
    const layout = buildPipeCombStaggerScreenLayout(solve(4, 200, 400, deg), displayWidth);
    const p = parseArcPath(layout.angleArcPath);
    const elbow = layout.pipes[0].elbow;
    const center = arcCenterFromPath(p.sx, p.sy, p.r, 0, p.sweep, p.ex, p.ey);
    const off = Math.hypot(center.cx - elbow.x, center.cy - elbow.y);
    // Serialization bound: 6-decimal path rounding amplified through the
    // centre reconstruction; far below any visible pixel.
    const serTol = Math.max(1e-3, p.r * 1e-6);
    check(`H2 ${deg}deg@${displayWidth}: arc centred on elbow 1`, off <= serTol, `offset=${off}`);
    check(`H2 ${deg}deg@${displayWidth}: sweep flag 0`, p.sweep === 0);

    // Interior points of the arc keep a constant radius around the elbow.
    const a0 = Math.atan2(p.sy - center.cy, p.sx - center.cx);
    const a1 = Math.atan2(p.ey - center.cy, p.ex - center.cx);
    let delta = a1 - a0;
    // sweep=0 travels in the direction of decreasing screen angle.
    while (delta > 0) delta -= 2 * Math.PI;
    const apertureDeg = (-delta * 180) / Math.PI;
    check(`H2 ${deg}deg@${displayWidth}: aperture equals theta`, near(apertureDeg, deg, 1e-3),
      `aperture=${apertureDeg}`);
    let radiusOk = true;
    for (let i = 1; i < 12; i++) {
      const a = a0 + (delta * i) / 12;
      const px = center.cx + p.r * Math.cos(a);
      const py = center.cy + p.r * Math.sin(a);
      if (Math.abs(Math.hypot(px - center.cx, py - center.cy) - p.r) > 1e-6) radiusOk = false;
      // Interior arc points must lie on the arc, i.e. exactly r from the elbow.
      if (Math.abs(Math.hypot(px - elbow.x, py - elbow.y) - p.r) > serTol) radiusOk = false;
    }
    check(`H2 ${deg}deg@${displayWidth}: constant radius on interior points`, radiusOk);
    // Endpoints land on the two direction rays at distance r from the elbow.
    check(`H2 ${deg}deg@${displayWidth}: start endpoint on circle`,
      Math.abs(Math.hypot(p.sx - elbow.x, p.sy - elbow.y) - p.r) <= serTol);
    check(`H2 ${deg}deg@${displayWidth}: end endpoint on circle`,
      Math.abs(Math.hypot(p.ex - elbow.x, p.ey - elbow.y) - p.r) <= serTol);
  }
}

// H3: constant legible on-screen font size at any display width.
for (const displayWidth of [280, 320, 390, 600, 1200]) {
  const layout = buildPipeCombStaggerScreenLayout(solve(4, 200, 400, 45), displayWidth, 12);
  const effectivePx = layout.fontSize / layout.unitsPerPx;
  check(`H3 @${displayWidth}px: effective font >= 11px`, effectivePx >= 11, `${effectivePx}`);
  check(`H3 @${displayWidth}px: viewBox finite and positive`,
    Number.isFinite(layout.viewBox.w) && Number.isFinite(layout.viewBox.h) && layout.viewBox.w > 0 && layout.viewBox.h > 0);
  check(`H3 @${displayWidth}px: all pipe coordinates finite`,
    layout.pipes.every((p) => [p.start, p.elbow, p.end].every((q) => Number.isFinite(q.x) && Number.isFinite(q.y))));
}

// H3: label subset rule — N=12 at narrow width must not overlap, P1/PN stay.
{
  const layout = buildPipeCombStaggerScreenLayout(solve(12, 200, 400, 45), 288, 12);
  const labeled = layout.pipes.filter((p) => p.labelPos !== null);
  check('H3 N=12@288: P1 labeled', layout.pipes[0].labelPos !== null);
  check('H3 N=12@288: PN labeled', layout.pipes[11].labelPos !== null);
  check('H3 N=12@288: subset applied (fewer labels than pipes)', labeled.length < 12, `${labeled.length}`);
  let gapsOk = true;
  for (let i = 1; i < labeled.length; i++) {
    const gapPx = Math.abs(labeled[i].elbow.x - labeled[i - 1].elbow.x) / layout.unitsPerPx;
    if (gapPx < 12 * 5.5 + 8 - 1e-6) gapsOk = false;
  }
  check('H3 N=12@288: labeled elbows keep >= label pitch gap', gapsOk);
  // Wide display: every label fits again.
  const wide = buildPipeCombStaggerScreenLayout(solve(12, 200, 400, 45), 2400, 12);
  check('H3 N=12@2400: all pipes labeled when they fit',
    wide.pipes.every((p) => p.labelPos !== null));
}

// H3: geometry fidelity of the screen layout (pure translate+flip, scale 1).
for (const c of CASES) {
  const layout = buildPipeCombStaggerScreenLayout(solve(c.pipeCount, c.di, c.df, c.deg), 600);
  check(`H3 ${c.name}: screen Di preserved`,
    near(Math.hypot(layout.dimInitial.to.x - layout.dimInitial.from.x, layout.dimInitial.to.y - layout.dimInitial.from.y), c.di, 1e-9));
  check(`H3 ${c.name}: screen Df preserved`,
    near(Math.hypot(layout.dimFinal.to.x - layout.dimFinal.from.x, layout.dimFinal.to.y - layout.dimFinal.from.y), c.df, 1e-9));
  check(`H3 ${c.name}: screen stagger preserved`,
    near(Math.hypot(layout.dimStagger.to.x - layout.dimStagger.from.x, layout.dimStagger.to.y - layout.dimStagger.from.y), Math.abs(c.expectedA), 1e-9));
  const elbowGapX = layout.pipes[1].elbow.x - layout.pipes[0].elbow.x;
  check(`H3 ${c.name}: elbow pitch equals Di`, near(elbowGapX, c.di, 1e-9));
}

// H3: deterministic label placement — no two labels may overlap, ever.
{
  const rectsOverlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const placementCases = [
    ...CASES,
    { name: 'N=2', pipeCount: 2, di: 200, df: 400, deg: 45, expectedA: 365.68542494923804, direction: 'positive' as const },
    { name: 'tiny-A', pipeCount: 4, di: 200.04, df: 100, deg: 60, expectedA: -0.0230940107676, direction: 'negative' as const },
  ];
  for (const c of placementCases) {
    for (const displayWidth of [288, 358, 600, 900, 1280]) {
      const layout = buildPipeCombStaggerScreenLayout(solve(c.pipeCount, c.di, c.df, c.deg), displayWidth);
      const all: Array<{ x: number; y: number; w: number; h: number }> = [
        layout.labelRects.initial,
        layout.labelRects.final,
        layout.labelRects.stagger,
        layout.labelRects.angle,
        ...layout.labelRects.pipeLabels,
      ];
      let ok = true;
      let inside = true;
      for (let i = 0; i < all.length; i++) {
        const r = all[i];
        if (r.x < -1e-6 || r.y < -1e-6 || r.x + r.w > layout.viewBox.w + 1e-6 || r.y + r.h > layout.viewBox.h + 1e-6) {
          inside = false;
        }
        for (let j = i + 1; j < all.length; j++) {
          if (rectsOverlap(all[i], all[j])) ok = false;
        }
      }
      check(`H3 labels ${c.name}@${displayWidth}: no label-label overlap`, ok);
      check(`H3 labels ${c.name}@${displayWidth}: labels inside viewBox`, inside);
    }
  }
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
