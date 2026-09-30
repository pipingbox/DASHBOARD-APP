/**
 * Mitered / segmented elbow geometry.
 *
 * Internal convention: lengths in mm, angles in degrees.
 * Ticket: PB-TOOLS-FUNCTIONAL-PARITY-001 / W1.B.1
 *
 * Terminology:
 *   N = number of straight pipe pieces (gores)
 *   J = N - 1 = number of equal miter joints
 *   joint deflection δ = totalAngleDeg / J
 *   cut angle per mating end φ = δ / 2 = totalAngleDeg / (2 * J)
 *
 * Geometry derivation (tangent-length model):
 *   The centerline is a polygonal chain whose J vertices lie on a circular
 *   arc of radius R. At each miter joint the direction changes by δ, so the
 *   joint consumes a tangent length T = R * tan(δ / 2) on EACH side of the
 *   vertex (standard circular-curve tangent relation tan(δ/2) = T / R).
 *
 *   - End pieces (first and last): one square end + one mitered end.
 *     Centerline length = T = R * tan(δ / 2).
 *   - Middle pieces: two mitered ends.
 *     Centerline length = 2T = 2 * R * tan(δ / 2).
 *
 *   Consistency check: total centerline = 2 * T + (N - 2) * 2T = 2 * J * T,
 *   and the swept angle is exactly J * δ = totalAngleDeg by construction.
 *
 *   Intrados/extrados cut lengths follow the same tangent relation with the
 *   bend radius shifted by ±OD/2 (the miter cut plane is common, so lengths
 *   scale with the local radius):
 *     L_intrados = L_center * (R - OD/2) / R
 *     L_extrados = L_center * (R + OD/2) / R
 *
 *   End pieces and middle pieces are each identical among themselves, which
 *   is the workshop property that makes a mitered elbow economical to cut.
 *
 * Failure results carry a stable machine `code` plus interpolation `params`
 * so the UI can translate them; `reason` is an English technical fallback.
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
  /** 'end' pieces have one square end; 'middle' pieces are mitered on both ends. */
  kind: 'end' | 'middle';
  /** Straight center-line length of this piece (mm). */
  centerLineLengthMm: number;
  /** Angle to cut each mating end of this piece (degrees). */
  cutAngleDeg: number;
  /** Cut length on the intrados side (mm). */
  intradosLengthMm: number;
  /** Cut length on the extrados side (mm). */
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
  /** Tangent length consumed by each joint on each side (mm): T = R * tan(δ/2). */
  tangentLengthMm: number;
  /** Sum of straight center-line piece lengths (mm) = 2 * J * T. */
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
    return {
      success: false,
      code: 'segments_min',
      params: { min: 2 },
      reason: 'Mitered elbow requires an integer N ≥ 2 straight pieces',
    };
  }
  if (!isFinitePositive(input.totalAngleDeg) || input.totalAngleDeg > 180) {
    return {
      success: false,
      code: 'total_angle_range',
      params: { max: 180 },
      reason: 'Total angle must be between 0° and 180°',
    };
  }
  if (!isFinitePositive(input.radiusMm)) {
    return {
      success: false,
      code: 'radius_positive',
      params: {},
      reason: 'Radius must be a positive finite length',
    };
  }
  if (!isFinitePositive(input.odMm)) {
    return {
      success: false,
      code: 'od_positive',
      params: {},
      reason: 'OD must be a positive finite length',
    };
  }
  if (input.radiusMm <= input.odMm / 2) {
    return {
      success: false,
      code: 'radius_gt_half_od',
      params: { radius: input.radiusMm, halfOd: input.odMm / 2 },
      reason: `Radius (${input.radiusMm} mm) must be greater than OD/2 (${input.odMm / 2} mm); otherwise the intrados collapses.`,
    };
  }

  const segments = input.segments;
  const numberOfJoints = segments - 1;
  const jointDeflectionDeg = input.totalAngleDeg / numberOfJoints;
  const cutAngleDeg = jointDeflectionDeg / 2;
  const halfJointRad = (jointDeflectionDeg * DEG_TO_RAD) / 2;

  // Tangent-length model: T = R * tan(δ/2).
  const tangentLengthMm = input.radiusMm * Math.tan(halfJointRad);
  const middleCenterMm = 2 * tangentLengthMm;
  const endCenterMm = tangentLengthMm;

  // Intrados/extrados scale with the local bend radius (R ∓ OD/2).
  const intradosScale = (input.radiusMm - input.odMm / 2) / input.radiusMm;
  const extradosScale = (input.radiusMm + input.odMm / 2) / input.radiusMm;

  const pieceLengths = [endCenterMm, middleCenterMm];
  if (!pieceLengths.every((v) => v > 0 && Number.isFinite(v))) {
    return {
      success: false,
      code: 'piece_lengths_invalid',
      params: {},
      reason: 'Computed piece lengths are not positive finite values',
    };
  }

  const segmentsGeometry: SegmentGeometry[] = [];
  for (let i = 0; i < segments; i++) {
    const kind: 'end' | 'middle' = i === 0 || i === segments - 1 ? 'end' : 'middle';
    const center = kind === 'end' ? endCenterMm : middleCenterMm;
    segmentsGeometry.push({
      segmentIndex: i + 1,
      kind,
      centerLineLengthMm: Number(center.toFixed(6)),
      cutAngleDeg: Number(cutAngleDeg.toFixed(6)),
      intradosLengthMm: Number((center * intradosScale).toFixed(6)),
      extradosLengthMm: Number((center * extradosScale).toFixed(6)),
    });
  }

  const totalCenterLineLengthMm = 2 * endCenterMm + (segments - 2) * middleCenterMm;

  return {
    success: true,
    result: {
      totalAngleDeg: input.totalAngleDeg,
      segments,
      numberOfJoints,
      jointDeflectionDeg: Number(jointDeflectionDeg.toFixed(6)),
      cutAngleDeg: Number(cutAngleDeg.toFixed(6)),
      tangentLengthMm: Number(tangentLengthMm.toFixed(6)),
      totalCenterLineLengthMm: Number(totalCenterLineLengthMm.toFixed(6)),
      segmentsGeometry,
    },
  };
}
