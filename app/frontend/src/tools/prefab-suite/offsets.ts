// PB-027: Offset / Quiebro calculations for piping prefabrication
// All dimensions in mm. Angles in degrees.

/** Standard elbow center-to-end (ASME B16.9) by NPS in inches */
const ELBOW_ADVANCE: Record<string, { lr90: number; sr90: number; lr45: number }> = {
  '1/2': { lr90: 38.1, sr90: 25.4, lr45: 16 },
  '3/4': { lr90: 38.1, sr90: 25.4, lr45: 16 },
  '1': { lr90: 38.1, sr90: 25.4, lr45: 22 },
  '1-1/4': { lr90: 47.6, sr90: 31.8, lr45: 25 },
  '1-1/2': { lr90: 57.2, sr90: 38.1, lr45: 29 },
  '2': { lr90: 76.2, sr90: 50.8, lr45: 35 },
  '2-1/2': { lr90: 95.3, sr90: 63.5, lr45: 44 },
  '3': { lr90: 114.3, sr90: 76.2, lr45: 51 },
  '4': { lr90: 152.4, sr90: 101.6, lr45: 64 },
  '5': { lr90: 190.5, sr90: 127.0, lr45: 79 },
  '6': { lr90: 228.6, sr90: 152.4, lr45: 95 },
  '8': { lr90: 304.8, sr90: 203.2, lr45: 127 },
  '10': { lr90: 381.0, sr90: 254.0, lr45: 159 },
  '12': { lr90: 457.2, sr90: 304.8, lr45: 190 },
  '14': { lr90: 533.4, sr90: 355.6, lr45: 222 },
  '16': { lr90: 609.6, sr90: 406.4, lr45: 254 },
  '18': { lr90: 685.8, sr90: 457.2, lr45: 286 },
  '20': { lr90: 762.0, sr90: 508.0, lr45: 317 },
  '24': { lr90: 914.4, sr90: 609.6, lr45: 381 },
};

export const NPS_OPTIONS = Object.keys(ELBOW_ADVANCE);

export type ElbowType = '90LR' | '90SR' | '45LR';

export function getElbowAdvance(nps: string, type: ElbowType): number {
  const entry = ELBOW_ADVANCE[nps];
  if (!entry) return 0;
  if (type === '90LR') return entry.lr90;
  if (type === '90SR') return entry.sr90;
  return entry.lr45;
}

export interface OffsetWithElbowsResult {
  /** Offset distance (perpendicular) */
  offset: number;
  /** Travel — length along the inclined run */
  travel: number;
  /** Run — horizontal projection */
  run: number;
  /** Advance of each elbow (center-to-end) */
  elbowAdvance: number;
  /** Cut length of the inclined pipe (travel minus 2 × elbow advance) */
  cutLength: number;
  /** Center-to-center between elbows */
  centerToCenter: number;
  /** Angle used (degrees) */
  angle: number;
}

/**
 * Calculate offset (quiebro) with standard elbows.
 *
 * Given an offset height and angle, calculates all dimensions needed for fabrication.
 * The "travel" is the hypotenuse; "run" is the adjacent side.
 * Elbow advances are subtracted to give the actual cut length.
 *
 * @param offsetMm - Offset distance in mm (the perpendicular displacement)
 * @param angleDeg - Angle of the offset (typically 45°, but can be 22.5°, 30°, 60°)
 * @param nps - Nominal pipe size (e.g. '6')
 * @param elbowType - Type of elbow: 90LR, 90SR, or 45LR
 */
export function calculateOffsetWithElbows(
  offsetMm: number,
  angleDeg: number,
  nps: string,
  elbowType: ElbowType,
): OffsetWithElbowsResult {
  const rad = (angleDeg * Math.PI) / 180;
  const sinA = Math.sin(rad);
  const cosA = Math.cos(rad);
  const tanA = Math.tan(rad);

  // Travel = offset / sin(angle)
  const travel = offsetMm / sinA;
  // Run = offset / tan(angle)
  const run = offsetMm / tanA;

  const elbowAdvance = getElbowAdvance(nps, elbowType);

  // Center-to-center = travel
  const centerToCenter = travel;

  // Cut length = travel - 2 × elbow advance (one at each end)
  // For 45° elbows used at non-45° offsets, we use the component of advance along travel
  const cutLength = Math.max(0, travel - 2 * elbowAdvance);

  return {
    offset: offsetMm,
    travel,
    run,
    elbowAdvance,
    cutLength,
    centerToCenter,
    angle: angleDeg,
  };
}

export interface OffsetWithoutElbowsResult {
  offset: number;
  travel: number;
  run: number;
  angle: number;
  /** Miter cut angle (half the bend angle from the pipe axis) */
  miterAngle: number;
}

/**
 * Calculate offset without elbows (direct pipe bends / miter cuts).
 * Used when the offset is made by cutting the pipe at an angle.
 */
export function calculateOffsetWithoutElbows(
  offsetMm: number,
  angleDeg: number,
): OffsetWithoutElbowsResult {
  const rad = (angleDeg * Math.PI) / 180;
  const travel = offsetMm / Math.sin(rad);
  const run = offsetMm / Math.tan(rad);
  const miterAngle = angleDeg / 2;

  return { offset: offsetMm, travel, run, angle: angleDeg, miterAngle };
}

export interface OffsetVerifyResult {
  /** Whether the measured values match the calculated offset */
  isCorrect: boolean;
  /** Expected offset from the measured travel + angle */
  expectedOffset: number;
  /** Difference between measured and expected */
  deviation: number;
  /** Tolerance in mm */
  tolerance: number;
}

/**
 * Verify an existing offset by checking if measured dimensions are consistent.
 */
export function verifyOffset(
  measuredOffset: number,
  measuredTravel: number,
  angleDeg: number,
  toleranceMm: number = 3,
): OffsetVerifyResult {
  const rad = (angleDeg * Math.PI) / 180;
  const expectedOffset = measuredTravel * Math.sin(rad);
  const deviation = Math.abs(measuredOffset - expectedOffset);

  return {
    isCorrect: deviation <= toleranceMm,
    expectedOffset,
    deviation,
    tolerance: toleranceMm,
  };
}
