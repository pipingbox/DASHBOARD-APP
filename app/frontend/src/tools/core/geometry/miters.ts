/**
 * Mitered / segmented elbow geometry.
 *
 * Internal convention: lengths in mm, angles in degrees.
 * Ticket: PB-TOOLS-FUNCTIONAL-PARITY-001 / W1.A.1
 *
 * Terminology:
 *   N = number of straight pipe pieces (gores)
 *   J = N - 1 = number of equal miter joints
 *   joint deflection = totalAngleDeg / J
 *   cut angle per mating end = totalAngleDeg / (2 * J)
 *
 * Geometry derivation:
 *   The centerline is a polygonal chain inscribed in a circular arc of radius R.
 *   Each piece is a straight chord spanning angle beta = totalAngleDeg / J.
 *   Center-line length of one piece = 2 * R * sin(beta / 2).
 *   Intrados length = 2 * (R - OD/2) * sin(beta / 2).
 *   Extrados length = 2 * (R + OD/2) * sin(beta / 2).
 *
 * These are straight-piece lengths, not arc lengths. They are the validated
 * fabrication quantities exposed by this engine.
 */

import type { GeometryResult } from './offsets.ts';

const DEG_TO_RAD = Math.PI / 180;

export interface MiteredElbowInput {
  /** Total bend angle, e.g. 90 for a 90° elbow. */
  totalAngleDeg: number;
  /** Number of straight pipe pieces/gores (N ≥ 2). */
  segments: number;
  /** Center-line radius of the elbow (mm). */
  radiusMm: number;
  /** Outside diameter of the pipe (mm), used for development. */
  odMm: number;
}

export interface SegmentGeometry {
  segmentIndex: number;
  /** Straight center-line length of this piece (mm). */
  centerLineLengthMm: number;
  /** Angle to cut each mating end of this piece (degrees). */
  cutAngleDeg: number;
  /** Straight developed length on the intrados side (mm). */
  intradosLengthMm: number;
  /** Straight developed length on the extrados side (mm). */
  extradosLengthMm: number;
}

export interface MiteredElbowSolution {
  totalAngleDeg: number;
  /** N: number of straight pieces/gores. */
  segments: number;
  /** J: number of miter joints. */
  numberOfJoints: number;
  /** Deflection angle of each miter joint (degrees). */
  jointDeflectionDeg: number;
  /** Angle to cut each mating end (degrees). */
  cutAngleDeg: number;
  /** Sum of straight center-line piece lengths (mm). */
  totalCenterLineLengthMm: number;
  /** Geometry per piece (development). */
  segmentsGeometry: SegmentGeometry[];
}

function isFinitePositive(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

/**
 * Compute a mitered elbow from straight pipe pieces.
 *
 * Returns explicit N/A for unbuildable geometry (e.g. intrados radius ≤ 0).
 */
export function solveMiteredElbow(
  input: MiteredElbowInput
): GeometryResult<MiteredElbowSolution> {
  if (!Number.isInteger(input.segments) || input.segments < 2) {
    return { success: false, reason: 'Mitered elbow requires an integer N ≥ 2 straight pieces' };
  }
  if (!isFinitePositive(input.totalAngleDeg) || input.totalAngleDeg > 180) {
    return { success: false, reason: 'Total angle must be between 0° and 180°' };
  }
  if (!isFinitePositive(input.radiusMm)) {
    return { success: false, reason: 'Radius must be a positive finite length' };
  }
  if (!isFinitePositive(input.odMm)) {
    return { success: false, reason: 'OD must be a positive finite length' };
  }
  if (input.radiusMm <= input.odMm / 2) {
    return {
      success: false,
      reason: `Radius (${input.radiusMm} mm) must be greater than OD/2 (${input.odMm / 2} mm); otherwise the intrados collapses.`,
    };
  }

  const segments = input.segments;
  const numberOfJoints = segments - 1;
  const jointDeflectionDeg = input.totalAngleDeg / numberOfJoints;
  const cutAngleDeg = jointDeflectionDeg / 2;
  const halfJointRad = (jointDeflectionDeg * DEG_TO_RAD) / 2;

  const centerLineLengthMm = 2 * input.radiusMm * Math.sin(halfJointRad);
  const intradosLengthMm = 2 * (input.radiusMm - input.odMm / 2) * Math.sin(halfJointRad);
  const extradosLengthMm = 2 * (input.radiusMm + input.odMm / 2) * Math.sin(halfJointRad);

  if (![centerLineLengthMm, intradosLengthMm, extradosLengthMm].every((v) => v > 0 && Number.isFinite(v))) {
    return { success: false, reason: 'Computed piece lengths are not positive finite values' };
  }

  const segmentsGeometry: SegmentGeometry[] = [];
  for (let i = 0; i < segments; i++) {
    segmentsGeometry.push({
      segmentIndex: i + 1,
      centerLineLengthMm: Number(centerLineLengthMm.toFixed(6)),
      cutAngleDeg: Number(cutAngleDeg.toFixed(6)),
      intradosLengthMm: Number(intradosLengthMm.toFixed(6)),
      extradosLengthMm: Number(extradosLengthMm.toFixed(6)),
    });
  }

  return {
    success: true,
    result: {
      totalAngleDeg: input.totalAngleDeg,
      segments,
      numberOfJoints,
      jointDeflectionDeg: Number(jointDeflectionDeg.toFixed(6)),
      cutAngleDeg: Number(cutAngleDeg.toFixed(6)),
      totalCenterLineLengthMm: Number((centerLineLengthMm * segments).toFixed(6)),
      segmentsGeometry,
    },
  };
}
