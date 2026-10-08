/**
 * PB-PIPE-COMB-CORRECTION-001 / P3-A — fabrication layer tests (review-fix revision).
 *
 * Sections:
 *   F1  Main acceptance case 3x35 deg vs frozen literals (+ marking/joints/faces)
 *   F2  Independent assembly reconstruction against the REQUESTED references
 *       (absolute planes fixed from inputs; arc built from centre/radius/angle)
 *       + sensitivity: uniform +10mm / single piece / common take-out error /
 *       weld gap omitted or doubled must ALL fail
 *   F3  45 deg and 90 deg (90 deg: takeOut = CLR exactly, zero discarded arc)
 *   F4  Directions on BOTH axes: inlet step A vs outlet step delta (finding 5)
 *   F5  Explicit weld gap + fitting allowance (exact decomposition, joints)
 *   F6  Units: mm vs exact-inch round trip -> identical results
 *   F7  Insufficient references -> pending pieces with stable ids, provided
 *       values preserved, missing list, P1 untouched (finding 6)
 *   F8  Impossible lengths -> invalid pieces, plan flagged, rest computed
 *   F9  No double deduction (decomposition residual 0 on every pipe)
 *   F10 Negative A does NOT imply negative cut lengths
 *   F11 Catalog N/A: SR < NPS 1, unknown NPS (no fallbacks)
 *   F12 Invalid adjustments/references -> machine codes
 *   F13 Bend mode (custom CLR): tangencies, developed arc, bar length
 *   F14 Engine correspondence: |t_engine - CLR*tan(theta/2)| <= 5e-7
 *   F15 N=2 and N=12 piece/joint counts + P1 cumulative propagation
 *   F16 OD-across-schedules invariant + P1 non-mutation identity
 *   F17 CLR incompatibility: <, =, slightly above OD/2, with/without refs (finding 1)
 *   F18 Marking contract: datum/method semantics + independent cut-plane
 *       and angle recovery from the delivered marks (finding 3)
 *
 * Run: node --experimental-strip-types scripts/test-pipe-comb-fabrication.ts
 */

import {
  solvePipeCombFabrication,
  ELBOW_ENGINE_PRECISION_MM,
  MVP_MARKING_METHOD,
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
  if (result.success === false) {
    throw new Error(`unexpected failure: ${result.code} ${result.reason} for ${JSON.stringify(input)}`);
  }
  return result.result;
}
function expectFail(input: PipeCombFabricationInput, code: string): void {
  const result = solvePipeCombFabrication(input);
  check(
    `${code} <- nps=${input.nps} elbow=${JSON.stringify(input.elbow)} refs=${JSON.stringify(input.references)}`,
    result.success === false && result.code === code,
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
// F2 (review finding 2): independent assembly reconstruction.
//
// Everything below is anchored to the REQUESTED data, never derived from the
// module result: REF-ENT is the plane y=0 (u=(0,1)); pipe i inlet axis at
// x = k*Di (Di fixed from input); E_i = (k*Di, Lin - k*A) with A from the
// frozen kernel; REF-SAL is the plane through E_1 + Lout*v perpendicular to
// v, fixed from inputs. Each pipe is assembled PHYSICALLY: free face at
// REF-ENT -> finished pup -> weld gap -> elbow face -> arc built from its
// CENTRE, RADIUS and ANGLE (never from the result's takeOutMm) -> weld gap
// -> finished outlet pup -> real end Q_i. The take-out used in checks is
// computed independently as CLR*tan(theta/2).
// ---------------------------------------------------------------------------
interface Vec {
  x: number;
  y: number;
}
function verifyAssembly(
  label: string,
  sol: PipeCombFabricationSolution,
  input: PipeCombFabricationInput,
  tol: number,
): string[] {
  const problems: string[] = [];
  const thetaRad = (input.elbowAngleDeg * Math.PI) / 180;
  const cos = Math.cos(thetaRad);
  const sin = Math.sin(thetaRad);
  const Di = input.initialSpacingMm;
  const A = sol.stagger.adjacentStaggerMm; // frozen kernel source
  const CLR = sol.elbow.clrMm;
  const tIndep = CLR * Math.tan(thetaRad / 2); // independent of sol.elbow.takeOutMm
  const Lin = input.references?.inletAxisToAxisMm as number;
  const Lout = input.references?.outletAxisToAxisMm as number;
  const g = sol.references.weldGapMm; // assembly gap as declared by the module
  const isBend = sol.elbow.mode === 'bend';

  // REQUESTED outlet plane, fixed from inputs.
  const S1: Vec = { x: Lout * sin, y: Lin + Lout * cos };
  const dotV = (p: Vec): number => p.x * sin + p.y * cos;

  let prevT2: Vec | undefined;
  let firstT1: Vec | undefined;
  for (let k = 0; k < sol.pipes.length; k++) {
    const pipe = sol.pipes[k];
    const E: Vec = { x: k * Di, y: Lin - k * A };
    const F: Vec = { x: k * Di, y: 0 }; // free face on REF-ENT, on pipe axis

    let straightIn: number;
    let straightOut: number;
    if (isBend) {
      const bend = pipe.pieces[0];
      straightIn = bend.straightInletMm as number;
      straightOut = bend.straightOutletMm as number;
    } else {
      straightIn = (pipe.pieces.find((p) => p.kind === 'inlet-pup')?.finishedLengthMm as number) + g;
      straightOut = g + (pipe.pieces.find((p) => p.kind === 'outlet-pup')?.finishedLengthMm as number);
    }

    // Assemble: free face -> straight -> arc (centre/radius/angle) -> straight.
    const T1: Vec = { x: F.x, y: F.y + straightIn };
    const C: Vec = { x: T1.x + CLR, y: T1.y };
    const T2: Vec = { x: C.x - CLR * cos, y: C.y + CLR * sin };
    const Q: Vec = { x: T2.x + straightOut * sin, y: T2.y + straightOut * cos };

    // (a) tangency vs axis intersection along the inlet axis.
    const tIn = E.y - T1.y;
    if (!near(tIn, tIndep, tol)) problems.push(`${label} P${k + 1}: (E-T1).u=${tIn} != t=${tIndep}`);
    // (b) cut face/tangency vs axis intersection along the outlet axis.
    const tOut = dotV({ x: T2.x - E.x, y: T2.y - E.y });
    if (!near(tOut, tIndep, tol)) problems.push(`${label} P${k + 1}: (T2-E).v=${tOut} != t=${tIndep}`);
    // (c) intersection of assembled axes lands on the input E_i.
    const dx = T2.x - T1.x;
    const dy = T2.y - T1.y;
    if (Math.abs(sin) > 1e-12) {
      const b = -dx / sin;
      const a = dy + b * cos;
      const I: Vec = { x: T1.x, y: T1.y + a };
      if (!near(I.x, E.x, tol) || !near(I.y, E.y, tol)) {
        problems.push(`${label} P${k + 1}: assembled axis intersection (${I.x},${I.y}) != E (${E.x},${E.y})`);
      }
    }
    // (d) real assembled end against the REQUESTED REF-SAL plane.
    const deviation = dotV({ x: Q.x - S1.x, y: Q.y - S1.y });
    if (!near(deviation, 0, tol)) problems.push(`${label} P${k + 1}: REF-SAL deviation=${deviation}`);
    // (e) stagger between assembled tangencies equals the kernel A.
    if (firstT1 !== undefined) {
      const staggerRec = firstT1.y - T1.y;
      if (!near(staggerRec, k * A, tol)) problems.push(`${label} P${k + 1}: stagger recovered=${staggerRec} != ${k * A}`);
    }
    // (f) Df between consecutive assembled outlet axes.
    if (prevT2 !== undefined) {
      const dfRec = (T2.x - prevT2.x) * cos - (T2.y - prevT2.y) * sin;
      if (!near(dfRec, input.finalSpacingMm, tol)) problems.push(`${label} P${k + 1}: Df recovered=${dfRec} != ${input.finalSpacingMm}`);
    }
    prevT2 = T2;
    firstT1 = firstT1 ?? T1;
  }
  return problems;
}
function clone(sol: PipeCombFabricationSolution): PipeCombFabricationSolution {
  return JSON.parse(JSON.stringify(sol)) as PipeCombFabricationSolution;
}
function mutateAllPups(sol: PipeCombFabricationSolution, deltaMm: number): void {
  for (const pipe of sol.pipes) {
    for (const piece of pipe.pieces) {
      if (piece.kind === 'inlet-pup' || piece.kind === 'outlet-pup') {
        piece.finishedLengthMm = (piece.finishedLengthMm as number) + deltaMm;
      }
      if (piece.kind === 'bent-tube') {
        piece.straightInletMm = (piece.straightInletMm as number) + deltaMm;
        piece.straightOutletMm = (piece.straightOutletMm as number) + deltaMm;
      }
    }
  }
}

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
  check('F1 intrados radius', near(sol.elbow.intradosRadiusMm, MAIN.clrMm - MAIN.odMm / 2, PURE_TOL));
  check('F1 geometryValid', sol.elbow.geometryValid === true);
  check('F1 takeOut (engine, 1e-6)', near(sol.elbow.takeOutMm, MAIN.takeOutMm, ENGINE_TOL), `${sol.elbow.takeOutMm}`);
  check('F1 takeOut engine literal', sol.elbow.takeOutMm === MAIN.takeOutEngineMm);
  check('F1 cutIntrados', near(sol.elbow.cutIntradosMm as number, MAIN.cutIntradosMm, ENGINE_TOL));
  check('F1 cutExtrados', near(sol.elbow.cutExtradosMm as number, MAIN.cutExtradosMm, ENGINE_TOL));
  check('F1 arcIntrados (MVP mark)', near(sol.elbow.arcFromKeptFaceMm?.intradosMm as number, MAIN.arcIntradosMm, PURE_TOL));
  check('F1 arcCenterline (MVP mark)', near(sol.elbow.arcFromKeptFaceMm?.centerlineMm as number, MAIN.arcCenterlineMm, PURE_TOL));
  check('F1 arcExtrados (MVP mark)', near(sol.elbow.arcFromKeptFaceMm?.extradosMm as number, MAIN.arcExtradosMm, PURE_TOL));
  check('F1 projCenterline', near(sol.elbow.axialProjectionFromKeptFaceMm?.centerlineMm as number, MAIN.projectionCenterlineMm, PURE_TOL));
  check('F1 projIntrados', near(sol.elbow.axialProjectionFromKeptFaceMm?.intradosMm as number, MAIN.projectionIntradosMm, PURE_TOL));
  check('F1 projExtrados', near(sol.elbow.axialProjectionFromKeptFaceMm?.extradosMm as number, MAIN.projectionExtradosMm, PURE_TOL));
  check('F1 keptArc', near(sol.elbow.keptArcLengthMm as number, MAIN.keptArcLengthMm, ENGINE_TOL));
  check('F1 discardedArc', near(sol.elbow.discardedArcLengthMm as number, MAIN.discardedArcLengthMm, ENGINE_TOL));
  check('F1 markingMethodDeclared', sol.elbow.markingMethodDeclared === MVP_MARKING_METHOD);
  check('F1 cutSemantics declared', typeof sol.elbow.cutSemantics === 'string' && sol.elbow.cutSemantics.includes('NOT an arc distance'));
  check('F1 modelNote declared', typeof sol.elbow.modelNote === 'string' && sol.elbow.modelNote.includes('nominal circular-arc'));
  check('F1 outletAxisStepMm', near(sol.outletAxisStepMm, MAIN.outletStepMm, PURE_TOL), `${sol.outletAxisStepMm}`);
  check('F1 clearance initial', near(sol.initialClearanceMm, MAIN.initialClearanceMm, PURE_TOL));
  check('F1 clearance final', near(sol.finalClearanceMm, MAIN.finalClearanceMm, PURE_TOL));
  check('F1 catalog_elbow_cut warning', sol.warnings.some((w) => w.code === 'catalog_elbow_cut'));
  check('F1 plan valid', sol.cutPlanValid === true);
  check('F1 references defined', sol.references.defined === true && sol.references.missing.length === 0);
  check('F1 cutList length = 2N', sol.cutList.length === 2 * MAIN.pipeCount, `${sol.cutList.length}`);
  check('F1 joints length = 2N', sol.joints.length === 2 * MAIN.pipeCount, `${sol.joints.length}`);
  for (const j of sol.joints) {
    check(`F1 joint ${j.id} faces distinct`, j.faceA !== j.faceB);
    check(`F1 joint ${j.id} gap explicit`, j.gapMm === MAIN.weldGapMm);
    check(`F1 joint ${j.id} links two pieces`, j.pieces.length === 2);
  }

  for (const ref of MAIN.pups) {
    const pipe = sol.pipes[ref.pipeNumber - 1];
    check(`F1 P${ref.pipeNumber} cumulative`, near(pipe.cumulativeStaggerMm, (ref.pipeNumber - 1) * MAIN.staggerMm, PURE_TOL));
    const pupIn = pipe.pieces.find((p) => p.id === `P${ref.pipeNumber}-IN`);
    const pupOut = pipe.pieces.find((p) => p.id === `P${ref.pipeNumber}-OUT`);
    const elbowPiece = pipe.pieces.find((p) => p.id === `P${ref.pipeNumber}-ELBOW`);
    check(`F1 P${ref.pipeNumber}-IN exists`, pupIn !== undefined);
    check(`F1 P${ref.pipeNumber}-OUT exists`, pupOut !== undefined);
    check(`F1 P${ref.pipeNumber}-ELBOW exists`, elbowPiece !== undefined);
    if (pupIn && pupOut && elbowPiece) {
      check(`F1 P${ref.pipeNumber}-IN axis`, near(pupIn.axisToAxisLengthMm as number, ref.axisInMm, PURE_TOL), `${pupIn.axisToAxisLengthMm}`);
      check(`F1 P${ref.pipeNumber}-OUT axis`, near(pupOut.axisToAxisLengthMm as number, ref.axisOutMm, PURE_TOL), `${pupOut.axisToAxisLengthMm}`);
      check(`F1 P${ref.pipeNumber}-IN finished`, near(pupIn.finishedLengthMm as number, ref.inletFinishedMm, ENGINE_TOL), `${pupIn.finishedLengthMm}`);
      check(`F1 P${ref.pipeNumber}-OUT finished`, near(pupOut.finishedLengthMm as number, ref.outletFinishedMm, ENGINE_TOL), `${pupOut.finishedLengthMm}`);
      check(`F1 P${ref.pipeNumber}-IN cut=finished (allowance 0)`, near(pupIn.cutLengthMm as number, pupIn.finishedLengthMm as number, PURE_TOL));
      check(`F1 P${ref.pipeNumber}-IN status`, pupIn.status === 'ok');
      check(`F1 P${ref.pipeNumber}-OUT status`, pupOut.status === 'ok');
      check(`F1 P${ref.pipeNumber}-IN allowance handling`, pupIn.allowanceHandling === 'remove-at-fit-up');
      check(`F1 P${ref.pipeNumber}-IN faces`, (pupIn.faces as { free: string; joint: string }).free === 'REF-ENT' && (pupIn.faces as { joint: string }).joint === `P${ref.pipeNumber}-IN-FACE-J`);
      check(`F1 P${ref.pipeNumber}-ELBOW faces`, (elbowPiece.faces as { inlet: string }).inlet === `P${ref.pipeNumber}-ELBOW-FACE-IN`);
    }
  }
  console.log(`A=${sol.stagger.adjacentStaggerMm.toFixed(6)} t=${sol.elbow.takeOutMm} cutList=${sol.cutList.length} joints=${sol.joints.length}`);
}

// ---------------------------------------------------------------------------
// F2. Independent assembly reconstruction + sensitivity (review finding 2)
// ---------------------------------------------------------------------------
console.log('--- F2. Independent assembly reconstruction ---');
{
  const sol = solve(mainInput);
  const problems = verifyAssembly('F2 main', sol, mainInput, ENGINE_TOL);
  check('F2 main assembly consistent', problems.length === 0, problems.join(' | '));

  // Sensitivity 1: +10 mm to ALL pups -> must FAIL (old F2 stayed green).
  const mutUniform = clone(sol);
  mutateAllPups(mutUniform, 10);
  const pUniform = verifyAssembly('F2 uniform+10', mutUniform, mainInput, ENGINE_TOL);
  check('F2 SENS uniform +10mm detected', pUniform.length > 0, 'no problem reported');
  const refSalDeviation = pUniform.find((p) => p.includes('REF-SAL deviation'));
  const expectedShift = 10 * Math.cos((35 * Math.PI) / 180) + 10; // 18.191520 mm
  check(
    'F2 SENS uniform +10mm shifts REF-SAL by ~18.191520',
    refSalDeviation !== undefined && near(Math.abs(Number(refSalDeviation.split('=')[1])), expectedShift, 1e-6),
    `${refSalDeviation} vs ${expectedShift}`,
  );

  // Sensitivity 2: alter a single piece -> must FAIL.
  const mutSingle = clone(sol);
  const singlePup = mutSingle.pipes[1].pieces.find((p) => p.kind === 'inlet-pup');
  if (singlePup) singlePup.finishedLengthMm = (singlePup.finishedLengthMm as number) + 3;
  check('F2 SENS single piece +3mm detected', verifyAssembly('F2 single+3', mutSingle, mainInput, ENGINE_TOL).length > 0);

  // Sensitivity 3: common elbow take-out error (all pups short by 0.5) -> FAIL.
  const mutTakeout = clone(sol);
  mutateAllPups(mutTakeout, -0.5);
  check('F2 SENS common take-out error detected', verifyAssembly('F2 takeout-0.5', mutTakeout, mainInput, ENGINE_TOL).length > 0);

  // Sensitivity 4: weld gap omitted or doubled -> must FAIL.
  const inputG2: PipeCombFabricationInput = { ...mainInput, references: { ...mainInput.references, weldGapMm: 2 } };
  const solG2 = solve(inputG2);
  check('F2 with g=2 consistent', verifyAssembly('F2 g=2', solG2, inputG2, ENGINE_TOL).length === 0);
  const mutGapOmitted = clone(solG2);
  mutGapOmitted.references.weldGapMm = 0;
  check('F2 SENS gap omitted detected', verifyAssembly('F2 gap-omitted', mutGapOmitted, inputG2, ENGINE_TOL).length > 0);
  const mutGapDoubled = clone(solG2);
  mutGapDoubled.references.weldGapMm = 4;
  check('F2 SENS gap doubled detected', verifyAssembly('F2 gap-doubled', mutGapDoubled, inputG2, ENGINE_TOL).length > 0);
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
  const input90: PipeCombFabricationInput = { ...base, elbowAngleDeg: 90 };
  check('F3 90deg assembly consistent', verifyAssembly('F3 90', sol90, input90, ENGINE_TOL).length === 0);
  const input45: PipeCombFabricationInput = { ...base, elbowAngleDeg: 45 };
  check('F3 45deg assembly consistent', verifyAssembly('F3 45', sol45, input45, ENGINE_TOL).length === 0);
}

// ---------------------------------------------------------------------------
// F4. Directions on BOTH axes (review finding 5)
// ---------------------------------------------------------------------------
console.log('--- F4. Direction semantics: inlet step A vs outlet step delta ---');
{
  const inAt = (s: PipeCombFabricationSolution, i: number) => s.pipes[i].pieces.find((p) => p.kind === 'inlet-pup')?.finishedLengthMm as number;
  const outAt = (s: PipeCombFabricationSolution, i: number) => s.pipes[i].pieces.find((p) => p.kind === 'outlet-pup')?.finishedLengthMm as number;

  // Main 35 deg: A > 0, delta < 0 -> inlets shorten, outlets LENGTHEN.
  const sol = solve(mainInput);
  check('F4 35deg A>0: INLET pups shorten downstream (step A on inlet axis)', inAt(sol, 2) < inAt(sol, 0));
  check('F4 35deg delta<0: OUTLET pups lengthen downstream (step delta on outlet axis)', outAt(sol, 2) > outAt(sol, 0));
  check('F4 35deg delta sign independent of A sign', sol.stagger.adjacentStaggerMm > 0 && sol.outletAxisStepMm < 0);

  // A = 0 (Di=200, Df=100, 60 deg): inlets equal, outlets DIFFER.
  const aligned = solve({ ...mainInput, initialSpacingMm: 200, finalSpacingMm: 100, elbowAngleDeg: 60 });
  const deltaAligned = 200 * Math.sin((60 * Math.PI) / 180);
  check('F4 A=0: stagger zero', aligned.stagger.adjacentStaggerMm === 0);
  check('F4 A=0: INLET pups equal', near(inAt(aligned, 0), inAt(aligned, 2), ENGINE_TOL));
  check('F4 A=0: OUTLET pups differ and shorten (delta = Di*sin60 > 0)', !near(outAt(aligned, 0), outAt(aligned, 2), ENGINE_TOL) && outAt(aligned, 2) < outAt(aligned, 0));
  check('F4 A=0: outletAxisStepMm = Di*sin60', near(aligned.outletAxisStepMm, deltaAligned, PURE_TOL), `${aligned.outletAxisStepMm}`);

  // 90 deg (Di=200, Df=400): A = +400, but delta = Di > 0 -> outlets SHORTEN.
  const at90 = solve({ ...mainInput, initialSpacingMm: 200, finalSpacingMm: 400, elbowAngleDeg: 90 });
  check('F4 90deg: A = +400', near(at90.stagger.adjacentStaggerMm, 400, PURE_TOL));
  check('F4 90deg: A>0 yet OUTLET pups shorten downstream (delta = Di > 0)', outAt(at90, 2) < outAt(at90, 0));
  check('F4 90deg: outletAxisStepMm = Di', near(at90.outletAxisStepMm, 200, PURE_TOL));

  // Negative (REF-03): A < 0, delta = Di*sin - A*cos > 0.
  const neg = solve({ ...mainInput, initialSpacingMm: 400, finalSpacingMm: 200, elbowAngleDeg: 45 });
  const deltaNeg = 400 * Math.sin(Math.PI / 4) - neg.stagger.adjacentStaggerMm * Math.cos(Math.PI / 4);
  check('F4 negative: A < 0', neg.stagger.adjacentStaggerMm < 0);
  check('F4 negative: INLET pups lengthen downstream', inAt(neg, 2) > inAt(neg, 0));
  check('F4 negative: OUTLET pups shorten downstream (delta > 0)', outAt(neg, 2) < outAt(neg, 0));
  check('F4 negative: outletAxisStepMm', near(neg.outletAxisStepMm, deltaNeg, PURE_TOL));
}

// ---------------------------------------------------------------------------
// F5. Explicit weld gap + fitting allowance (+ joint contract, finding 4)
// ---------------------------------------------------------------------------
console.log('--- F5. Weld gap + allowance + joint contract ---');
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
      check(`F5 ${pup?.id} finished != cut (allowance separate)`, !near(pup?.finishedLengthMm as number, pup?.cutLengthMm as number, PURE_TOL));
      check(`F5 ${pup?.id} allowance remove-at-fit-up`, pup?.allowanceHandling === 'remove-at-fit-up');
      const gapDeduction = pup?.deductions.find((d) => d.source === 'weld_gap');
      check(`F5 ${pup?.id} explicit gap deduction`, gapDeduction?.mm === 2);
    }
  }
  // Joint contract: with g > 0 the pup face and the elbow face are distinct,
  // both identified, and the joint links them with the explicit gap.
  for (const joint of sol.joints) {
    check(`F5 ${joint.id} gap = 2`, joint.gapMm === 2);
    check(`F5 ${joint.id} faces distinct`, joint.faceA !== joint.faceB);
    const pup = sol.pipes.flatMap((p) => p.pieces).find((p) => p.id === joint.pieces[0]);
    const pupJointFace = (pup?.faces as { joint?: string })?.joint;
    check(`F5 ${joint.id} faceA is the pup own face`, pupJointFace === joint.faceA);
    const elbowPiece = sol.pipes.flatMap((p) => p.pieces).find((p) => p.id === joint.pieces[1]);
    const elbowFaces = elbowPiece?.faces as { inlet: string; outlet: string };
    check(`F5 ${joint.id} faceB is an elbow face`, elbowFaces.inlet === joint.faceB || elbowFaces.outlet === joint.faceB);
  }
  const inputG2A5: PipeCombFabricationInput = { ...mainInput, references: { inletAxisToAxisMm: 1000, outletAxisToAxisMm: 1200, weldGapMm: 2, fittingAllowanceMm: 5 } };
  check('F5 assembly with g=2 consistent', verifyAssembly('F5 g=2', sol, inputG2A5, ENGINE_TOL).length === 0);
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
// F7. Insufficient references (review finding 6)
// ---------------------------------------------------------------------------
console.log('--- F7. Pending references state ---');
{
  const noRefs = solve({ ...mainInput, references: undefined });
  check('F7 not defined', noRefs.references.defined === false);
  check('F7 missing both', noRefs.references.missing.join(',') === 'inletAxisToAxisMm,outletAxisToAxisMm');
  check('F7 provided none', noRefs.references.provided.inlet === false && noRefs.references.provided.outlet === false);
  check('F7 planned pieces emitted with stable ids', noRefs.pipes.length === 3 && noRefs.pipes.every((p) => p.pieces.length === 3));
  check(
    'F7 all pieces pending-references',
    noRefs.pipes.every((p) => p.pieces.every((piece) => piece.status === 'pending-references')),
  );
  check('F7 piece ids stable', noRefs.pipes[0].pieces.map((p) => p.id).join(',') === 'P1-IN,P1-ELBOW,P1-OUT');
  check('F7 no invented lengths', noRefs.pipes.every((p) => p.pieces.every((piece) => piece.finishedLengthMm === undefined && piece.cutLengthMm === undefined && piece.axisToAxisLengthMm === undefined)));
  check('F7 cutList pending without lengths', noRefs.cutList.length === 6 && noRefs.cutList.every((c) => c.status === 'pending-references' && c.cutLengthMm === undefined));
  check('F7 elbow still computed', near(noRefs.elbow.takeOutMm, MAIN.takeOutMm, ENGINE_TOL));
  check('F7 P1 intact without refs', near(noRefs.stagger.adjacentStaggerMm, MAIN.staggerMm, PURE_TOL));
  check('F7 references not echoed when absent', noRefs.references.inletAxisToAxisMm === undefined);
  check('F7 plan not valid', noRefs.cutPlanValid === false);
  check('F7 cumulative preserved in pending pipes', near(noRefs.pipes[2].cumulativeStaggerMm, 2 * MAIN.staggerMm, PURE_TOL));

  const half = solve({ ...mainInput, references: { inletAxisToAxisMm: 1000 } });
  check('F7 half refs: provided value PRESERVED', half.references.inletAxisToAxisMm === 1000);
  check('F7 half refs: missing list exact', half.references.missing.join(',') === 'outletAxisToAxisMm');
  check('F7 half refs: provided flags', half.references.provided.inlet === true && half.references.provided.outlet === false);
  check('F7 half refs: pieces still pending with ids', half.pipes.length === 3 && half.pipes.every((p) => p.pieces.every((piece) => piece.status === 'pending-references')));
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
  const bendInput: PipeCombFabricationInput = { ...mainInput, elbow: { kind: 'bend', clrMm: CLR } };
  const sol = solve(bendInput);
  const tPure = CLR * Math.tan((35 * Math.PI) / 360);
  const arcPure = (CLR * 35 * Math.PI) / 180;
  check('F13 bend mode', sol.elbow.mode === 'bend');
  check('F13 takeOut pure', near(sol.elbow.takeOutMm, tPure, PURE_TOL), `${sol.elbow.takeOutMm} vs ${tPure}`);
  check('F13 arc', near(sol.elbow.keptArcLengthMm as number, arcPure, PURE_TOL));
  check('F13 clrSource custom', sol.elbow.clrSource === 'user-custom');
  check('F13 geometryValid (CLR > OD/2)', sol.elbow.geometryValid === true);
  check('F13 no catalog-cut warning', !sol.warnings.some((w) => w.code === 'catalog_elbow_cut'));
  check('F13 cutList length = N', sol.cutList.length === MAIN.pipeCount, `${sol.cutList.length}`);
  check('F13 no joints in bend mode', sol.joints.length === 0);
  check('F13 bend marks: takeout + developed arc', sol.elbow.marks.length === 2 && sol.elbow.marks[1].method === 'arc-development');
  for (let k = 0; k < MAIN.pipeCount; k++) {
    const bend = sol.pipes[k].pieces[0];
    const straightIn = (MAIN.inletAxisToAxisMm - k * MAIN.staggerMm) - tPure;
    const straightOut = (MAIN.outletAxisToAxisMm - k * MAIN.outletStepMm) - tPure;
    check(`F13 P${k + 1}-BEND straightIn`, near(bend.straightInletMm as number, straightIn, PURE_TOL), `${bend.straightInletMm}`);
    check(`F13 P${k + 1}-BEND straightOut`, near(bend.straightOutletMm as number, straightOut, PURE_TOL));
    check(`F13 P${k + 1}-BEND bar`, near(bend.finishedLengthMm as number, straightIn + arcPure + straightOut, PURE_TOL));
  }
  const solG = solve({ ...mainInput, elbow: { kind: 'bend', clrMm: CLR }, references: { ...mainInput.references, weldGapMm: 3 } });
  check('F13 weld gap not applicable warning', solG.warnings.some((w) => w.code === 'weld_gap_not_applicable_bend'));
  check('F13 bend assembly consistent', verifyAssembly('F13 bend', sol, bendInput, PURE_TOL).length === 0);
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
  check('F15 N=2 joints = 2N', n2.joints.length === 4);
  const n12 = solve({ ...mainInput, pipeCount: 12 });
  check('F15 N=12 catalog pieces = 3N', n12.pipes.flatMap((p) => p.pieces).length === 36);
  check('F15 N=12 joints = 2N', n12.joints.length === 24);
  check('F15 N=12 cumulative pipe 12', near(n12.pipes[11].cumulativeStaggerMm, 11 * MAIN.staggerMm, PURE_TOL));
  const n12b = solve({ ...mainInput, pipeCount: 12, elbow: { kind: 'bend', clrMm: 300 } });
  check('F15 N=12 bend pieces = N', n12b.pipes.flatMap((p) => p.pieces).length === 12);
  check('F15 N=12 bend cutList = N', n12b.cutList.length === 12);
  check('F15 N=12 bend joints = 0', n12b.joints.length === 0);
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
// F17. CLR incompatibility (review finding 1)
// ---------------------------------------------------------------------------
console.log('--- F17. CLR <= OD/2 invalidates fabrication ---');
{
  const HALF_OD = MAIN.odMm / 2; // 84.14

  // CLR < OD/2 with references -> all pieces invalid, plan invalid, data kept.
  const below = solve({ ...mainInput, elbow: { kind: 'bend', clrMm: 50 } });
  check('F17 CLR<OD/2: geometryValid false', below.elbow.geometryValid === false);
  check('F17 CLR<OD/2: intrados radius negative', below.elbow.intradosRadiusMm === 50 - HALF_OD);
  check('F17 CLR<OD/2: warning present', below.warnings.some((w) => w.code === 'clr_below_half_od'));
  check('F17 CLR<OD/2: plan NOT valid', below.cutPlanValid === false);
  check(
    'F17 CLR<OD/2: every piece invalid clr_incompatible_intrados',
    below.pipes.every((p) => p.pieces.every((piece) => piece.status === 'invalid' && piece.statusCode === 'clr_incompatible_intrados')),
  );
  check(
    'F17 CLR<OD/2: cutList carries invalid status',
    below.cutList.every((c) => c.status === 'invalid' && c.statusCode === 'clr_incompatible_intrados'),
  );
  check('F17 CLR<OD/2: P1 data available', near(below.stagger.adjacentStaggerMm, MAIN.staggerMm, PURE_TOL));
  check('F17 CLR<OD/2: lengths still exposed (data, not valid plan)', below.pipes[0].pieces[0].finishedLengthMm !== undefined);

  // CLR = OD/2 -> intrados radius exactly 0 -> invalid.
  const equal = solve({ ...mainInput, elbow: { kind: 'bend', clrMm: HALF_OD } });
  check('F17 CLR=OD/2: intrados radius zero', equal.elbow.intradosRadiusMm === 0);
  check('F17 CLR=OD/2: geometryValid false', equal.elbow.geometryValid === false);
  check('F17 CLR=OD/2: plan NOT valid', equal.cutPlanValid === false);
  check('F17 CLR=OD/2: pieces invalid', equal.pipes.every((p) => p.pieces.every((piece) => piece.status === 'invalid')));

  // CLR slightly above OD/2 -> constructible (not a bendability certificate).
  const above = solve({ ...mainInput, elbow: { kind: 'bend', clrMm: HALF_OD + 0.01 } });
  check('F17 CLR>OD/2: geometryValid true', above.elbow.geometryValid === true);
  check('F17 CLR>OD/2: plan valid', above.cutPlanValid === true);
  check('F17 CLR>OD/2: pieces ok', above.pipes.every((p) => p.pieces.every((piece) => piece.status === 'ok')));
  check('F17 CLR>OD/2: no clr warning', !above.warnings.some((w) => w.code === 'clr_below_half_od'));

  // Without references: pending pieces, warning, data available, plan not valid.
  const noRefs = solve({ ...mainInput, elbow: { kind: 'bend', clrMm: 50 }, references: undefined });
  check('F17 CLR<OD/2 no refs: geometryValid false', noRefs.elbow.geometryValid === false);
  check('F17 CLR<OD/2 no refs: warning present', noRefs.warnings.some((w) => w.code === 'clr_below_half_od'));
  check('F17 CLR<OD/2 no refs: pieces pending (not fabricated)', noRefs.pipes.every((p) => p.pieces.every((piece) => piece.status === 'pending-references')));
  check('F17 CLR<OD/2 no refs: plan not valid', noRefs.cutPlanValid === false);
  check('F17 CLR<OD/2 no refs: P1 + elbow data available', near(noRefs.stagger.adjacentStaggerMm, MAIN.staggerMm, PURE_TOL) && Number.isFinite(noRefs.elbow.takeOutMm));
}

// ---------------------------------------------------------------------------
// F18. Marking contract (review finding 3 + marking-semantics final fix)
// ---------------------------------------------------------------------------
console.log('--- F18. Marking contract: datum/method + independent recovery ---');
{
  const sol = solve(mainInput);
  const R = MAIN.clrMm;
  const OD = MAIN.odMm;
  const thetaRad = (MAIN.elbowAngleDeg * Math.PI) / 180;

  // Declared semantics.
  check('F18 MVP method declared', sol.elbow.markingMethodDeclared === 'arc-development-from-kept-face');
  check('F18 cut values NOT labelled measurable', (sol.elbow.cutSemantics ?? '').includes('NOT an arc distance'));
  const markById = new Map(sol.elbow.marks.map((mk) => [mk.id, mk]));
  check('F18 takeout mark: tangent-takeout, off material', markById.get('takeout-axis')?.method === 'tangent-takeout' && markById.get('takeout-axis')?.onMaterial === false);
  // Marking-semantics fix: classification is checked INDIVIDUALLY. The
  // intrados/extrados arc developments are MATERIAL marks (inner/outer
  // surface of the nominal model); the CENTERLINE arc development is a
  // THEORETICAL axis reference, NOT a mark on material.
  check(
    'F18 arc-intrados mark: arc-development ON material',
    markById.get('arc-intrados-from-kept-face')?.method === 'arc-development' && markById.get('arc-intrados-from-kept-face')?.onMaterial === true,
    `onMaterial=${markById.get('arc-intrados-from-kept-face')?.onMaterial}`,
  );
  check(
    'F18 arc-extrados mark: arc-development ON material',
    markById.get('arc-extrados-from-kept-face')?.method === 'arc-development' && markById.get('arc-extrados-from-kept-face')?.onMaterial === true,
    `onMaterial=${markById.get('arc-extrados-from-kept-face')?.onMaterial}`,
  );
  check(
    'F18 arc-centerline mark: arc-development OFF material (theoretical axis development)',
    markById.get('arc-centerline-from-kept-face')?.method === 'arc-development' && markById.get('arc-centerline-from-kept-face')?.onMaterial === false,
    `onMaterial=${markById.get('arc-centerline-from-kept-face')?.onMaterial}`,
  );
  check(
    'F18 not all three arc marks are material (centreline excluded)',
    ['arc-intrados-from-kept-face', 'arc-centerline-from-kept-face', 'arc-extrados-from-kept-face'].filter((id) => markById.get(id)?.onMaterial === true).length === 2,
  );
  check('F18 projection mark: axial-projection, off material', markById.get('projection-centerline-from-kept-face')?.method === 'axial-projection' && markById.get('projection-centerline-from-kept-face')?.onMaterial === false);
  check('F18 every mark has origin and destination', sol.elbow.marks.every((mk) => mk.origin.length > 0 && mk.destination.length > 0));

  // The three families are DISTINCT dimensions, not interchangeable names.
  const t = markById.get('takeout-axis')?.valueMm as number;
  const arcC = markById.get('arc-centerline-from-kept-face')?.valueMm as number;
  const projC = markById.get('projection-centerline-from-kept-face')?.valueMm as number;
  check('F18 takeout != arc != projection', !near(t, arcC, 1e-6) && !near(arcC, projC, 1e-6) && !near(t, projC, 1e-6));
  check('F18 takeout = R*tan(theta/2)', near(t, R * Math.tan(thetaRad / 2), ENGINE_TOL));
  check('F18 arc = R*theta', near(arcC, R * thetaRad, PURE_TOL));
  check('F18 projection = R*sin(theta)', near(projC, R * Math.sin(thetaRad), PURE_TOL), `${projC} vs ${R * Math.sin(thetaRad)}`);

  // Independent validation: the delivered arc marks (from the kept face,
  // along each curve) must land on ONE radial cut plane and recover theta.
  // Construct each cut point from its mark WITHOUT using the module's
  // geometry: circle centre C=(R,0), kept face at T_in=(0,0); a point at
  // arc distance s on a circle of radius r sits at swept angle s/r.
  const C = { x: R, y: 0 };
  const curves: Array<{ id: string; r: number; markId: string }> = [
    { id: 'intrados', r: R - OD / 2, markId: 'arc-intrados-from-kept-face' },
    { id: 'centerline', r: R, markId: 'arc-centerline-from-kept-face' },
    { id: 'extrados', r: R + OD / 2, markId: 'arc-extrados-from-kept-face' },
  ];
  const points: Record<string, { x: number; y: number }> = {};
  const radialAngles: number[] = [];
  for (const curve of curves) {
    const s = markById.get(curve.markId)?.valueMm as number;
    const swept = s / curve.r;
    const P = { x: C.x - curve.r * Math.cos(swept), y: curve.r * Math.sin(swept) };
    points[curve.id] = P;
    // Swept angle recovered from the point itself (law of cosines on T_in, C, P).
    // NOTE: T_in sits on the CENTERLINE circle (radius R); P sits on this
    // curve's circle (radius r) — the denominator is R*r.
    const vTin = { x: 0 - C.x, y: 0 - C.y };
    const vP = { x: P.x - C.x, y: P.y - C.y };
    const recovered = Math.acos((vTin.x * vP.x + vTin.y * vP.y) / (R * curve.r));
    check(`F18 ${curve.id} mark recovers theta`, near(recovered, thetaRad, PURE_TOL), `${(recovered * 180) / Math.PI} deg`);
    radialAngles.push(Math.atan2(P.y - C.y, P.x - C.x));
  }
  check(
    'F18 all three marks on ONE radial cut plane',
    near(radialAngles[0], radialAngles[1], PURE_TOL) && near(radialAngles[1], radialAngles[2], PURE_TOL),
    radialAngles.join(','),
  );
  // The tangent direction at the cut point recovers the outlet axis angle.
  const sweptCenter = (markById.get('arc-centerline-from-kept-face')?.valueMm as number) / R;
  const tangentDir = { x: Math.sin(sweptCenter), y: Math.cos(sweptCenter) };
  const outletAngle = (Math.atan2(tangentDir.x, tangentDir.y) * 180) / Math.PI;
  check('F18 tangent at cut recovers 35 deg outlet axis', near(outletAngle, MAIN.elbowAngleDeg, PURE_TOL), `${outletAngle}`);

  // Marking-semantics fix, section verification (independent construction):
  // the section at the cut plane is the radial plane through the arc centre
  // at the swept angle. Its centre is the CENTRELINE point on the arc; the
  // intrados/extrados mark points must sit at exactly OD/2 from it (inner
  // and outer surfaces of the nominal model) and the centreline mark point
  // must BE the section centre.
  const uRadial = { x: -Math.cos(sweptCenter), y: Math.sin(sweptCenter) };
  const S = { x: C.x + R * uRadial.x, y: C.y + R * uRadial.y };
  check('F18 section: centreline mark point IS the section centre', near(points.centerline.x, S.x, PURE_TOL) && near(points.centerline.y, S.y, PURE_TOL), `(${points.centerline.x},${points.centerline.y}) vs (${S.x},${S.y})`);
  const dIntrados = Math.hypot(points.intrados.x - S.x, points.intrados.y - S.y);
  const dExtrados = Math.hypot(points.extrados.x - S.x, points.extrados.y - S.y);
  check('F18 section: intrados mark point at OD/2 from section centre', near(dIntrados, OD / 2, PURE_TOL), `${dIntrados} vs ${OD / 2}`);
  check('F18 section: extrados mark point at OD/2 from section centre', near(dExtrados, OD / 2, PURE_TOL), `${dExtrados} vs ${OD / 2}`);
  // The three section points are collinear with the arc centre (radial line).
  check(
    'F18 section: intrados/centre/extrados collinear (radial cut plane)',
    near(
      Math.abs(
        (points.intrados.x - S.x) * (points.extrados.y - S.y) - (points.intrados.y - S.y) * (points.extrados.x - S.x),
      ),
      0,
      PURE_TOL,
    ),
  );

  // Equivalent regression for BEND mode (marking-semantics fix).
  const CLR_BEND = 300;
  const bendSol = solve({ ...mainInput, elbow: { kind: 'bend', clrMm: CLR_BEND } });
  const bendMarks = new Map(bendSol.elbow.marks.map((mk) => [mk.id, mk]));
  check('F18bend takeout mark: off material', bendMarks.get('takeout-axis')?.onMaterial === false);
  check(
    'F18bend arc-centerline-developed: arc-development OFF material (theoretical axis development)',
    bendMarks.get('arc-centerline-developed')?.method === 'arc-development' && bendMarks.get('arc-centerline-developed')?.onMaterial === false,
    `onMaterial=${bendMarks.get('arc-centerline-developed')?.onMaterial}`,
  );
  check('F18bend bend mode declares no material marks', bendSol.elbow.marks.every((mk) => mk.onMaterial === false));
  // Independent geometric recovery of the bend from its developed-arc mark.
  const sBend = bendMarks.get('arc-centerline-developed')?.valueMm as number;
  const sweptBend = sBend / CLR_BEND;
  check('F18bend developed arc recovers theta', near(sweptBend, thetaRad, PURE_TOL), `${(sweptBend * 180) / Math.PI} deg`);
  const CB = { x: CLR_BEND, y: 0 };
  const T1B = { x: 0, y: 0 };
  const T2B = { x: CB.x - CLR_BEND * Math.cos(sweptBend), y: CB.y + CLR_BEND * Math.sin(sweptBend) };
  const EB = { x: 0, y: CLR_BEND * Math.tan(thetaRad / 2) };
  check('F18bend T1 tangency at CLR*tan(theta/2) from E', near(Math.abs(EB.y - T1B.y), CLR_BEND * Math.tan(thetaRad / 2), PURE_TOL));
  const cosB = Math.cos(thetaRad);
  const sinB = Math.sin(thetaRad);
  const t2AlongV = (T2B.x - EB.x) * sinB + (T2B.y - EB.y) * cosB;
  check('F18bend T2 tangency at CLR*tan(theta/2) from E along outlet axis', near(t2AlongV, CLR_BEND * Math.tan(thetaRad / 2), PURE_TOL), `${t2AlongV}`);
  const tangentB = { x: Math.sin(sweptBend), y: Math.cos(sweptBend) };
  const outletAngleB = (Math.atan2(tangentB.x, tangentB.y) * 180) / Math.PI;
  check('F18bend tangent at T2 recovers 35 deg outlet axis', near(outletAngleB, MAIN.elbowAngleDeg, PURE_TOL), `${outletAngleB}`);
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} checks passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const f of failures) console.log(`FAIL: ${f}`);
  process.exit(1);
}
console.log('PIPE COMB FABRICATION P3-A (review fixes): ALL PASS');
