/**
 * PB-PIPE-COMB-CORRECTION-001 / P4 — diagram model tests for the two-elbow
 * offset tool.
 *
 * The model under test (two-elbow-offset-diagram.ts) turns the frozen engine
 * solution into drawing geometry. These tests treat that geometry as a black
 * box and verify it against an INDEPENDENT reconstruction built from engine
 * outputs via axis intersections and arc take-out geometry — never by
 * copying the model's own sampling formulas.
 *
 * A sign mutation, a take-out subtracted once instead of twice, a swapped
 * advance/travel, or a missing turn fails these assertions.
 *
 * Run: node --experimental-strip-types scripts/test-two-elbow-offset-diagram.ts
 */

import { solvePipeComb, type PipeCombLineResult } from '../app/frontend/src/tools/core/geometry/pipe-comb.ts';
import {
  buildTwoElbowOffsetDiagram,
  type DiagramPoint,
  type TwoElbowOffsetDiagramModel,
} from '../app/frontend/src/tools/prefabrication/two-elbow-offset/two-elbow-offset-diagram.ts';

const DEG_TO_RAD = Math.PI / 180;

let passed = 0;
let failed = 0;

function check(cond: boolean, label: string): void {
  if (cond) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

function approx(actual: number, expected: number, tol: number, label: string): void {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  if (!ok) console.error(`  actual=${actual} expected=${expected} tol=${tol}`);
  check(ok, label);
}

function tolFor(magnitude: number): number {
  return Math.max(1e-6, Math.abs(magnitude) * 1e-9);
}

function dist(a: DiagramPoint, b: DiagramPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Direction of segment a→b as an angle (rad, SVG y-down space). */
function segAngle(a: DiagramPoint, b: DiagramPoint): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/** Signed smallest difference between two angles (rad). */
function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * Independent expectations for one displaced line, from the engine outputs
 * only (no model code): the jog connects entry axis y=yIn to exit axis
 * y=yOut through two PIs separated by (advance, offset).
 */
interface IndependentJog {
  pi1: DiagramPoint;
  pi2: DiagramPoint;
  entryTangent: DiagramPoint;
  exitTangent: DiagramPoint;
  diagStart: DiagramPoint;
  diagEnd: DiagramPoint;
  turnRad: number;
}

function independentJog(
  line: PipeCombLineResult,
  pi1x: number,
  yIn: number,
  yOut: number,
): IndependentJog {
  const t = line.takeOutPerElbowMm;
  const pi1 = { x: pi1x, y: yIn };
  const pi2 = { x: pi1x + line.advanceMm, y: yOut };
  const travel = line.travelMm;
  const ux = (pi2.x - pi1.x) / travel;
  const uy = (pi2.y - pi1.y) / travel;
  return {
    pi1,
    pi2,
    entryTangent: { x: pi1.x - t, y: yIn },
    exitTangent: { x: pi2.x + t, y: yOut },
    diagStart: { x: pi1.x + t * ux, y: pi1.y + t * uy },
    diagEnd: { x: pi2.x - t * ux, y: pi2.y - t * uy },
    turnRad: Math.atan2(uy, ux),
  };
}

function assertDisplacedLine(
  model: TwoElbowOffsetDiagramModel,
  lineId: string,
  line: PipeCombLineResult,
  yIn: number,
  yOut: number,
  clrMm: number,
  label: string,
): void {
  const ml = model.lines.find((l) => l.id === lineId);
  check(ml !== undefined && ml.kind === 'displaced', `${label}: displaced line present`);
  if (!ml || ml.kind !== 'displaced' || !ml.pi1 || !ml.pi2 || !ml.theoretical) return;

  // The model is free to place PI1 anywhere on the x axis (display-only
  // alignment), so reconstruct the jog around the model's own PI1 station
  // and verify everything else against engine-derived expectations.
  const jog = independentJog(line, ml.pi1.x, yIn, yOut);

  approx(ml.pi1.y, yIn, 1e-9, `${label}: PI1 on entry axis`);
  approx(ml.pi2.x, jog.pi2.x, tolFor(jog.pi2.x), `${label}: PI2 x = PI1 + advance`);
  approx(ml.pi2.y, yOut, 1e-6, `${label}: PI2 on exit axis (signed offset)`);

  // Assembly polyline: starts at the entry tangent, ends at the exit tangent.
  const asm = ml.assembly;
  check(asm.length > 8, `${label}: assembly sampled`);
  const first = asm[0];
  const last = asm[asm.length - 1];
  approx(first.x, jog.entryTangent.x, tolFor(jog.entryTangent.x), `${label}: assembly starts at entry tangent`);
  approx(first.y, yIn, 1e-6, `${label}: assembly starts on entry axis`);
  approx(last.x, jog.exitTangent.x, tolFor(jog.exitTangent.x), `${label}: assembly ends at exit tangent`);
  approx(last.y, yOut, 1e-6, `${label}: assembly ends on exit axis`);

  // Two turns: the radius at each assembly endpoint is perpendicular to the
  // horizontal axes (tangency), and the path turns by +θ then −θ (the sign
  // follows the offset direction). Chord directions are NOT used as tangent
  // directions (a chord lags the tangent by half a sampling step).
  const s = line.offsetMm >= 0 ? 1 : -1;
  const c1 = { x: jog.entryTangent.x, y: jog.entryTangent.y + s * clrMm };
  const c2 = { x: jog.exitTangent.x, y: jog.exitTangent.y - s * clrMm };
  approx(first.x, c1.x, 1e-6, `${label}: entry tangent radius vertical (horizontal tangent)`);
  approx(last.x, c2.x, 1e-6, `${label}: exit tangent radius vertical (horizontal tangent)`);

  // Turn angles are asserted EXACTLY from the theoretical axes (chord sums
  // lag the true angle by sampling-step fractions and are not used here):
  // entry axis horizontal, diagonal at ±θ, exit axis horizontal.
  const th = ml.theoretical!;
  const entryAngle = segAngle(th.entryAxis.from, th.entryAxis.to);
  const diagAngle = segAngle(th.diagonalAxis.from, th.diagonalAxis.to);
  const exitAngle = segAngle(th.exitAxis.from, th.exitAxis.to);
  approx(entryAngle, 0, 1e-9, `${label}: theoretical entry axis horizontal`);
  approx(exitAngle, 0, 1e-9, `${label}: theoretical exit axis horizontal (parallel)`);
  approx(diagAngle, jog.turnRad, tolFor(jog.turnRad), `${label}: diagonal at exactly θ (two turns of θ)`);

  // Smoothness guard: no kinks — consecutive chord direction changes never
  // exceed one arc sampling step, and their signed sum returns to zero.
  let totalTurn = 0;
  let maxStep = 0;
  for (let k = 1; k < asm.length - 1; k++) {
    const a0 = segAngle(asm[k - 1], asm[k]);
    const a1 = segAngle(asm[k], asm[k + 1]);
    const d = angleDiff(a1, a0);
    totalTurn += d;
    maxStep = Math.max(maxStep, Math.abs(d));
  }
  const samplingStep = Math.abs(jog.turnRad) / 24;
  check(maxStep <= samplingStep + 1e-6, `${label}: tangent-continuous, no kinks (max step ${maxStep.toFixed(5)})`);
  approx(totalTurn, 0, samplingStep, `${label}: net chord turn zero (exit parallel to entry)`);

  // Tangent points: diagonal endpoints at distance take-out from the PIs,
  // separated by exactly the engine's straight cut.
  const tp = ml.tangentPoints;
  check(tp.length === 4, `${label}: four tangent points`);
  approx(dist(tp[1], ml.pi1), line.takeOutPerElbowMm, tolFor(line.takeOutPerElbowMm), `${label}: B at take-out from PI1`);
  approx(dist(tp[2], ml.pi2), line.takeOutPerElbowMm, tolFor(line.takeOutPerElbowMm), `${label}: D at take-out from PI2`);
  // The engine rounds travel/take-out/cut to 6 decimals; B/D are placed from
  // two of those rounded values, so the compounded rounding bound is 5e-6.
  approx(dist(tp[1], tp[2]), line.straightCutLengthMm, tolFor(line.straightCutLengthMm) + 5e-6, `${label}: |B−D| = straight cut`);
  approx(tp[0].x, jog.entryTangent.x, tolFor(jog.entryTangent.x), `${label}: entry tangent point x`);
  approx(tp[3].x, jog.exitTangent.x, tolFor(jog.exitTangent.x), `${label}: exit tangent point x`);

  // Arc radius: the first 25 assembly points are arc 1 by construction
  // (index-based: at 90° the vertical diagonal makes any x-based filter
  // ambiguous). Each must sit at distance CLR from the recovered center.
  let maxR1 = 0;
  for (const p of asm.slice(0, 25)) {
    maxR1 = Math.max(maxR1, Math.abs(dist(p, c1) - clrMm));
  }
  check(maxR1 < 1e-6, `${label}: arc 1 radius = CLR (max dev ${maxR1.toExponential(2)})`);

  // zeroCut flag coherence.
  check(ml.zeroCut === (line.straightCutLengthMm === 0), `${label}: zeroCut flag matches engine cut`);
}

function buildModel(
  input: Parameters<typeof solvePipeComb>[0],
  label: string,
): { model: TwoElbowOffsetDiagramModel; lines: PipeCombLineResult[]; clr: number } | null {
  const res = solvePipeComb(input);
  if (!res.success) {
    failed++;
    console.error(`FAIL: ${label}: engine rejected valid case: ${res.code}`);
    return null;
  }
  return { model: buildTwoElbowOffsetDiagram(res.result, input.clrMm), lines: res.result.lines, clr: input.clrMm };
}

/* ------------------------------------------------------------------ *
 * 1. Expanding comb, 45° — full reconstruction per line.
 * ------------------------------------------------------------------ */

{
  const ctx = buildModel(
    { lineCount: 4, initialSpacingMm: 200, finalSpacingMm: 400, elbowAngleDeg: 45, clrMm: 152.4 },
    'D1',
  );
  if (ctx) {
    const { model, lines, clr } = ctx;
    check(model.allStraight === false, 'D1: not all straight');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const yIn = i * 200;
      const yOut = i * 400;
      if (line.offsetAbsMm === 0) {
        const ml = model.lines.find((l) => l.id === line.id);
        check(ml?.kind === 'reference' && ml.straightRun !== null, 'D1: reference line straight run');
        if (ml?.straightRun) {
          approx(ml.straightRun.from.y, yIn, 1e-9, 'D1: reference run on its axis');
          approx(ml.straightRun.to.y, yOut, 1e-9, 'D1: reference run horizontal (yIn = yOut)');
        }
      } else {
        assertDisplacedLine(model, line.id, line, yIn, yOut, clr, `D1 L${line.id}`);
      }
    }
    // Common PI1 station across displaced lines (display-only alignment).
    const stations = model.lines.filter((l) => l.pi1).map((l) => l.pi1!.x);
    check(new Set(stations.map((x) => x.toFixed(9))).size === 1, 'D1: common PI1 station (documented alignment)');

    // Dimensions: spacings + representative full set.
    const dims = model.dimensions;
    const di = dims.find((d) => d.labelKey === 'spacingInitial');
    const df = dims.find((d) => d.labelKey === 'spacingFinal');
    check(di !== undefined && approxLen(di!.from, di!.to, 200), 'D1: initial spacing dim = 200');
    check(df !== undefined && approxLen(df!.from, df!.to, 400), 'D1: final spacing dim = 400');
    check(di?.valueMm === 200 && df?.valueMm === 400, 'D1: spacing dim values from inputs');
    const repId = model.dimensionedLineId;
    check(repId === '4', 'D1: most displaced line carries the dimensions');
    const off = dims.find((d) => d.labelKey === 'offset');
    const adv = dims.find((d) => d.labelKey === 'advance');
    const trv = dims.find((d) => d.labelKey === 'travel');
    const cut = dims.find((d) => d.labelKey === 'straightCut');
    check(off !== undefined && approxLen(off!.from, off!.to, 600), 'D1: offset dim = |offset| of L4');
    check(adv !== undefined && approxLen(adv!.from, adv!.to, 600), 'D1: advance dim = advance of L4 (45°)');
    check(trv !== undefined && approxLen(trv!.from, trv!.to, 600 * Math.SQRT2), 'D1: travel dim = travel of L4');
    check(cut !== undefined && approxLen(cut!.from, cut!.to, lines[3].straightCutLengthMm), 'D1: cut dim = engine cut');
    check(model.angleMark !== null && model.angleMark!.angleDeg === 45, 'D1: angle mark 45°');
    check(model.angleMark!.toDir.y > 0, 'D1: expanding diagonal points down (sign visible)');
  }
}

function approxLen(a: DiagramPoint, b: DiagramPoint, expected: number): boolean {
  return Math.abs(dist(a, b) - expected) <= tolFor(expected);
}

/* ------------------------------------------------------------------ *
 * 2. Contracting comb — negative offsets drawn upward.
 * ------------------------------------------------------------------ */

{
  const ctx = buildModel(
    { lineCount: 3, initialSpacingMm: 400, finalSpacingMm: 200, elbowAngleDeg: 45, clrMm: 100 },
    'D2',
  );
  if (ctx) {
    const { model, lines, clr } = ctx;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.offsetAbsMm > 0) {
        assertDisplacedLine(model, line.id, line, i * 400, i * 200, clr, `D2 L${line.id}`);
        const ml = model.lines.find((l) => l.id === line.id)!;
        check(ml.pi2!.y < ml.pi1!.y, `D2 L${line.id}: contracting jog goes up (sign preserved)`);
      }
    }
    check(model.angleMark!.toDir.y < 0, 'D2: contracting diagonal points up');
  }
}

/* ------------------------------------------------------------------ *
 * 3. Equal spacings — every line straight, no fabricated elbows/dims.
 * ------------------------------------------------------------------ */

{
  const ctx = buildModel(
    { lineCount: 4, initialSpacingMm: 300, finalSpacingMm: 300, elbowAngleDeg: 45, clrMm: 100 },
    'D3',
  );
  if (ctx) {
    const { model } = ctx;
    check(model.allStraight === true, 'D3: all straight');
    check(model.lines.every((l) => l.kind === 'reference' && l.straightRun), 'D3: all runs straight');
    check(model.dimensionedLineId === null && model.angleMark === null, 'D3: no representative dims');
    check(
      model.dimensions.every((d) => d.labelKey === 'spacingInitial' || d.labelKey === 'spacingFinal'),
      'D3: only spacing dimensions remain',
    );
  }
}

/* ------------------------------------------------------------------ *
 * 4. Zero intermediate cut — elbows tangent, no cut dimension.
 * ------------------------------------------------------------------ */

{
  const r = 100;
  const theta = 45 * DEG_TO_RAD;
  const deltaZero = 2 * r * Math.tan(theta / 2) * Math.sin(theta);
  const ctx = buildModel(
    { lineCount: 2, initialSpacingMm: 500, finalSpacingMm: 500 + deltaZero, elbowAngleDeg: 45, clrMm: r },
    'D4',
  );
  if (ctx) {
    const { model, lines } = ctx;
    const ml = model.lines.find((l) => l.id === '2')!;
    check(ml.zeroCut === true, 'D4: zeroCut flagged');
    check(!model.dimensions.some((d) => d.labelKey === 'straightCut'), 'D4: no degenerate cut dimension');
    // Assembly stays continuous: arc1 end coincides with arc2 start.
    const tp = ml.tangentPoints;
    approx(dist(tp[1], tp[2]), 0, 1e-6, 'D4: tangent elbows touch (B = D)');
    // Line 2 axes: entry y = 1·500, exit y = 1·(500 + δ).
    assertDisplacedLine(model, '2', lines[1], 500, 500 + deltaZero, r, 'D4 L2');
  }
}

/* ------------------------------------------------------------------ *
 * 5. 90° limit — vertical jog, advance ≈ 0.
 * ------------------------------------------------------------------ */

{
  const ctx = buildModel(
    { lineCount: 2, initialSpacingMm: 400, finalSpacingMm: 800, elbowAngleDeg: 90, clrMm: 152.4 },
    'D5',
  );
  if (ctx) {
    const { model, lines, clr } = ctx;
    // Line 2 axes: entry y = 1·400, exit y = 1·800.
    assertDisplacedLine(model, '2', lines[1], 400, 800, clr, 'D5 L2');
    const ml = model.lines.find((l) => l.id === '2')!;
    check(Math.abs(ml.pi2!.x - ml.pi1!.x) < 1e-9 * 400, 'D5: PIs vertically aligned at 90°');
    approx(ml.pi2!.y - ml.pi1!.y, 400, 1e-9, 'D5: vertical travel = offset');
  }
}

/* ------------------------------------------------------------------ *
 * 6. N = 12 — every displaced line reconstructed; ids match the engine.
 * ------------------------------------------------------------------ */

{
  const ctx = buildModel(
    { lineCount: 12, initialSpacingMm: 150, finalSpacingMm: 250, elbowAngleDeg: 30, clrMm: 50 },
    'D6',
  );
  if (ctx) {
    const { model, lines, clr } = ctx;
    check(model.lines.length === 12, 'D6: twelve lines drawn');
    check(model.dimensionedLineId === '12', 'D6: L12 dimensioned');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.offsetAbsMm > 0) {
        assertDisplacedLine(model, line.id, line, i * 150, i * 250, clr, `D6 L${line.id}`);
      }
    }
    check(model.lines[0].kind === 'reference', 'D6: L1 reference straight');
  }
}

/* ------------------------------------------------------------------ *
 * 7. Bounds contain the whole drawing.
 * ------------------------------------------------------------------ */

{
  const ctx = buildModel(
    { lineCount: 4, initialSpacingMm: 200, finalSpacingMm: 400, elbowAngleDeg: 45, clrMm: 152.4 },
    'D7',
  );
  if (ctx) {
    const { model } = ctx;
    const { minX, maxX, minY, maxY } = model.bounds;
    check(minX <= 0 && maxX > 0 && minY <= 0 && maxY >= 3 * 400, 'D7: bounds cover axes');
    for (const ml of model.lines) {
      for (const p of ml.assembly) {
        check(p.x >= minX - 1e-9 && p.x <= maxX + 1e-9 && p.y >= minY - 1e-9 && p.y <= maxY + 1e-9, 'D7: assembly inside bounds');
      }
    }
  }
}

/* ------------------------------------------------------------------ */

console.log(`\ntwo-elbow-offset diagram: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('TWO-ELBOW-OFFSET DIAGRAM: PASS');
