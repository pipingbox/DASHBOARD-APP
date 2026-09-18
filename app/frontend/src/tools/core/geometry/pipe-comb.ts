/**
 * Pipe comb / parallel-line offset geometry.
 *
 * Internal convention: lengths in mm, angles in degrees.
 * Ticket: PB-TOOLS-FUNCTIONAL-PARITY-001 / W1.B.1
 *
 * Model (common commercial elbow angle for EVERY offset line):
 *   N parallel lines transition from initial center spacing to final center
 *   spacing. Line 0 is the reference (offset = 0, straight run: no elbows,
 *   no take-out). Line i is offset by i * (final - initial).
 *
 *   Every offset line uses two elbows of the SAME selected angle θ:
 *     advance_i = |offset_i| / tan(θ)   (horizontal run consumed by the jog)
 *     travel_i  = |offset_i| / sin(θ)   (diagonal between elbow centers)
 *     takeOut_i = CLR_i * tan(θ / 2)    (same angle, same CLR ⇒ same take-out)
 *     straight cut_i = travel_i - 2 * takeOut_i
 *
 *   Because the angle is common, advances and travels differ per line while
 *   the bend angle stays exactly the selected commercial elbow angle.
 *
 * Failure results carry a stable machine `code` plus interpolation `params`
 * so the UI can translate them; `reason` is an English technical fallback
 * only, never rendered directly as localized UI copy.
 */

import type { GeometryResult } from './offsets.ts';

const DEG_TO_RAD = Math.PI / 180;
const MAX_LINES = 12;
const MIN_LINES = 2;

export interface PipeCombLineSpec {
  /** Line identifier, e.g. "1", "2". */
  id: string;
  /** Optional per-line CLR override. If omitted, the common CLR is used. */
  clrMm?: number;
}

export interface PipeCombInput {
  /** Number of parallel lines (2–12). */
  lineCount: number;
  /** Center-to-center spacing at the start (mm). */
  initialSpacingMm: number;
  /** Center-to-center spacing at the end (mm). */
  finalSpacingMm: number;
  /** Common commercial elbow angle (degrees), e.g. 45 or 90. */
  elbowAngleDeg: number;
  /** Common center-line radius (mm). */
  clrMm: number;
  /** Optional per-line specs (id, per-line CLR). Defaults to numbered lines. */
  lines?: PipeCombLineSpec[];
}

export interface PipeCombLineResult {
  id: string;
  /** Offset of this line relative to the reference line (mm). Signed. */
  offsetMm: number;
  /** Absolute offset magnitude (mm). */
  offsetAbsMm: number;
  /** Horizontal advance consumed by the offset jog (mm). 0 for the reference line. */
  advanceMm: number;
  /** Travel along the pipe centerline between elbow centers (mm). 0 for the reference line. */
  travelMm: number;
  /** Take-out of one elbow (mm). 0 for the reference line. */
  takeOutPerElbowMm: number;
  /** Straight pipe length to cut between tangent points (mm). */
  straightCutLengthMm: number;
  /** Difference in travel vs the reference line (mm). */
  travelDifferenceMm: number;
}

export interface PipeCombSolution {
  /** Common elbow angle (degrees). */
  elbowAngleDeg: number;
  /** Number of lines. */
  lineCount: number;
  /** Spacing step between adjacent lines (mm). Signed. */
  deltaSpacingMm: number;
  /** Initial center spacing (mm). */
  initialSpacingMm: number;
  /** Final center spacing (mm). */
  finalSpacingMm: number;
  lines: PipeCombLineResult[];
  /** Longest travel among all lines (mm). */
  maxTravelMm: number;
  /** Shortest travel among all lines (mm). */
  minTravelMm: number;
  /** Difference between longest and shortest travel (mm). */
  travelSpreadMm: number;
}

function isFinitePositive(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

/**
 * Solve a pipe comb from initial/final spacing and a common elbow angle.
 *
 * Returns explicit N/A for invalid geometry (e.g. negative straight cut).
 */
export function solvePipeComb(input: PipeCombInput): GeometryResult<PipeCombSolution> {
  if (!Number.isInteger(input.lineCount) || input.lineCount < MIN_LINES || input.lineCount > MAX_LINES) {
    return {
      success: false,
      code: 'line_count_range',
      params: { min: MIN_LINES, max: MAX_LINES },
      reason: `Line count must be an integer between ${MIN_LINES} and ${MAX_LINES}`,
    };
  }
  if (!isFinitePositive(input.initialSpacingMm)) {
    return {
      success: false,
      code: 'spacing_positive',
      params: { field: 'initial' },
      reason: 'Initial spacing must be a positive finite length',
    };
  }
  if (!isFinitePositive(input.finalSpacingMm)) {
    return {
      success: false,
      code: 'spacing_positive',
      params: { field: 'final' },
      reason: 'Final spacing must be a positive finite length',
    };
  }
  if (!isFinitePositive(input.elbowAngleDeg) || input.elbowAngleDeg > 90) {
    return {
      success: false,
      code: 'elbow_angle_range',
      params: { max: 90 },
      reason: 'Elbow angle must be between 0° and 90°',
    };
  }
  if (!isFinitePositive(input.clrMm)) {
    return {
      success: false,
      code: 'clr_positive',
      params: {},
      reason: 'CLR must be a positive finite radius',
    };
  }

  const lineSpecs: PipeCombLineSpec[] = input.lines ?? Array.from({ length: input.lineCount }, (_, i) => ({ id: String(i + 1) }));
  if (lineSpecs.length !== input.lineCount) {
    return {
      success: false,
      code: 'per_line_specs_count',
      params: {},
      reason: 'Per-line specs count must match lineCount',
    };
  }

  const deltaSpacing = input.finalSpacingMm - input.initialSpacingMm;
  const elbowAngleRad = input.elbowAngleDeg * DEG_TO_RAD;
  const tanTheta = Math.tan(elbowAngleRad);
  const sinTheta = Math.sin(elbowAngleRad);
  const tanHalf = Math.tan(elbowAngleRad / 2);

  const solvedLines: PipeCombLineResult[] = [];
  for (let i = 0; i < input.lineCount; i++) {
    const spec = lineSpecs[i];
    const offsetMm = i * deltaSpacing;
    const offsetAbsMm = Math.abs(offsetMm);
    const isReference = offsetAbsMm === 0;

    const lineClr = spec.clrMm ?? input.clrMm;
    if (!isReference && !isFinitePositive(lineClr)) {
      return {
        success: false,
        code: 'per_line_clr_invalid',
        params: { line: spec.id },
        reason: `Line ${spec.id}: per-line CLR must be a positive finite radius`,
      };
    }

    // Reference line (offset 0) is straight: no elbows, no take-out.
    // Offset lines share the SAME elbow angle θ; advance and travel scale with |offset|.
    const advanceMm = isReference ? 0 : offsetAbsMm / tanTheta;
    const travelMm = isReference ? 0 : offsetAbsMm / sinTheta;
    const lineTakeOut = isReference ? 0 : lineClr * tanHalf;
    const straightCutLengthMm = travelMm - 2 * lineTakeOut;

    if (!isReference && (!Number.isFinite(advanceMm) || advanceMm <= 0)) {
      return {
        success: false,
        code: 'advance_invalid',
        params: { line: spec.id },
        reason: `Line ${spec.id}: computed advance is not a positive finite value`,
      };
    }
    if (straightCutLengthMm < 0) {
      return {
        success: false,
        code: 'negative_cut',
        params: { line: spec.id, value: straightCutLengthMm.toFixed(2) },
        reason: `Line ${spec.id}: straight cut length is negative (${straightCutLengthMm.toFixed(2)} mm); CLR too large for this comb geometry.`,
      };
    }

    solvedLines.push({
      id: spec.id,
      offsetMm: Number(offsetMm.toFixed(6)),
      offsetAbsMm: Number(offsetAbsMm.toFixed(6)),
      advanceMm: Number(advanceMm.toFixed(6)),
      travelMm: Number(travelMm.toFixed(6)),
      takeOutPerElbowMm: Number(lineTakeOut.toFixed(6)),
      straightCutLengthMm: Number(straightCutLengthMm.toFixed(6)),
      travelDifferenceMm: Number((travelMm - 0).toFixed(6)),
    });
  }

  const travels = solvedLines.map((l) => l.travelMm);
  const maxTravelMm = Math.max(...travels);
  const minTravelMm = Math.min(...travels);

  return {
    success: true,
    result: {
      elbowAngleDeg: input.elbowAngleDeg,
      lineCount: input.lineCount,
      deltaSpacingMm: Number(deltaSpacing.toFixed(6)),
      initialSpacingMm: Number(input.initialSpacingMm.toFixed(6)),
      finalSpacingMm: Number(input.finalSpacingMm.toFixed(6)),
      lines: solvedLines,
      maxTravelMm: Number(maxTravelMm.toFixed(6)),
      minTravelMm: Number(minTravelMm.toFixed(6)),
      travelSpreadMm: Number((maxTravelMm - minTravelMm).toFixed(6)),
    },
  };
}
