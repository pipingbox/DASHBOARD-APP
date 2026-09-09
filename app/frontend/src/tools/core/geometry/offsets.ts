/**
 * Shared right-triangle geometry for pipe offsets.
 *
 * Internal convention: lengths in mm, angles in degrees.
 * Ticket: PB-TOOLS-FUNCTIONAL-PARITY-001 / W1.A.1
 */

import { clamp } from '../formatting/index.ts';

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const ANGLE_TOLERANCE_DEG = 0.01;

export interface RightTriangleSolution {
  a: number; // horizontal advance (mm)
  b: number; // vertical offset (mm)
  h: number; // hypotenuse / diagonal travel (mm)
  thetaDeg: number; // angle between A and H
}

export interface PartialRightTriangle {
  a?: number;
  b?: number;
  h?: number;
  thetaDeg?: number;
}

export type GeometryResult<T> =
  | { success: true; result: T }
  | { success: false; reason: string };

function isFinitePositive(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

function isFiniteNonNegative(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0;
}

/**
 * Solve a right triangle given exactly two of {a, b, h, thetaDeg}.
 * Returns all four values. Does not involve fittings.
 *
 * Throws for invalid input because the caller must provide a well-formed triangle.
 */
export function solveRightTriangle(input: PartialRightTriangle): RightTriangleSolution {
  const provided = [input.a, input.b, input.h, input.thetaDeg].filter((v) => v !== undefined && Number.isFinite(v));
  if (provided.length !== 2) {
    throw new Error('Exactly two of {a, b, h, thetaDeg} must be provided');
  }

  let { a, b, h, thetaDeg } = input;

  if (a !== undefined && b !== undefined) {
    h = Math.hypot(a, b);
    thetaDeg = Math.atan2(b, a) * RAD_TO_DEG;
  } else if (a !== undefined && h !== undefined) {
    if (h < a) throw new Error('Hypotenuse h cannot be smaller than advance a');
    b = Math.sqrt(h * h - a * a);
    thetaDeg = Math.atan2(b, a) * RAD_TO_DEG;
  } else if (b !== undefined && h !== undefined) {
    if (h < b) throw new Error('Hypotenuse h cannot be smaller than offset b');
    a = Math.sqrt(h * h - b * b);
    thetaDeg = Math.atan2(b, a) * RAD_TO_DEG;
  } else if (a !== undefined && thetaDeg !== undefined) {
    const thetaRad = thetaDeg * DEG_TO_RAD;
    b = a * Math.tan(thetaRad);
    h = a / Math.cos(thetaRad);
  } else if (b !== undefined && thetaDeg !== undefined) {
    const thetaRad = thetaDeg * DEG_TO_RAD;
    a = b / Math.tan(thetaRad);
    h = b / Math.sin(thetaRad);
  } else if (h !== undefined && thetaDeg !== undefined) {
    const thetaRad = thetaDeg * DEG_TO_RAD;
    a = h * Math.cos(thetaRad);
    b = h * Math.sin(thetaRad);
  }

  if (a === undefined || b === undefined || h === undefined || thetaDeg === undefined) {
    throw new Error('Unable to solve triangle');
  }

  if (![a, b, h, thetaDeg].every(Number.isFinite)) {
    throw new Error('Triangle solution produced non-finite value');
  }

  return {
    a: Number(a.toFixed(6)),
    b: Number(b.toFixed(6)),
    h: Number(h.toFixed(6)),
    thetaDeg: clamp(Number(thetaDeg.toFixed(6)), 0, 90),
  };
}

export interface ElbowOffsetInput {
  a: number;
  b: number;
  clrMm: number; // center-line radius of the elbow (mm)
  elbowAngleDeg: number; // angle of the commercial elbow (e.g. 45, 90)
}

export interface ElbowOffsetSolution extends RightTriangleSolution {
  elbowAngleDeg: number;
  takeOutPerElbowMm: number; // center-to-face of one elbow
  centerToCenterMm: number; // distance between elbow centers (same as h)
  straightCutLengthMm: number; // pipe length between tangent points
}

/**
 * Offset using two identical commercial elbows between two parallel lines.
 *
 * The geometry derived from A/B fixes the required elbow angle (theta).
 * The selected commercial elbow angle must match theta within tolerance.
 * Incompatible fittings return explicit N/A (no silent result).
 */
export function solveOffsetWithElbows(
  input: ElbowOffsetInput
): GeometryResult<ElbowOffsetSolution> {
  if (!isFinitePositive(input.a)) return { success: false, reason: 'A must be a positive finite length' };
  if (!isFinitePositive(input.b)) return { success: false, reason: 'B must be a positive finite length' };
  if (!isFinitePositive(input.clrMm)) return { success: false, reason: 'CLR must be a positive finite radius' };
  if (!isFinitePositive(input.elbowAngleDeg) || input.elbowAngleDeg > 90) {
    return { success: false, reason: 'Elbow angle must be between 0° and 90°' };
  }

  const triangle = solveRightTriangle({ a: input.a, b: input.b });

  if (Math.abs(triangle.thetaDeg - input.elbowAngleDeg) > ANGLE_TOLERANCE_DEG) {
    return {
      success: false,
      reason: `Geometry requires a ${triangle.thetaDeg.toFixed(2)}° elbow; selected ${input.elbowAngleDeg}° elbow is incompatible for 2D parallel-line offset.`,
    };
  }

  const elbowAngleRad = input.elbowAngleDeg * DEG_TO_RAD;
  const takeOutPerElbowMm = input.clrMm * Math.tan(elbowAngleRad / 2);
  const straightCutLengthMm = triangle.h - 2 * takeOutPerElbowMm;

  if (straightCutLengthMm < 0) {
    return {
      success: false,
      reason: `Straight cut length is negative (${straightCutLengthMm.toFixed(2)} mm): the selected elbow radius is too large for this offset geometry.`,
    };
  }

  return {
    success: true,
    result: {
      ...triangle,
      elbowAngleDeg: input.elbowAngleDeg,
      takeOutPerElbowMm: Number(takeOutPerElbowMm.toFixed(6)),
      centerToCenterMm: triangle.h,
      straightCutLengthMm: Number(straightCutLengthMm.toFixed(6)),
    },
  };
}

export interface FabricatedOffsetInput {
  a: number;
  b: number;
}

export interface FabricatedOffsetSolution extends RightTriangleSolution {
  cutAnglePerEndDeg: number; // angle to cut each end of the pipe
}

/**
 * Offset without elbows: a single pipe cut at angle θ/2 on each end and rotated.
 * The total bend angle equals the diagonal angle θ; each cut is half.
 */
export function solveOffsetWithoutElbows(
  input: FabricatedOffsetInput
): GeometryResult<FabricatedOffsetSolution> {
  if (!isFinitePositive(input.a)) return { success: false, reason: 'A must be a positive finite length' };
  if (!isFinitePositive(input.b)) return { success: false, reason: 'B must be a positive finite length' };

  const triangle = solveRightTriangle({ a: input.a, b: input.b });
  return {
    success: true,
    result: {
      ...triangle,
      cutAnglePerEndDeg: Number((triangle.thetaDeg / 2).toFixed(6)),
    },
  };
}

/**
 * Partial solver for offset verification.
 *
 * Given any two of {a, b, h, thetaDeg}, returns the complete right triangle.
 * This is NOT the full P3 verification tool (which must also accept three
 * measured values and compute consistency/tolerance). W1.B does not ship P3.
 * Ticket: PB-TOOLS-FUNCTIONAL-PARITY-001 / W1.A.1
 */
export function solveOffsetVerificationPartial(
  input: PartialRightTriangle
): GeometryResult<RightTriangleSolution> {
  try {
    return { success: true, result: solveRightTriangle(input) };
  } catch (err) {
    return {
      success: false,
      reason: err instanceof Error ? err.message : 'Unable to solve verification triangle',
    };
  }
}
