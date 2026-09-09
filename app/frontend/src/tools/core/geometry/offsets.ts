/**
 * Shared right-triangle geometry for pipe offsets.
 *
 * Internal convention: lengths in mm, angles in degrees.
 * Ticket: PB-TOOLS-FUNCTIONAL-PARITY-001 / W1.A
 */

import { clamp } from '../formatting/index.ts';

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

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

/**
 * Solve a right triangle given exactly two of {a, b, h, thetaDeg}.
 * Returns all four values. Does not involve fittings.
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
  elbowAngleDeg?: number; // angle of each elbow; default 90°
}

export interface ElbowOffsetSolution extends RightTriangleSolution {
  elbowAngleDeg: number;
  takeOutPerElbowMm: number; // center-to-face of one elbow
  centerToCenterMm: number; // distance between elbow centers (same as h)
  straightCutLengthMm: number; // pipe length between tangent points
}

/**
 * Offset using two identical elbows.
 * The diagonal center-to-center distance equals the right-triangle hypotenuse.
 * The straight cut length subtracts the take-out of both elbows.
 */
export function solveOffsetWithElbows(input: ElbowOffsetInput): ElbowOffsetSolution {
  const elbowAngleDeg = input.elbowAngleDeg ?? 90;
  const triangle = solveRightTriangle({ a: input.a, b: input.b });
  const elbowAngleRad = elbowAngleDeg * DEG_TO_RAD;
  const takeOutPerElbowMm = input.clrMm * Math.tan(elbowAngleRad / 2);
  const straightCutLengthMm = triangle.h - 2 * takeOutPerElbowMm;

  return {
    ...triangle,
    elbowAngleDeg,
    takeOutPerElbowMm: Number(takeOutPerElbowMm.toFixed(6)),
    centerToCenterMm: triangle.h,
    straightCutLengthMm: Number(straightCutLengthMm.toFixed(6)),
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
export function solveOffsetWithoutElbows(input: FabricatedOffsetInput): FabricatedOffsetSolution {
  const triangle = solveRightTriangle({ a: input.a, b: input.b });
  return {
    ...triangle,
    cutAnglePerEndDeg: Number((triangle.thetaDeg / 2).toFixed(6)),
  };
}

export type OffsetVerificationInput = PartialRightTriangle;

/**
 * Alias for solveRightTriangle used by the verification tool.
 * Given any two of {a, b, h, thetaDeg}, returns the complete triangle.
 */
export function solveOffsetVerification(input: OffsetVerificationInput): RightTriangleSolution {
  return solveRightTriangle(input);
}
