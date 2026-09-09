/**
 * Mitered / segmented elbow geometry.
 *
 * Internal convention: lengths in mm, angles in degrees.
 * Ticket: PB-TOOLS-FUNCTIONAL-PARITY-001 / W1.A
 */

const DEG_TO_RAD = Math.PI / 180;

export interface MiteredElbowInput {
  /** Total bend angle, e.g. 90 for a 90° elbow. */
  totalAngleDeg: number;
  /** Number of straight pieces/gores (≥2). */
  segments: number;
  /** Center-line radius of the elbow (mm). */
  radiusMm: number;
  /** Outside diameter of the pipe (mm), used for development. */
  odMm: number;
}

export interface SegmentGeometry {
  segmentIndex: number;
  /** Length of the segment measured along the centerline (mm). */
  centerLineLengthMm: number;
  /** Angle to cut each end of this segment (degrees). */
  cutAngleDeg: number;
  /** Developed length on the intrados (short side) (mm). */
  intradosLengthMm: number;
  /** Developed length on the extrados (long side) (mm). */
  extradosLengthMm: number;
}

export interface MiteredElbowSolution {
  totalAngleDeg: number;
  segments: number;
  numberOfCuts: number;
  /** Angle per miter cut (degrees). */
  cutAngleDeg: number;
  /** Sum of centerline arc length = radius * totalAngleRad. */
  totalCenterLineLengthMm: number;
  /** Geometry per segment (development). */
  segmentsGeometry: SegmentGeometry[];
}

/**
 * Compute a mitered elbow: total angle divided into N pieces.
 *
 * Each miter joint contributes 2*cutAngleDeg to the total bend, so:
 *   cutAngleDeg = totalAngleDeg / (2 * (segments - 1))
 *
 * The centerline of each segment follows a circular arc of radius `radiusMm`.
 */
export function solveMiteredElbow(input: MiteredElbowInput): MiteredElbowSolution {
  if (input.segments < 2) {
    throw new Error('Mitered elbow requires at least 2 segments');
  }
  if (input.totalAngleDeg <= 0 || input.totalAngleDeg > 180) {
    throw new Error('Total angle must be between 0° and 180°');
  }
  if (input.radiusMm <= 0 || input.odMm <= 0) {
    throw new Error('Radius and OD must be positive');
  }

  const numberOfCuts = input.segments - 1;
  const cutAngleDeg = input.totalAngleDeg / (2 * numberOfCuts);
  const totalAngleRad = input.totalAngleDeg * DEG_TO_RAD;
  const totalCenterLineLengthMm = input.radiusMm * totalAngleRad;
  const segmentCenterLineLengthMm = totalCenterLineLengthMm / input.segments;

  const segmentsGeometry: SegmentGeometry[] = [];
  const segmentAngleRad = totalAngleRad / input.segments;
  const intradosRadiusMm = input.radiusMm - input.odMm / 2;
  const extradosRadiusMm = input.radiusMm + input.odMm / 2;

  for (let i = 0; i < input.segments; i++) {
    // Length along intrados/extrados arc for this segment.
    const intradosLengthMm = intradosRadiusMm * segmentAngleRad;
    const extradosLengthMm = extradosRadiusMm * segmentAngleRad;

    segmentsGeometry.push({
      segmentIndex: i + 1,
      centerLineLengthMm: Number(segmentCenterLineLengthMm.toFixed(6)),
      cutAngleDeg: Number(cutAngleDeg.toFixed(6)),
      intradosLengthMm: Number(intradosLengthMm.toFixed(6)),
      extradosLengthMm: Number(extradosLengthMm.toFixed(6)),
    });
  }

  return {
    totalAngleDeg: input.totalAngleDeg,
    segments: input.segments,
    numberOfCuts,
    cutAngleDeg: Number(cutAngleDeg.toFixed(6)),
    totalCenterLineLengthMm: Number(totalCenterLineLengthMm.toFixed(6)),
    segmentsGeometry,
  };
}
