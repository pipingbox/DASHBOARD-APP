/**
 * Genuine pipe comb ("Peines de tubería") stagger geometry.
 *
 * Internal convention: lengths in mm, angles in degrees (radians internally).
 * Ticket: PB-PIPE-COMB-CORRECTION-001 / P1
 *
 * Model (frozen core law, validated 5/5 against the genuine Tubero source
 * corpus REF-01..REF-05 with no fitted coefficients):
 *
 *   A = (Df - Di * cos(theta)) / sin(theta)
 *
 * where
 *   Di    = initial perpendicular centre-to-centre spacing between adjacent
 *           parallel pipe axes
 *   Df    = final perpendicular centre-to-centre spacing, measured
 *           perpendicular to the FINAL (deflected) pipe axes
 *   theta = elbow / direction-change angle, 0 < theta <= 90 degrees
 *   A     = SIGNED longitudinal stagger between the elbow reference
 *           locations of two adjacent pipes
 *
 * Sign contract: the sign of A is geometrically meaningful and is NEVER
 * normalized with abs(). A > 0 staggers one longitudinal direction, A < 0 the
 * opposite direction, A = 0 means adjacent elbow reference locations are
 * longitudinally aligned.
 *
 * Equal numerical spacing (Di == Df) does NOT imply A == 0 (proven by source
 * REF-02: 200/200 @ 45 deg -> A = 82.842712... mm).
 *
 * Multi-pipe contract: for N equally spaced pipes sharing the same Di, Df and
 * theta, every adjacent pair has the same stagger A, so the cumulative
 * stagger of pipe i (1-based) is exactly (i - 1) * A.
 *
 * This kernel is a DIFFERENT geometric operation from `solvePipeComb` in
 * `pipe-comb.ts` (two-elbow parallel-offset jog). That engine is frozen and
 * remains untouched; both operations coexist.
 *
 * Purity: no React, no DOM, no i18n, no SVG, no PDF, no unit conversion, no
 * NPS/Schedule/OD/WT/CLR/LR-SR data, no display formatting or rounding.
 * Failure results carry a stable machine `code` plus interpolation `params`
 * so the UI can translate them; `reason` is an English technical fallback
 * only, never rendered directly as localized UI copy.
 */

import type { GeometryResult } from './offsets.ts';

const DEG_TO_RAD = Math.PI / 180;
const MIN_PIPES = 2;

/**
 * COMPUTATIONAL / RESOURCE SAFETY LIMIT — NOT a geometric limit and NOT a
 * fabrication limit.
 *
 * Pipe comb geometry itself has no mathematical maximum pipe count, and the
 * geometric domain of this kernel remains `pipeCount >= 2` (integer). But the
 * concrete API eagerly materializes one object per pipe in `pipes`, so an
 * unbounded count would allow excessive memory allocation and unbounded
 * synchronous execution. This ceiling bounds memory/time while staying far
 * above any realistic workshop comb and still permitting large engineering /
 * programmatic cases. It must NOT be reused as the future P2 UI limit: the
 * P2 UI will define its own much smaller usability/rendering policy
 * separately.
 */
export const MAX_COMPUTATIONAL_PIPES = 10_000;

/**
 * Safety factor over IEEE-754 double epsilon used to decide whether a raw
 * stagger magnitude is machine noise around an exact mathematical zero.
 *
 * Rounding analysis: cos, the product Di*cos(theta), the subtraction in the
 * numerator and the final division each contribute at most ~1 ulp, so the
 * absolute error of the computed A is bounded by roughly
 * K * EPSILON * max(Di, Df) / sin(theta). The 1/sin(theta) factor is the
 * conditioning of the division: for small angles the same numerator noise
 * maps to a larger absolute noise in A, so the tolerance must be
 * angle-aware. K = 100 keeps the threshold ~2 orders of magnitude above the
 * worst-case accumulated rounding error while staying far below any
 * physically meaningful stagger (1e-12 relative at mm scale).
 */
const ZERO_SAFETY_FACTOR = 100;

export type PipeCombStaggerDirection = 'positive' | 'negative' | 'aligned';

export interface PipeCombStaggerInput {
  /**
   * Number of parallel pipes. Geometric domain: integer >= 2 with no
   * mathematical upper bound. Execution is protected by
   * MAX_COMPUTATIONAL_PIPES (resource safety, not geometry).
   */
  pipeCount: number;
  /** Initial perpendicular centre-to-centre spacing (mm), > 0. */
  initialSpacingMm: number;
  /** Final perpendicular centre-to-centre spacing (mm), > 0. */
  finalSpacingMm: number;
  /** Elbow / direction-change angle (degrees), 0 < angle <= 90. */
  elbowAngleDeg: number;
}

export interface PipeCombStaggerPipe {
  /** 1-based pipe number. */
  pipeNumber: number;
  /** Cumulative signed stagger of this pipe relative to pipe 1 (mm). */
  cumulativeStaggerMm: number;
}

export interface PipeCombStaggerSolution {
  /** Echo of the input pipe count. */
  pipeCount: number;
  /** Echo of the initial perpendicular spacing (mm). */
  initialSpacingMm: number;
  /** Echo of the final perpendicular spacing (mm). */
  finalSpacingMm: number;
  /** Echo of the elbow angle (degrees). */
  elbowAngleDeg: number;
  /** Signed adjacent stagger A (mm). Exact 0 only when Df = Di*cos(theta) mathematically. */
  adjacentStaggerMm: number;
  /** Direction of the stagger, derived from the sign of A. */
  staggerDirection: PipeCombStaggerDirection;
  /** Per-pipe cumulative stagger: pipe 1 is exactly 0, pipe i is (i-1)*A. */
  pipes: PipeCombStaggerPipe[];
}

function fail(
  code: string,
  reason: string,
  params: Record<string, string | number>,
): GeometryResult<PipeCombStaggerSolution> {
  return { success: false, code, params, reason };
}

/**
 * Solve the genuine pipe comb stagger for N equally spaced parallel pipes.
 *
 * Pure deterministic geometry: same inputs always yield the same outputs,
 * with machine-readable failures for every out-of-domain input.
 */
export function solvePipeCombStagger(input: PipeCombStaggerInput): GeometryResult<PipeCombStaggerSolution> {
  // Finiteness first, so NaN/Infinity can never propagate silently.
  const fields: Array<[string, number]> = [
    ['pipeCount', input.pipeCount],
    ['initialSpacingMm', input.initialSpacingMm],
    ['finalSpacingMm', input.finalSpacingMm],
    ['elbowAngleDeg', input.elbowAngleDeg],
  ];
  for (const [field, value] of fields) {
    if (!Number.isFinite(value)) {
      return fail('non_finite_input', `Field ${field} must be a finite number`, { field, value: String(value) });
    }
  }

  if (input.initialSpacingMm <= 0) {
    return fail('initial_spacing_positive', 'Initial spacing must be a positive finite length', {
      field: 'initial',
    });
  }
  if (input.finalSpacingMm <= 0) {
    return fail('final_spacing_positive', 'Final spacing must be a positive finite length', {
      field: 'final',
    });
  }
  if (input.elbowAngleDeg <= 0 || input.elbowAngleDeg > 90) {
    return fail('elbow_angle_range', 'Elbow angle must satisfy 0 < angle <= 90 degrees', {
      min: 0,
      max: 90,
      value: input.elbowAngleDeg,
    });
  }
  if (!Number.isInteger(input.pipeCount) || input.pipeCount < MIN_PIPES) {
    return fail('pipe_count_range', `Pipe count must be an integer >= ${MIN_PIPES}`, { min: MIN_PIPES });
  }
  // Computational / resource safety limit. Checked BEFORE the `pipes` array
  // is built so a huge count fails immediately without allocating or
  // iterating. Deliberately NOT `pipe_count_range`: the geometric domain has
  // no upper bound; only this API's eager per-pipe materialization does.
  if (input.pipeCount > MAX_COMPUTATIONAL_PIPES) {
    return fail(
      'pipe_count_resource_limit',
      `Pipe count exceeds the computational resource limit of ${MAX_COMPUTATIONAL_PIPES}`,
      { max: MAX_COMPUTATIONAL_PIPES, value: input.pipeCount },
    );
  }

  const thetaRad = input.elbowAngleDeg * DEG_TO_RAD;
  const sinTheta = Math.sin(thetaRad);
  const rawStaggerMm = (input.finalSpacingMm - input.initialSpacingMm * Math.cos(thetaRad)) / sinTheta;

  // Normalize only machine-noise-level zeros to exactly 0 (see
  // ZERO_SAFETY_FACTOR above). Meaningful small staggers are preserved and
  // normal geometry is never rounded.
  const zeroToleranceMm =
    (ZERO_SAFETY_FACTOR * Number.EPSILON * Math.max(input.initialSpacingMm, input.finalSpacingMm)) / sinTheta;
  const adjacentStaggerMm = Math.abs(rawStaggerMm) <= zeroToleranceMm ? 0 : rawStaggerMm;

  const staggerDirection: PipeCombStaggerDirection =
    adjacentStaggerMm > 0 ? 'positive' : adjacentStaggerMm < 0 ? 'negative' : 'aligned';

  const pipes: PipeCombStaggerPipe[] = [];
  for (let i = 0; i < input.pipeCount; i++) {
    pipes.push({ pipeNumber: i + 1, cumulativeStaggerMm: i * adjacentStaggerMm });
  }

  return {
    success: true,
    result: {
      pipeCount: input.pipeCount,
      initialSpacingMm: input.initialSpacingMm,
      finalSpacingMm: input.finalSpacingMm,
      elbowAngleDeg: input.elbowAngleDeg,
      adjacentStaggerMm,
      staggerDirection,
      pipes,
    },
  };
}
