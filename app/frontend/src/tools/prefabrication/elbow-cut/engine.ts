/**
 * Pure elbow-cut geometry engine.
 *
 * Given a pipe OD, elbow center-line radius (CLR) and the angle to keep (beta),
 * compute the planar cut distances along the intrados, centerline and extrados.
 *
 * All inputs/outputs in mm and degrees. No React dependency.
 * Ticket: PB-TOOLS-FUNCTIONAL-PARITY-001 / W1.B
 */

export interface ElbowCutInput {
  /** Pipe outside diameter (mm). */
  odMm: number;
  /** Elbow center-line radius (mm). */
  clrMm: number;
  /** Total angle of the original commercial elbow (deg), e.g. 90. */
  totalAngleDeg: number;
  /** Desired resulting angle after cut (deg). Must be ≤ totalAngleDeg. */
  betaDeg: number;
}

export interface ElbowCutResult {
  odMm: number;
  clrMm: number;
  totalAngleDeg: number;
  betaDeg: number;
  /** Distance from tangent point to cut plane along intrados (mm). */
  cutIntradosMm: number;
  /** Distance from tangent point to cut plane along centerline (mm). */
  cutCenterlineMm: number;
  /** Distance from tangent point to cut plane along extrados (mm). */
  cutExtradosMm: number;
  /** Length of the kept centerline arc (mm). */
  keptArcLengthMm: number;
  /** Length of the discarded centerline arc (mm). */
  discardedArcLengthMm: number;
}

export type ElbowCutGeometryResult =
  | { success: true; result: ElbowCutResult }
  | { success: false; reason: string };

export function solveElbowCut(input: ElbowCutInput): ElbowCutGeometryResult {
  const { odMm, clrMm, totalAngleDeg, betaDeg } = input;

  if (!Number.isFinite(odMm) || odMm <= 0) {
    return { success: false, reason: 'OD must be a positive finite length' };
  }
  if (!Number.isFinite(clrMm) || clrMm <= odMm / 2) {
    return { success: false, reason: 'CLR must be greater than OD/2' };
  }
  if (!Number.isFinite(totalAngleDeg) || totalAngleDeg <= 0 || totalAngleDeg > 180) {
    return { success: false, reason: 'Total elbow angle must be between 0° and 180°' };
  }
  if (!Number.isFinite(betaDeg) || betaDeg <= 0 || betaDeg > totalAngleDeg) {
    return { success: false, reason: 'Cut angle must be between 0° and the total elbow angle' };
  }

  const betaRad = (betaDeg * Math.PI) / 180;
  const tanHalf = Math.tan(betaRad / 2);

  const cutIntradosMm = (clrMm - odMm / 2) * tanHalf;
  const cutCenterlineMm = clrMm * tanHalf;
  const cutExtradosMm = (clrMm + odMm / 2) * tanHalf;
  const keptArcLengthMm = clrMm * betaRad;
  const discardedArcLengthMm = clrMm * ((totalAngleDeg * Math.PI) / 180 - betaRad);

  return {
    success: true,
    result: {
      odMm,
      clrMm,
      totalAngleDeg,
      betaDeg,
      cutIntradosMm: Number(cutIntradosMm.toFixed(6)),
      cutCenterlineMm: Number(cutCenterlineMm.toFixed(6)),
      cutExtradosMm: Number(cutExtradosMm.toFixed(6)),
      keptArcLengthMm: Number(keptArcLengthMm.toFixed(6)),
      discardedArcLengthMm: Number(discardedArcLengthMm.toFixed(6)),
    },
  };
}
