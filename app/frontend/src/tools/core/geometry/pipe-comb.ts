/**
 * Pipe comb / parallel-line offset geometry.
 *
 * Internal convention: lengths in mm, angles in degrees.
 * Ticket: PB-TOOLS-FUNCTIONAL-PARITY-001 / W1.A.1
 *
 * Model:
 *   N parallel lines transition from initial center spacing to final center spacing.
 *   Line 0 is the reference (offset = 0). Line i is offset by i * (final - initial).
 *   A common elbow angle fixes the advance A = |deltaSpacing| / tan(elbowAngle).
 *   Each line's travel H_i = sqrt(A² + offset_i²).
 *   Straight cut length = H_i - 2 * takeOut(elbowAngle, CLR).
 *
 * This is the standard workshop pipe-comb model. Per-line fitting geometry is
 * allowed by the type but not required in W1.A.1.
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
  /** Travel along the pipe centerline between elbow centers (mm). */
  travelMm: number;
  /** Take-out of one elbow (mm). */
  takeOutPerElbowMm: number;
  /** Straight pipe length to cut between tangent points (mm). */
  straightCutLengthMm: number;
  /** Difference in travel vs the reference line (mm). */
  travelDifferenceMm: number;
}

export interface PipeCombSolution {
  /** Common advance A (mm). */
  advanceMm: number;
  /** Common elbow angle (degrees). */
  elbowAngleDeg: number;
  /** Number of lines. */
  lineCount: number;
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
      reason: `Line count must be an integer between ${MIN_LINES} and ${MAX_LINES}`,
    };
  }
  if (!isFinitePositive(input.initialSpacingMm)) {
    return { success: false, reason: 'Initial spacing must be a positive finite length' };
  }
  if (!isFinitePositive(input.finalSpacingMm)) {
    return { success: false, reason: 'Final spacing must be a positive finite length' };
  }
  if (!isFinitePositive(input.elbowAngleDeg) || input.elbowAngleDeg > 90) {
    return { success: false, reason: 'Elbow angle must be between 0° and 90°' };
  }
  if (!isFinitePositive(input.clrMm)) {
    return { success: false, reason: 'CLR must be a positive finite radius' };
  }

  const deltaSpacing = input.finalSpacingMm - input.initialSpacingMm;

  const elbowAngleRad = input.elbowAngleDeg * DEG_TO_RAD;
  const advanceMm = deltaSpacing === 0 ? 0 : Math.abs(deltaSpacing) / Math.tan(elbowAngleRad);
  const commonTakeOutMm = deltaSpacing === 0 ? 0 : input.clrMm * Math.tan(elbowAngleRad / 2);

  if (deltaSpacing !== 0 && (!Number.isFinite(advanceMm) || advanceMm <= 0)) {
    return { success: false, reason: 'Computed advance is not a positive finite value' };
  }

  const lineSpecs: PipeCombLineSpec[] = input.lines ?? Array.from({ length: input.lineCount }, (_, i) => ({ id: String(i + 1) }));
  if (lineSpecs.length !== input.lineCount) {
    return { success: false, reason: 'Per-line specs count must match lineCount' };
  }

  const solvedLines: PipeCombLineResult[] = [];
  for (let i = 0; i < input.lineCount; i++) {
    const spec = lineSpecs[i];
    const offsetMm = i * deltaSpacing;
    const offsetAbsMm = Math.abs(offsetMm);
    const travelMm = Math.hypot(advanceMm, offsetAbsMm);
    const lineTakeOut = deltaSpacing === 0 ? 0 : (spec.clrMm ?? input.clrMm) * Math.tan(elbowAngleRad / 2);
    const straightCutLengthMm = travelMm - 2 * lineTakeOut;

    if (straightCutLengthMm < 0) {
      return {
        success: false,
        reason: `Line ${spec.id}: straight cut length is negative (${straightCutLengthMm.toFixed(2)} mm); CLR too large for this comb geometry.`,
      };
    }

    solvedLines.push({
      id: spec.id,
      offsetMm: Number(offsetMm.toFixed(6)),
      offsetAbsMm: Number(offsetAbsMm.toFixed(6)),
      travelMm: Number(travelMm.toFixed(6)),
      takeOutPerElbowMm: Number(lineTakeOut.toFixed(6)),
      straightCutLengthMm: Number(straightCutLengthMm.toFixed(6)),
      travelDifferenceMm: Number((travelMm - advanceMm).toFixed(6)),
    });
  }

  const travels = solvedLines.map((l) => l.travelMm);
  const maxTravelMm = Math.max(...travels);
  const minTravelMm = Math.min(...travels);

  return {
    success: true,
    result: {
      advanceMm: Number(advanceMm.toFixed(6)),
      elbowAngleDeg: input.elbowAngleDeg,
      lineCount: input.lineCount,
      lines: solvedLines,
      maxTravelMm: Number(maxTravelMm.toFixed(6)),
      minTravelMm: Number(minTravelMm.toFixed(6)),
      travelSpreadMm: Number((maxTravelMm - minTravelMm).toFixed(6)),
    },
  };
}
