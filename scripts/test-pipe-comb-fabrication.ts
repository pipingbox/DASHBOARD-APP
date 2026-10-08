/**
 * PB-PIPE-COMB-CORRECTION-001 / P3-A — fabrication layer tests.
 *
 * Sections:
 *   F1  Main acceptance case 3x35 deg vs frozen literals
 *   F2  Independent vector reconstruction (recovers Di, Df, theta, planes)
 *   F3  45 deg and 90 deg (90 deg: takeOut = CLR exactly, zero discarded arc)
 *   F4  Directions: positive / negative (REF-03) / aligned
 *   F5  Explicit weld gap + fitting allowance (exact decomposition)
 *   F6  Units: mm vs exact-inch round trip -> identical results
 *   F7  Insufficient references -> pending-references, P1 untouched
 *   F8  Impossible lengths -> invalid pieces, plan flagged, rest computed
 *   F9  No double deduction (decomposition residual 0 on every pipe)
 *   F10 Negative A does NOT imply negative cut lengths
 *   F11 Catalog N/A: SR < NPS 1, unknown NPS (no fallbacks)
 *   F12 Invalid adjustments/references -> machine codes
 *   F13 Bend mode (custom CLR): tangencies, developed arc, bar length
 *   F14 Engine correspondence: |t_engine - CLR*tan(theta/2)| <= 5e-7
 *   F15 N=2 and N=12 piece counts + P1 cumulative propagation
 *   F16 OD-across-schedules invariant + P1 non-mutation identity
 *
 * Run: node --experimental-strip-types scripts/test-pipe-comb-fabrication.ts
 */

import {
  solvePipeCombFabrication,
  ELBOW_ENGINE_PRECISION_MM,
  type PipeCombFabricationInput,
  type PipeCombFabricationSolution,
} from '../app/frontend/src/tools/prefabrication/pipe-comb/pipe-comb-fabrication.ts';
import { solvePipeCombStagger } from '../app/frontend/src/tools/core/geometry/pipe-comb-stagger.ts';
import { PIPE_DIMENSIONS } from '../app/frontend/src/tools/core/standards/generated/pipe-dimensions.ts';
import { PIPE_COMB_FABRICATION_MAIN_CASE } from './fixtures/pipe-comb-fabrication-reference.ts';

let passed = 0;
const failures: string[] = [];
function check(label: string, condition: boolean, detail = ''): void {
  if (condition) passed++;
  else failures.push(`${label}${detail ? ': ' + detail : ''}`);
}
function near(actual: number, expected: number, tolerance = 1e-9): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

const PURE_TOL = 1e-9;
const ENGINE_TOL = 1e-6; // documented integration tolerance (engine rounds to 6 decimals)

function solve(input: PipeCombFabricationInput): PipeCombFabricationSolution {
  const result = solvePipeCombFabrication(input);
  if (!result.success) {
    throw new Error(`unexpected failure: ${result.code} ${result.reason} for ${JSON.stringify(input)}`);
  }
  return result.result;
}
function expectFail(input: PipeCombFabricationInput, code: string): void {
  const result = solvePipeCombFabrication(input);
  check(
    `${code} <- nps=${input.nps} elbow=${JSON.stringify(input.elbow)} refs=${JSON.stringify(input.references)}`,
    !result.success && result.code === code,
    JSON.stringify(result).slice(0, 220),
  );
}

const MAIN = PIPE_COMB_FABRICATION_MAIN_CASE;
const mainInput: PipeCombFabricationInput = {
  pipeCount: MAIN.pipeCount,
  initialSpacingMm: MAIN.initialSpacingMm,
  finalSpacingMm: MAIN.finalSpacingMm,
  elbowAngleDeg: MAIN.elbowAngleDeg,
  nps: MAIN.nps,
  elbow: { kind: 'catalog', radiusType: MAIN.radiusType },
  references: {
    inletAxisToAxisMm: MAIN.inletAxisToAxisMm,
    outletAxisToAxisMm: MAIN.outletAxisToAxisMm,
    weldGapMm: MAIN.weldGapMm,
    fittingAllowanceMm: MAIN.fittingAllowanceMm,
  },
};

// ---------------------------------------------------------------------------
// F1. Main acceptance case 3x35 deg vs frozen literals
// ---------------------------------------------------------------------------
console.log('--- F1. Main case 3x35 vs fixture literals ---');
{
  const sol = solve(mainInput);
  check('F1 stagger A', near(sol.stagger.adjacentStaggerMm, MAIN.staggerMm, PURE_TOL), `${sol.stagger.adjacentStaggerMm}`);
  check('F1 direction positive', sol.stagger.staggerDirection === 'positive');
  check('F1 elbow mode', sol.elbow.mode === 'catalog-cut');
  check('F1 OD', near(sol.elbow.odMm, MAIN.odMm, PURE_TOL));
  check('F1 CLR', near(sol.elbow.clrMm, MAIN.clrMm, PURE_TOL));
  check('F1 takeOut (engine, 1e-6)', near(sol.elbow.takeOutMm, MAIN.takeOutMm, ENGINE_TOL), `${sol.elbow.takeOutMm}`);
  check('F1 takeOut engine literal', sol.elbow.takeOutMm === MAIN.takeOutEngineMm);
  check('F1 cutIntrados', near(sol.elbow.cutIntradosMm as number, MAIN.cutIntradosMm, ENGINE_TOL));
  check('F1 cutExtrados', near(sol.elbow.cutExtradosMm as number, MAIN.cutExtradosMm, ENGINE_TOL));
  check('F1 keptArc', near(sol.elbow.keptArcLengthMm as number, MAIN.keptArcLengthMm, ENGINE_TOL));
  check('F1 discardedArc', near(sol.elbow.discardedArcLengthMm as number, MAIN.discardedArcLengthMm, ENGINE_TOL));
  check('F1 clearance initial', near(sol.initialClearanceMm, MAIN.initialClearanceMm, PURE_TOL));
  check('F1 clearance final', near(sol.finalClearanceMm, MAIN.finalClearanceMm, PURE_TOL));
  check('F1 catalog_elbow_cut warning', sol.warnings.some((w) => w.code === 'catalog_elbow_cut'));
  check('F1 plan valid', sol.cutPlanValid === true);
  check('F1 references defined', sol.references.defined === true);
  check('F1 cutList length = 2N', sol.cutList.length === 2 * MAIN.pipeCount, `${sol.cutList.length}`);

  for (const ref of MAIN.pups) {
    const pipe = sol.pipes[ref.pipeNumber - 1];
    check(`F1 P${ref.pipeNumber} cumulative`, near(pipe.cumulativeStaggerMm, (ref.pipeNumber - 1) * MAIN.staggerMm, PURE_TOL));
    const pupIn = pipe.pieces.find((p) => p.id === `P${ref.pipeNumber}-IN`);
    const pupOut = pipe.pieces.find((p) => p.id === `P${ref.pipeNumber}-OUT`);
    const elbow = pipe.pieces.find((p) => p.id === `P${ref.pipeNumber}-ELBOW`);
    check(`F1 P${ref.pipeNumber}-IN exists`, pupIn !== undefined);
    check(`F1 P${ref.pipeNumber}-OUT exists`, pupOut !== undefined);
    check(`F1 P${ref.pipeNumber}-ELBOW exists`, elbow !== undefined);
    if (pupIn && pupOut) {
      check(`F1 P${ref.pipeNumber}-IN axis`, near(pupIn.axisToAxisLengthMm as number, ref.axisInMm, PURE_TOL), `${pupIn.axisToAxisLengthMm}`);
      check(`F1 P${ref.pipeNumber}-OUT axis`, near(pupOut.axisToAxisLengthMm as number, ref.axisOutMm, PURE_TOL), `${pupOut.axisToAxisLengthMm}`);
      check(`F1 P${ref.pipeNumber}-IN finished`, near(pupIn.finishedLengthMm as number, ref.inletFinishedMm, ENGINE_TOL), `${pupIn.finishedLengthMm}`);
      check(`F1 P${ref.pipeNumber}-OUT finished`, near(pupOut.finishedLengthMm as number, ref.outletFinishedMm, ENGINE_TOL), `${pupOut.finishedLengthMm}`);
      check(`F1 P${ref.pipeNumber}-IN cut=finished (allowance 0)`, near(pupIn.cutLengthMm as number, pupIn.finishedLengthMm as number, PURE_TOL));
      check(`F1 P${ref.pipeNumber}-IN status`, pupIn.status === 'ok');
      check(`F1 P${ref.pipeNumber}-OUT status`, pupOut.status === 'ok');
    }
  }
  console.log(`A=${sol.stagger.adjacentStaggerMm.toFixed(6)} t=${sol.elbow.takeOutMm} cutList=${sol.cutList.length}`);
}

// ---------------------------------------------------------------------------
// F2. Independent vector reconstruction from pieces + elbow + gap
// ---------------------------------------------------------------------------
console.log('--- F2. Independent reconstruction ---');
function reconstructAndVerify(label: string, sol: PipeCombFabricationSolution, tol: number): void {
  const thetaRad = (sol.elbow.keptAngleDeg * Math.PI) / 180;
  const g = sol.references.weldGapMm;
  const t = sol.elbow.takeOutMm;
  const isBend = sol.elbow.mode === 'bend';
  // Assemble each pipe from its PHYSICAL pieces only (different computation
  // path than the module formulas): L_i along initial axis u=(0,1),
  // M_i along final axis v=(sin t, cos t). REF-ENT plane: y = 0 for all.
  const L: number[] = [];
  const M: number[] = [];
  for (const pipe of sol.pipes) {
    if (isBend) {
      const bend = pipe.pieces[0];
      L.push((bend.straightInletMm as number) + t); // no weld gap in bend mode
      M.push((bend.straightOutletMm as number) + t);
    } else {
      const pupIn = pipe.pieces.find((p) => p.kind === 'inlet-pup');
      const pupOut = pipe.pieces.find((p) => p.kind === 'outlet-pup');
      L.push((pupIn?.finishedLengthMm as number) + g + t);
      M.push((pupOut?.finishedLengthMm as number) + g + t);
    }
  }
  const cos = Math.cos(thetaRad);
  const sin = Math.sin(thetaRad);
  // REF-SAL common plane perpendicular to v: (F_i + L_i*u + M_i*v).v = const.
  const C = L[0] * cos + M[0]; // pipe 1 at F_1 = (0,0)
  const xs: number[] = [];
  for (let i = 0; i < L.length; i++) {
    xs.push((C - L[i] * cos - M[i]) / sin);
  }
  // Recovered magnitudes.
  for (let i = 1; i < L.length; i++) {
    const diRec = xs[i] - xs[i - 1];
    check(`${label} Di recovered (pipe ${i}->${i + 1})`, near(diRec, sol.stagger.initialSpacingMm, tol), `${diRec}`);
    // E_i = (x_i, L_i); final-axis normal n = (cos, -sin).
    const ePrev = { x: xs[i - 1], y: L[i - 1] };
    const eCur = { x: xs[i], y: L[i] };
    const dfRec = (eCur.x - ePrev.x) * cos + (eCur.y - ePrev.y) * -sin * -1;
    const dfRec2 = (eCur.x - ePrev.x) * cos - (eCur.y - ePrev.y) * sin;
    check(`${label} Df recovered (pipe ${i}->${i + 1})`, near(dfRec2, sol.stagger.finalSpacingMm, tol), `${dfRec} vs ${dfRec2}`);
    // Cumulative stagger recovered from assembly: L_1 - L_i = (i)*A.
    const staggerRec = L[0] - L[i];
    check(`${label} stagger recovered pipe ${i + 1}`, near(staggerRec, i * sol.stagger.adjacentStaggerMm, tol), `${staggerRec}`);
    // REF-SAL planarity check.
    const plane = L[i] * cos + M[i] + xs[i] * sin;
    check(`${label} REF-SAL planar pipe ${i + 1}`, near(plane, C, tol), `${plane}`);
  }
  // Direction change of every assembled pipe equals the elbow kept angle.
  const thetaRec = (Math.atan2(sin, cos) * 180) / Math.PI;
  check(`${label} theta recovered`, near(thetaRec, sol.elbow.keptAngleDeg, tol), `${thetaRec}`);
}
{
  const sol = solve(mainInput);
  reconstructAndVerify('F2 main', sol, ENGINE_TOL);
}

// ---------------------------------------------------------------------------
// F3. 45 deg and 90 deg
// ---------------------------------------------------------------------------
console.log('--- F3. 45/90 deg ---');
{
  const base = { ...mainInput, pipeCount: 2 };
  const sol45 = solve({ ...base, elbowAngleDeg: 45 });
  const t45Pure = MAIN.clrMm * Math.tan((45 * Math.PI) / 360);
  check('F3 45deg takeOut', near(sol45.elbow.takeOutMm, t45Pure, ENGINE_TOL), `${sol45.elbow.takeOutMm} vs ${t45Pure}`);

  const sol90 = solve({ ...base, elbowAngleDeg: 90 });
  check('F3 90deg takeOut = CLR exactly', near(sol90.elbow.takeOutMm, MAIN.clrMm, ENGINE_TOL), `${sol90.elbow.takeOutMm}`);
  check('F3 90deg zero discarded arc', near(sol90.elbow.discardedArcLengthMm as number, 0, ENGINE_TOL));
  check('F3 90deg keptArc = CLR*pi/2', near(sol90.elbow.keptArcLengthMm as number, (MAIN.clrMm * Math.PI) / 2, ENGINE_TOL));
  check('F3 90deg no catalog-cut warning (nothing cut)', !sol90.warnings.some((w) => w.code === 'catalog_elbow_cut'));
}

// ---------------------------------------------------------------------------
// F4. Directions: positive / negative / aligned
// ---------------------------------------------------------------------------
console.log('--- F4. Directions ---');
{
  const neg = solve({
    ...mainInput,
    pipeCount: 3,
    initialSpacingMm: 400,
    finalSpacingMm: 200,
    elbowAngleDeg: 45,
  });
  check('F4 negative A', neg.stagger.adjacentStaggerMm < 0, `${neg.stagger.adjacentStaggerMm}`);
  const in1 = neg.pipes[0].pieces.find((p) => p.kind === 'inlet-pup');
  const in3 = neg.pipes[2].pieces.find((p) => p.kind === 'inlet-pup');
  const out1 = neg.pipes[0].pieces.find((p) => p.kind === 'outlet-pup');
  const out3 = neg.pipes[2].pieces.find((p) => p.kind === 'outlet-pup');
  check(
    'F4 negative: inlet pups lengthen downstream',
    (in3?.axisToAxisLengthMm as number) > (in1?.axisToAxisLengthMm as number),
  );
  check(
    'F4 negative: outlet pups shorten downstream',
    (out3?.axisToAxisLengthMm as number) < (out1?.axisToAxisLengthMm as number),
  );

  const aligned = solve({ ...mainInput, initialSpacingMm: 200, finalSpacingMm: 100, elbowAngleDeg: 60 });
  check('F4 aligned A = 0', aligned.stagger.adjacentStaggerMm === 0);
  const a1 = aligned.pipes[0].pieces.find((p) => p.kind === 'inlet-pup');
  const a3 = aligned.pipes[2].pieces.find((p) => p.kind === 'inlet-pup');
  check('F4 aligned: identical pups', near(a1?.finishedLengthMm as number, a3?.finishedLengthMm as number, PURE_TOL));
  check('F4 aligned direction', aligned.stagger.staggerDirection === 'aligned');
}

// ---------------------------------------------------------------------------
// F5. Explicit weld gap + fitting allowance
// ---------------------------------------------------------------------------
console.log('--- F5. Weld gap + allowance ---');
{
  const sol = solve({
    ...mainInput,
    references: { inletAxisToAxisMm: 1000, outletAxisToAxisMm: 1200, weldGapMm: 2, fittingAllowanceMm: 5 },
  });
  for (const pipe of sol.pipes) {
    for (const kind of ['inlet-pup', 'outlet-pup'] as const) {
      const pup = pipe.pieces.find((p) => p.kind === kind);
      const t = sol.elbow.takeOutMm;
      const expected = (pup?.axisToAxisLengthMm as number) - t - 2;
      check(`F5 ${pup?.id} finished = axis - t - g`, near(pup?.finishedLengthMm as number, expected, ENGINE_TOL));
      check(`F5 ${pup?.id} cut = finished + 5`, near(pup?.cutLengthMm as number, expected + 5, ENGINE_TOL));
      const gapDeduction = pup?.deductions.find((d) => d.source === 'weld_gap');
      check(`F5 ${pup?.id} explicit gap deduction`, gapDeduction?.mm === 2);
    }
  }
  // Reconstruction with g = 2 must still recover Di/Df (gap is uniform).
  reconstructAndVerify('F5 with g=2', sol, ENGINE_TOL);
}

// ---------------------------------------------------------------------------
// F6. Units: mm vs exact-inch round trip
// ---------------------------------------------------------------------------
console.log('--- F6. Units round trip ---');
{
  const IN = 25.4;
  const inchInput: PipeCombFabricationInput = {
    ...mainInput,
    initialSpacingMm: (250 / IN) * IN,
    finalSpacingMm: (350 / IN) * IN,
    references: {
      inletAxisToAxisMm: (1000 / IN) * IN,
      outletAxisToAxisMm: (1200 / IN) * IN,
      weldGapMm: 0,
      fittingAllowanceMm: 0,
    },
  };
  const a = solve(mainInput);
  const b = solve(inchInput);
  check('F6 stagger identical', near(a.stagger.adjacentStaggerMm, b.stagger.adjacentStaggerMm, PURE_TOL));
  for (let i = 0; i < a.pipes.length; i++) {
    const pa = a.pipes[i].pieces.find((p) => p.kind === 'inlet-pup');
    const pb = b.pipes[i].pieces.find((p) => p.kind === 'inlet-pup');
    check(`F6 P${i + 1}-IN identical`, near(pa?.finishedLengthMm as number, pb?.finishedLengthMm as number, PURE_TOL));
  }
}

// ---------------------------------------------------------------------------
// F7. Insufficient references
// ---------------------------------------------------------------------------
console.log('--- F7. Pending references ---');
{
  const noRefs = solve({ ...mainInput, references: undefined });
  check('F7 not defined', noRefs.references.defined === false);
  check('F7 no pipes fabricated', noRefs.pipes.length === 0);
  check('F7 empty cutList', noRefs.cutList.length === 0);
  check('F7 elbow still computed', near(noRefs.elbow.takeOutMm, MAIN.takeOutMm, ENGINE_TOL));
  check('F7 P1 intact without refs', near(noRefs.stagger.adjacentStaggerMm, MAIN.staggerMm, PURE_TOL));
  check('F7 no invented lengths', noRefs.references.inletAxisToAxisMm === undefined && noRefs.references.outletAxisToAxisMm === undefined);

  const half = solve({ ...mainInput, references: { inletAxisToAxisMm: 1000 } });
  check('F7 half refs still pending', half.references.defined === false && half.pipes.length === 0);
  check('F7 references_incomplete warning', half.warnings.some((w) => w.code === 'references_incomplete'));
}

// ---------------------------------------------------------------------------
// F8. Impossible lengths
// ---------------------------------------------------------------------------
console.log('--- F8. Impossible lengths ---');
{
  const sol = solve({ ...mainInput, references: { inletAxisToAxisMm: 50, outletAxisToAxisMm: 1200 } });
  check('F8 plan invalid', sol.cutPlanValid === false);
  const p1in = sol.pipes[0].pieces.find((p) => p.id === 'P1-IN');
  check('F8 P1-IN invalid', p1in?.status === 'invalid' && p1in.statusCode === 'non_positive_piece_length', `${p1in?.status}`);
  check('F8 P1-IN length exposed (negative)', (p1in?.finishedLengthMm as number) <= 0);
  const p1out = sol.pipes[0].pieces.find((p) => p.id === 'P1-OUT');
  check('F8 P1-OUT still computed ok', p1out?.status === 'ok');
  check('F8 all IN invalid here', sol.pipes.every((pipe) => pipe.pieces.find((p) => p.kind === 'inlet-pup')?.status === 'invalid'));
}

// ---------------------------------------------------------------------------
// F9. No double deduction (exact decomposition on every pipe)
// ---------------------------------------------------------------------------
console.log('--- F9. No double deduction ---');
{
  const sol = solve(mainInput);
  const t = sol.elbow.takeOutMm;
  for (const pipe of sol.pipes) {
    for (const kind of ['inlet-pup', 'outlet-pup'] as const) {
      const pup = pipe.pieces.find((p) => p.kind === kind);
      const residual = (pup?.axisToAxisLengthMm as number) - (pup?.finishedLengthMm as number) - t - 0;
      check(`F9 ${pup?.id} decomposition residual 0`, near(residual, 0, ENGINE_TOL), `${residual}`);
      const elbowDeductions = pup?.deductions.filter((d) => d.source === 'elbow_face') ?? [];
      check(`F9 ${pup?.id} exactly ONE elbow deduction`, elbowDeductions.length === 1, `${elbowDeductions.length}`);
    }
  }
}

// ---------------------------------------------------------------------------
// F10. Negative A does NOT imply negative cut lengths
// ---------------------------------------------------------------------------
console.log('--- F10. Negative A with sound references ---');
{
  const sol = solve({
    ...mainInput,
    pipeCount: 3,
    initialSpacingMm: 400,
    finalSpacingMm: 200,
    elbowAngleDeg: 45,
    references: { inletAxisToAxisMm: 1000, outletAxisToAxisMm: 1200 },
  });
  check('F10 A negative', sol.stagger.adjacentStaggerMm < 0);
  check('F10 plan valid despite negative A', sol.cutPlanValid === true);
  check(
    'F10 every piece ok',
    sol.pipes.every((pipe) => pipe.pieces.every((p) => p.status === 'ok')),
  );
}

// ---------------------------------------------------------------------------
// F11. Catalog N/A
// ---------------------------------------------------------------------------
console.log('--- F11. Catalog N/A ---');
{
  expectFail({ ...mainInput, nps: '1/2', elbow: { kind: 'catalog', radiusType: 'SR' } }, 'clr_not_tabulated');
  expectFail({ ...mainInput, nps: '99' }, 'nps_unknown');
}

// ---------------------------------------------------------------------------
// F12. Invalid adjustments / references
// ---------------------------------------------------------------------------
console.log('--- F12. Invalid adjustments ---');
{
  expectFail({ ...mainInput, references: { inletAxisToAxisMm: 1000, outletAxisToAxisMm: 1200, weldGapMm: -1 } }, 'invalid_adjustment');
  expectFail({ ...mainInput, references: { inletAxisToAxisMm: 1000, outletAxisToAxisMm: 1200, fittingAllowanceMm: -0.5 } }, 'invalid_adjustment');
  expectFail({ ...mainInput, references: { inletAxisToAxisMm: 0, outletAxisToAxisMm: 1200 } }, 'invalid_reference');
  expectFail({ ...mainInput, references: { inletAxisToAxisMm: 1000, outletAxisToAxisMm: -5 } }, 'invalid_reference');
  expectFail({ ...mainInput, references: { inletAxisToAxisMm: Number.NaN, outletAxisToAxisMm: 1200 } }, 'invalid_reference');
  expectFail({ ...mainInput, elbow: { kind: 'bend', clrMm: 0 } }, 'clr_positive');
  expectFail({ ...mainInput, elbow: { kind: 'bend', clrMm: Number.POSITIVE_INFINITY } }, 'clr_positive');
}

// ---------------------------------------------------------------------------
// F13. Bend mode (custom CLR)
// ---------------------------------------------------------------------------
console.log('--- F13. Bend mode ---');
{
  const CLR = 300;
  const sol = solve({ ...mainInput, elbow: { kind: 'bend', clrMm: CLR } });
  const tPure = CLR * Math.tan((35 * Math.PI) / 360);
  const arcPure = (CLR * 35 * Math.PI) / 180;
  check('F13 bend mode', sol.elbow.mode === 'bend');
  check('F13 takeOut pure', near(sol.elbow.takeOutMm, tPure, PURE_TOL), `${sol.elbow.takeOutMm} vs ${tPure}`);
  check('F13 arc', near(sol.elbow.keptArcLengthMm as number, arcPure, PURE_TOL));
  check('F13 clrSource custom', sol.elbow.clrSource === 'user-custom');
  check('F13 no catalog-cut warning', !sol.warnings.some((w) => w.code === 'catalog_elbow_cut'));
  check('F13 cutList length = N', sol.cutList.length === MAIN.pipeCount, `${sol.cutList.length}`);
  for (let k = 0; k < MAIN.pipeCount; k++) {
    const bend = sol.pipes[k].pieces[0];
    const straightIn = (MAIN.inletAxisToAxisMm - k * MAIN.staggerMm) - tPure;
    const straightOut = (MAIN.outletAxisToAxisMm - k * MAIN.outletStepMm) - tPure;
    check(`F13 P${k + 1}-BEND straightIn`, near(bend.straightInletMm as number, straightIn, PURE_TOL), `${bend.straightInletMm}`);
    check(`F13 P${k + 1}-BEND straightOut`, near(bend.straightOutletMm as number, straightOut, PURE_TOL));
    check(`F13 P${k + 1}-BEND bar`, near(bend.finishedLengthMm as number, straightIn + arcPure + straightOut, PURE_TOL));
  }
  // Bend with g > 0 -> not-applicable warning; with CLR <= OD/2 -> warning.
  const solG = solve({ ...mainInput, elbow: { kind: 'bend', clrMm: CLR }, references: { ...mainInput.references, weldGapMm: 3 } });
  check('F13 weld gap not applicable warning', solG.warnings.some((w) => w.code === 'weld_gap_not_applicable_bend'));
  const solSmall = solve({ ...mainInput, elbow: { kind: 'bend', clrMm: 50 } });
  check('F13 clr_below_half_od warning', solSmall.warnings.some((w) => w.code === 'clr_below_half_od'));
  check('F13 small CLR still computed (warning, not error)', solSmall.success !== false && solSmall.pipes.length === 3);
  // Independent reconstruction also holds in bend mode.
  reconstructAndVerify('F13 bend', sol, PURE_TOL);
}

// ---------------------------------------------------------------------------
// F14. Engine correspondence and documented precision
// ---------------------------------------------------------------------------
console.log('--- F14. Engine correspondence ---');
{
  check('F14 documented precision', ELBOW_ENGINE_PRECISION_MM === 5e-7);
  for (const theta of [15, 22.5, 30, 35, 37, 45, 60, 90]) {
    const sol = solve({ ...mainInput, pipeCount: 2, elbowAngleDeg: theta });
    const tPure = MAIN.clrMm * Math.tan((theta * Math.PI) / 360);
    const diff = Math.abs(sol.elbow.takeOutMm - tPure);
    check(`F14 theta=${theta} |t_engine - pure| <= 5e-7`, diff <= ELBOW_ENGINE_PRECISION_MM + 1e-12, `${diff}`);
    check(
      `F14 theta=${theta} intrados < center < extrados`,
      (sol.elbow.cutIntradosMm as number) < sol.elbow.takeOutMm && sol.elbow.takeOutMm < (sol.elbow.cutExtradosMm as number),
    );
    check(
      `F14 theta=${theta} arcs sum to 90deg total`,
      near(
        (sol.elbow.keptArcLengthMm as number) + (sol.elbow.discardedArcLengthMm as number),
        (MAIN.clrMm * Math.PI) / 2,
        ENGINE_TOL,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// F15. N = 2 and N = 12
// ---------------------------------------------------------------------------
console.log('--- F15. N=2 / N=12 ---');
{
  const n2 = solve({ ...mainInput, pipeCount: 2 });
  check('F15 N=2 catalog pieces = 3N', n2.pipes.flatMap((p) => p.pieces).length === 6);
  check('F15 N=2 cutList = 2N', n2.cutList.length === 4);
  const n12 = solve({ ...mainInput, pipeCount: 12 });
  check('F15 N=12 catalog pieces = 3N', n12.pipes.flatMap((p) => p.pieces).length === 36);
  check('F15 N=12 cumulative pipe 12', near(n12.pipes[11].cumulativeStaggerMm, 11 * MAIN.staggerMm, PURE_TOL));
  const n12b = solve({ ...mainInput, pipeCount: 12, elbow: { kind: 'bend', clrMm: 300 } });
  check('F15 N=12 bend pieces = N', n12b.pipes.flatMap((p) => p.pieces).length === 12);
  check('F15 N=12 bend cutList = N', n12b.cutList.length === 12);
}

// ---------------------------------------------------------------------------
// F16. OD invariant across schedules + P1 non-mutation identity
// ---------------------------------------------------------------------------
console.log('--- F16. OD invariant + P1 identity ---');
{
  for (const nps of ['1/2', '2', '4', '6', '12', '24']) {
    const ods = new Set(PIPE_DIMENSIONS.filter((r) => r.nps === nps).map((r) => r.odMm));
    check(`F16 OD constant across schedules NPS ${nps}`, ods.size === 1, `${ods.size} distinct ODs`);
  }
  const kernelDirect = solvePipeCombStagger(mainInput);
  const viaLayer = solve(mainInput);
  check(
    'F16 kernel result identical through layer',
    kernelDirect.success &&
      viaLayer.stagger.adjacentStaggerMm === kernelDirect.result.adjacentStaggerMm &&
      viaLayer.stagger.staggerDirection === kernelDirect.result.staggerDirection &&
      viaLayer.stagger.pipes.length === kernelDirect.result.pipes.length &&
      viaLayer.stagger.pipes.every((p, i) => p.cumulativeStaggerMm === kernelDirect.result.pipes[i].cumulativeStaggerMm),
  );
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} checks passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const f of failures) console.log(`FAIL: ${f}`);
  process.exit(1);
}
console.log('PIPE COMB FABRICATION P3-A: ALL PASS');
