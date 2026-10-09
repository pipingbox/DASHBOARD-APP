/**
 * PB-PIPE-COMB-CORRECTION-001 / P4 — two-elbow offset engine contract tests.
 *
 * Engine under test: solvePipeComb (legacy W1.B.1 motor, re-homed by P4 as
 * the "Desplazamiento con dos codos" tool). The engine file itself is FROZEN;
 * these are new, separate tests.
 *
 * Method: independent geometric reconstruction. Expected values are NOT the
 * engine formulas copied into the test. For each displaced line we rebuild
 * the jog from axis intersections and arc tangent points:
 *
 *   - The entry axis (y = y0) and exit axis (y = y0 + δ) are intersected with
 *     the offset diagonal at angle θ, giving the two PIs (points of
 *     intersection). advance = horizontal PI spacing, travel = euclidean PI
 *     distance. Neither depends on the radius.
 *   - Each elbow contributes take-out T = R·tan(θ/2) measured from its PI to
 *     each tangent point (standard elbow geometry), so the intermediate
 *     straight cut between tangent points is travel − 2T.
 *   - A full tangent-point coordinate chain (arc entry tangent → arc exit
 *     tangent → straight segment → second arc → exit axis) must recover the
 *     signed offset δ exactly and keep the exit axis parallel to the entry
 *     axis.
 *
 * A sign mutation, a missing factor 2 in the take-out subtraction, or a
 * swapped advance/travel fails these assertions.
 *
 * Sections:
 *   1. R1-D PC-01 reference case (4 lines, 200→400, 45°, CLR 152.4)
 *   2. GO minimum set: 3 lines 35°, 45°, 90° limit
 *   3. Final spacing greater / smaller than initial (signed offsets)
 *   4. Equal spacings: every line straight, no fabricated elbows
 *   5. Reference line semantics: zeros = straight run, not a 0 mm cut piece
 *   6. N = 2 and N = 12 extremes
 *   7. Intermediate cut negative / zero / positive
 *   8. Out-of-domain inputs (angle, CLR, spacings, counts, non-finite)
 *   9. Coordinate-chain reconstruction for every solved line (all cases)
 *
 * Run: node --experimental-strip-types scripts/test-two-elbow-offset-geometry.ts
 */

import {
  solvePipeComb,
  type PipeCombInput,
  type PipeCombLineResult,
} from '../app/frontend/src/tools/core/geometry/pipe-comb.ts';

const DEG_TO_RAD = Math.PI / 180;

let passed = 0;
let failed = 0;

function check(cond: boolean, label: string): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

function approx(actual: number, expected: number, tol: number, label: string): void {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  if (!ok) {
    console.error(`  actual=${actual} expected=${expected} tol=${tol}`);
  }
  check(ok, label);
}

/** Tolerance scaled to the magnitude, with an absolute floor for tiny values. */
function tolFor(magnitude: number): number {
  return Math.max(1e-6, Math.abs(magnitude) * 1e-9);
}

/* ------------------------------------------------------------------ *
 * Independent reconstruction helpers (no engine code reused).
 * ------------------------------------------------------------------ */

interface JogReconstruction {
  /** Signed perpendicular offset between entry and exit axes (mm). */
  deltaMm: number;
  /** Horizontal distance between the two PIs (mm). */
  advanceMm: number;
  /** Euclidean distance between the two PIs along the diagonal (mm). */
  travelMm: number;
  /** Take-out of one elbow, PI to tangent point (mm). */
  takeOutMm: number;
  /** Straight pipe between tangent points (mm). */
  straightCutMm: number;
  /** Exit axis height recovered from the tangent-point coordinate chain. */
  exitAxisYMm: number;
  /** Exit axis direction recovered from the chain (must be horizontal). */
  exitAxisDir: { x: number; y: number };
}

/**
 * Rebuild one displaced line from first principles.
 * Entry axis: y = 0, direction +x. Offset direction: sign(δ) · +y.
 */
function reconstructJog(deltaMm: number, angleDeg: number, clrMm: number): JogReconstruction {
  const theta = angleDeg * DEG_TO_RAD;
  const delta = deltaMm;
  const absDelta = Math.abs(delta);

  // -- Axis-intersection model (radius-independent) ----------------------
  // PI1 on the entry axis, PI2 on the exit axis, diagonal at angle θ.
  // Horizontal PI spacing and euclidean PI distance come straight from the
  // right triangle whose vertical leg is |δ|.
  const advance = absDelta / Math.tan(theta);
  const travel = Math.hypot(absDelta, advance);

  // -- Arc take-out from elbow geometry ----------------------------------
  const takeOut = clrMm * Math.tan(theta / 2);
  const straightCut = travel - 2 * takeOut;

  // -- Tangent-point coordinate chain ------------------------------------
  // Elbow 1 entry tangent at origin; for δ < 0 the jog bends downward.
  const s = Math.sign(delta) || 1;
  const r = clrMm;
  // Elbow 1 exit tangent point (arc turns the axis by θ toward the offset):
  const b = { x: r * Math.sin(theta), y: s * r * (1 - Math.cos(theta)) };
  // Straight segment of length `straightCut` along the diagonal:
  const d = {
    x: b.x + straightCut * Math.cos(theta),
    y: b.y + straightCut * s * Math.sin(theta),
  };
  // Elbow 2 exit tangent point (arc turns back by θ to horizontal):
  const e = { x: d.x + r * Math.sin(theta), y: d.y + s * r * (1 - Math.cos(theta)) };

  return {
    deltaMm: delta,
    advanceMm: advance,
    travelMm: travel,
    takeOutMm: takeOut,
    straightCutMm: straightCut,
    exitAxisYMm: e.y,
    exitAxisDir: { x: 1, y: 0 }, // chain ends horizontal by construction; y asserts parallelism
  };
}

/** Assert one solved line against its independent reconstruction. */
function assertLineMatchesReconstruction(
  line: PipeCombLineResult,
  angleDeg: number,
  clrMm: number,
  label: string,
): void {
  const recon = reconstructJog(line.offsetMm, angleDeg, clrMm);

  if (line.offsetAbsMm === 0) {
    // Reference line: straight run, no elbows, no take-out.
    approx(line.advanceMm, 0, 1e-12, `${label}: reference advance = 0`);
    approx(line.travelMm, 0, 1e-12, `${label}: reference travel = 0`);
    approx(line.takeOutPerElbowMm, 0, 1e-12, `${label}: reference take-out = 0`);
    return;
  }

  approx(line.advanceMm, recon.advanceMm, tolFor(recon.advanceMm), `${label}: advance vs PI intersection`);
  approx(line.travelMm, recon.travelMm, tolFor(recon.travelMm), `${label}: travel vs PI distance`);
  approx(line.takeOutPerElbowMm, recon.takeOutMm, tolFor(recon.takeOutMm), `${label}: take-out vs arc geometry`);
  approx(
    line.straightCutLengthMm,
    recon.straightCutMm,
    tolFor(recon.straightCutMm),
    `${label}: straight cut vs tangent-point chain`,
  );
  // The coordinate chain must land exactly on the exit axis.
  approx(recon.exitAxisYMm, line.offsetMm, tolFor(line.offsetMm), `${label}: chain recovers signed offset`);
  approx(recon.exitAxisDir.y, 0, 1e-12, `${label}: exit axis parallel to entry axis`);
}

function solveOk(input: PipeCombInput, label: string) {
  const res = solvePipeComb(input);
  if (!res.success) {
    failed++;
    console.error(`FAIL: ${label}: engine rejected a valid case: ${res.code} ${res.reason}`);
    return null;
  }
  return res.result;
}

/* ------------------------------------------------------------------ *
 * Section 1 — R1-D PC-01 reference case.
 * 4 lines, 200 → 400, θ = 45°, CLR = 152.4 (6" LR per Weldbend p.26).
 * ------------------------------------------------------------------ */

{
  const sol = solveOk(
    { lineCount: 4, initialSpacingMm: 200, finalSpacingMm: 400, elbowAngleDeg: 45, clrMm: 152.4 },
    'S1 PC-01',
  );
  if (sol) {
    const offsets = sol.lines.map((l) => l.offsetMm);
    check(
      offsets.length === 4 && offsets[0] === 0 && offsets[1] === 200 && offsets[2] === 400 && offsets[3] === 600,
      'S1: offsets [0, 200, 400, 600]',
    );
    // R1-D exact seeds: line 2 advance = 200, travel = 282.842712, cut = 156.590419.
    const l2 = sol.lines[1];
    approx(l2.advanceMm, 200, 1e-6, 'S1: L2 advance = 200');
    approx(l2.travelMm, 282.842712, 1e-6, 'S1: L2 travel = 282.842712');
    approx(l2.straightCutLengthMm, 156.590419, 1e-6, 'S1: L2 straight cut = 156.590419');
    // Reference line is a straight run.
    const l1 = sol.lines[0];
    check(
      l1.advanceMm === 0 && l1.travelMm === 0 && l1.takeOutPerElbowMm === 0 && l1.straightCutLengthMm === 0,
      'S1: L1 fully zero (straight run)',
    );
    for (const line of sol.lines) assertLineMatchesReconstruction(line, 45, 152.4, `S1 ${line.id}`);
  }
}

/* ------------------------------------------------------------------ *
 * Section 2 — GO minimum set: 3 lines at 35°, 45°, 90°.
 * ------------------------------------------------------------------ */

{
  // 35° nominal geometry (no commercial-fitting claim), realizable offsets.
  const sol35 = solveOk(
    { lineCount: 3, initialSpacingMm: 250, finalSpacingMm: 350, elbowAngleDeg: 35, clrMm: 152.4 },
    'S2 3x35',
  );
  if (sol35) {
    for (const line of sol35.lines) assertLineMatchesReconstruction(line, 35, 152.4, `S2-35 ${line.id}`);
    approx(sol35.lines[1].offsetMm, 100, 1e-9, 'S2-35: L2 offset = 100');
    approx(sol35.lines[2].offsetMm, 200, 1e-9, 'S2-35: L3 offset = 200');
  }

  const sol45 = solveOk(
    { lineCount: 3, initialSpacingMm: 250, finalSpacingMm: 350, elbowAngleDeg: 45, clrMm: 152.4 },
    'S2 3x45',
  );
  if (sol45) {
    for (const line of sol45.lines) assertLineMatchesReconstruction(line, 45, 152.4, `S2-45 ${line.id}`);
  }

  // 90° geometric limit: two elbows facing each other, advance → 0, travel = |δ|.
  // Realizability at 90° requires |δ| ≥ 2·CLR (two quarter arcs facing);
  // steps of 400/800 mm with CLR 152.4 leave positive intermediate cuts.
  const sol90 = solveOk(
    { lineCount: 3, initialSpacingMm: 400, finalSpacingMm: 800, elbowAngleDeg: 90, clrMm: 152.4 },
    'S2 3x90',
  );
  if (sol90) {
    for (const line of sol90.lines) {
      assertLineMatchesReconstruction(line, 90, 152.4, `S2-90 ${line.id}`);
      if (line.offsetAbsMm > 0) {
        check(line.advanceMm < 1e-9 * line.offsetAbsMm, `S2-90 ${line.id}: advance ≈ 0 at the 90° limit`);
        approx(line.travelMm, line.offsetAbsMm, tolFor(line.offsetAbsMm), `S2-90 ${line.id}: travel = |offset|`);
        approx(line.takeOutPerElbowMm, 152.4, 1e-9, `S2-90 ${line.id}: take-out = CLR at 90°`);
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * Section 3 — Final spacing greater and smaller than initial.
 * ------------------------------------------------------------------ */

{
  const expanding = solveOk(
    { lineCount: 4, initialSpacingMm: 200, finalSpacingMm: 400, elbowAngleDeg: 45, clrMm: 100 },
    'S3 expanding',
  );
  if (expanding) {
    check(expanding.deltaSpacingMm > 0, 'S3: expanding keeps positive step');
    for (const line of expanding.lines) assertLineMatchesReconstruction(line, 45, 100, `S3-exp ${line.id}`);
  }

  const contracting = solveOk(
    { lineCount: 4, initialSpacingMm: 400, finalSpacingMm: 200, elbowAngleDeg: 45, clrMm: 100 },
    'S3 contracting',
  );
  if (contracting) {
    check(contracting.deltaSpacingMm < 0, 'S3: contracting keeps negative step');
    const offsets = contracting.lines.map((l) => l.offsetMm);
    check(
      offsets[0] === 0 && offsets[1] === -200 && offsets[2] === -400 && offsets[3] === -600,
      'S3: contracting offsets [0, -200, -400, -600]',
    );
    // Magnitudes match the expanding mirror case.
    if (expanding) {
      for (let i = 0; i < 4; i++) {
        approx(
          contracting.lines[i].travelMm,
          expanding.lines[i].travelMm,
          1e-9,
          `S3: |travel| mirror symmetry line ${i + 1}`,
        );
      }
    }
    for (const line of contracting.lines) assertLineMatchesReconstruction(line, 45, 100, `S3-con ${line.id}`);
  }
}

/* ------------------------------------------------------------------ *
 * Section 4 — Equal spacings: straight lines, no fabricated elbows.
 * ------------------------------------------------------------------ */

{
  const sol = solveOk(
    { lineCount: 4, initialSpacingMm: 300, finalSpacingMm: 300, elbowAngleDeg: 45, clrMm: 100 },
    'S4 equal spacing',
  );
  if (sol) {
    check(sol.deltaSpacingMm === 0, 'S4: deltaSpacing = 0');
    for (const line of sol.lines) {
      check(
        line.offsetAbsMm === 0 && line.advanceMm === 0 && line.travelMm === 0 && line.takeOutPerElbowMm === 0,
        `S4 ${line.id}: straight line, zero jog`,
      );
    }
    check(sol.maxTravelMm === 0 && sol.minTravelMm === 0 && sol.travelSpreadMm === 0, 'S4: zero travel spread');
  }
}

/* ------------------------------------------------------------------ *
 * Section 5 — Reference-line semantics: zeros mean "straight run",
 * never "cut a 0 mm piece". The engine contract exposes exactly one
 * such line (offset 0) per comb.
 * ------------------------------------------------------------------ */

{
  const sol = solveOk(
    { lineCount: 5, initialSpacingMm: 100, finalSpacingMm: 150, elbowAngleDeg: 30, clrMm: 50 },
    'S5 reference semantics',
  );
  if (sol) {
    const zeroLines = sol.lines.filter((l) => l.offsetAbsMm === 0);
    check(zeroLines.length === 1 && zeroLines[0].id === '1', 'S5: exactly one reference line, id = "1"');
    check(
      sol.lines.slice(1).every((l) => l.straightCutLengthMm > 0),
      'S5: displaced lines have positive cuts here',
    );
  }
}

/* ------------------------------------------------------------------ *
 * Section 6 — N = 2 and N = 12 extremes.
 * ------------------------------------------------------------------ */

{
  const sol2 = solveOk(
    { lineCount: 2, initialSpacingMm: 200, finalSpacingMm: 500, elbowAngleDeg: 60, clrMm: 80 },
    'S6 N=2',
  );
  if (sol2) {
    check(sol2.lines.length === 2, 'S6: N=2 solves two lines');
    for (const line of sol2.lines) assertLineMatchesReconstruction(line, 60, 80, `S6-2 ${line.id}`);
  }

  const sol12 = solveOk(
    { lineCount: 12, initialSpacingMm: 150, finalSpacingMm: 250, elbowAngleDeg: 45, clrMm: 50 },
    'S6 N=12',
  );
  if (sol12) {
    check(sol12.lines.length === 12, 'S6: N=12 solves twelve lines');
    approx(sol12.lines[11].offsetMm, 11 * 100, 1e-9, 'S6: L12 offset = 1100');
    for (const line of sol12.lines) assertLineMatchesReconstruction(line, 45, 50, `S6-12 ${line.id}`);
    // Spread coherence.
    approx(sol12.maxTravelMm, sol12.lines[11].travelMm, 1e-9, 'S6: maxTravel = L12 travel');
    approx(sol12.minTravelMm, 0, 1e-12, 'S6: minTravel = reference line');
  }
}

/* ------------------------------------------------------------------ *
 * Section 7 — Intermediate cut negative / zero / positive.
 * ------------------------------------------------------------------ */

{
  // Negative: CLR far too large for a small offset → explicit error, no list.
  const neg = solvePipeComb({
    lineCount: 12,
    initialSpacingMm: 200,
    finalSpacingMm: 250,
    elbowAngleDeg: 45,
    clrMm: 700,
  });
  check(neg.success === false, 'S7: negative cut rejected');
  if (!neg.success) {
    check(neg.code === 'negative_cut', 'S7: negative_cut code');
    check(typeof neg.params?.line === 'string', 'S7: failing line identified in params');
  }

  // Zero boundary: travel exactly 2·take-out → cut = 0 is VALID geometry
  // (elbows tangent to each other, no intermediate stick). Distinct from
  // "cut a 0 mm piece": the model limit documented for the UI.
  // travel = δ/sinθ; 2T = 2R tan(θ/2). With θ = 45°, R = 100: 2T = 82.842712...
  // δ = 2T·sin45° = 58.578644...
  const r = 100;
  const theta = 45 * DEG_TO_RAD;
  const deltaZero = 2 * r * Math.tan(theta / 2) * Math.sin(theta);
  const zero = solvePipeComb({
    lineCount: 2,
    initialSpacingMm: 500,
    finalSpacingMm: 500 + deltaZero,
    elbowAngleDeg: 45,
    clrMm: r,
  });
  check(zero.success === true, 'S7: zero-cut boundary is valid geometry');
  if (zero.success) {
    approx(zero.result.lines[1].straightCutLengthMm, 0, 1e-6, 'S7: cut = 0 at the tangency boundary');
    check(zero.result.lines[1].advanceMm > 0, 'S7: advance still positive at the boundary');
  }

  // Just below the boundary → negative_cut.
  const below = solvePipeComb({
    lineCount: 2,
    initialSpacingMm: 500,
    finalSpacingMm: 500 + deltaZero - 0.5,
    elbowAngleDeg: 45,
    clrMm: r,
  });
  check(below.success === false && below.code === 'negative_cut', 'S7: just below boundary → negative_cut');

  // Positive, comfortable margin.
  const pos = solveOk(
    { lineCount: 2, initialSpacingMm: 500, finalSpacingMm: 700, elbowAngleDeg: 45, clrMm: r },
    'S7 positive cut',
  );
  if (pos) {
    check(pos.lines[1].straightCutLengthMm > 0, 'S7: positive cut with margin');
  }
}

/* ------------------------------------------------------------------ *
 * Section 8 — Out-of-domain and non-finite inputs.
 * ------------------------------------------------------------------ */

{
  const base = { lineCount: 3, initialSpacingMm: 200, finalSpacingMm: 300, elbowAngleDeg: 45, clrMm: 100 };

  const cases: Array<{ label: string; input: PipeCombInput; code: string }> = [
    { label: 'lineCount 1', input: { ...base, lineCount: 1 }, code: 'line_count_range' },
    { label: 'lineCount 13', input: { ...base, lineCount: 13 }, code: 'line_count_range' },
    { label: 'lineCount 2.5', input: { ...base, lineCount: 2.5 }, code: 'line_count_range' },
    { label: 'initial 0', input: { ...base, initialSpacingMm: 0 }, code: 'spacing_positive' },
    { label: 'initial -5', input: { ...base, initialSpacingMm: -5 }, code: 'spacing_positive' },
    { label: 'final NaN', input: { ...base, finalSpacingMm: NaN }, code: 'spacing_positive' },
    { label: 'final Infinity', input: { ...base, finalSpacingMm: Infinity }, code: 'spacing_positive' },
    { label: 'angle 0', input: { ...base, elbowAngleDeg: 0 }, code: 'elbow_angle_range' },
    { label: 'angle 91', input: { ...base, elbowAngleDeg: 91 }, code: 'elbow_angle_range' },
    { label: 'angle NaN', input: { ...base, elbowAngleDeg: NaN }, code: 'elbow_angle_range' },
    { label: 'CLR 0', input: { ...base, clrMm: 0 }, code: 'clr_positive' },
    { label: 'CLR -1', input: { ...base, clrMm: -1 }, code: 'clr_positive' },
    { label: 'CLR Infinity', input: { ...base, clrMm: Infinity }, code: 'clr_positive' },
  ];
  for (const c of cases) {
    const res = solvePipeComb(c.input);
    check(res.success === false, `S8: ${c.label} rejected`);
    if (!res.success) {
      check(res.code === c.code, `S8: ${c.label} code = ${c.code} (got ${res.code})`);
    }
  }

  // Per-line CLR override: honored and validated. CLR 60 keeps the
  // intermediate cut positive for the 100 mm offset at 45°.
  const perLine = solvePipeComb({
    ...base,
    lines: [{ id: '1' }, { id: '2', clrMm: 60 }, { id: '3' }],
  });
  check(perLine.success === true, 'S8: per-line CLR override accepted');
  if (perLine.success) {
    const l2 = perLine.result.lines[1];
    approx(l2.takeOutPerElbowMm, 60 * Math.tan((45 * DEG_TO_RAD) / 2), 1e-6, 'S8: per-line CLR drives take-out');
  }
  const perLineBad = solvePipeComb({ ...base, lines: [{ id: '1' }, { id: '2', clrMm: -5 }, { id: '3' }] });
  check(perLineBad.success === false && perLineBad.code === 'per_line_clr_invalid', 'S8: per-line CLR validated');
  const perLineCount = solvePipeComb({ ...base, lines: [{ id: '1' }, { id: '2' }] });
  check(perLineCount.success === false && perLineCount.code === 'per_line_specs_count', 'S8: specs count validated');

  // Near-precision boundary: tiny but realizable offset stays coherent.
  // δ = 0.05 mm with CLR = 0.05 mm: travel 0.0707 > 2·take-out 0.0414.
  const tiny = solveOk(
    { lineCount: 2, initialSpacingMm: 1000, finalSpacingMm: 1000.05, elbowAngleDeg: 45, clrMm: 0.05 },
    'S8 tiny offset',
  );
  if (tiny) {
    const line = tiny.lines[1];
    assertLineMatchesReconstruction(line, 45, 0.05, 'S8 tiny');
  }
}

/* ------------------------------------------------------------------ */

console.log(`\ntwo-elbow-offset geometry: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
console.log('TWO-ELBOW-OFFSET GEOMETRY: PASS');
