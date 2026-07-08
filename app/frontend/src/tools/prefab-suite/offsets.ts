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

// ─── PB-029: Segmented Elbows (Codos a Gajos) ───

export interface SegmentedElbowResult {
  /** Total bend angle (degrees) */
  totalAngle: number;
  /** Number of miter cuts */
  cuts: number;
  /** Total number of pipe segments */
  segments: number;
  /** Bend radius at centerline (mm) */
  radius: number;
  /** Pipe OD (mm) */
  od: number;
  /** Bevel angle at each cut — measured from perpendicular to pipe axis */
  bevelAngle: number;
  /** Advance from center — center-to-end dimension (mm) */
  advance: number;
  /** Length of each END segment at centerline (mm) */
  endSegmentCL: number;
  /** Length of each MIDDLE segment at centerline (mm) */
  midSegmentCL: number;
  /** Length of each END segment at intrados (mm) */
  endSegmentInt: number;
  /** Length of each END segment at extrados (mm) */
  endSegmentExt: number;
  /** Length of each MIDDLE segment at intrados (mm) */
  midSegmentInt: number;
  /** Length of each MIDDLE segment at extrados (mm) */
  midSegmentExt: number;
}

// OD by NPS (same as elbow-cut)
const NPS_OD: Record<string, number> = {
  '1/2': 21.3, '3/4': 26.7, '1': 33.4, '1-1/4': 42.2, '1-1/2': 48.3,
  '2': 60.3, '2-1/2': 73.0, '3': 88.9, '4': 114.3, '5': 141.3,
  '6': 168.3, '8': 219.1, '10': 273.0, '12': 323.8, '14': 355.6,
  '16': 406.4, '18': 457.0, '20': 508.0, '24': 609.6,
};

export function getOdByNps(nps: string): number {
  return NPS_OD[nps] ?? 168.3;
}

/**
 * Calculate segmented elbow (codo a gajos) dimensions.
 *
 * A segmented elbow is made from straight pipe sections cut at angles and welded
 * together to form a bend. This is used when standard fittings are not available
 * or for large-diameter piping.
 *
 * @param totalAngleDeg - Total bend angle (e.g. 90°)
 * @param cuts - Number of miter cuts (e.g. 2 cuts = 3 segments)
 * @param nps - Nominal pipe size
 * @param radiusMultiplier - Bend radius as multiple of NPS (default 1.5 = LR equivalent)
 */
export function calculateSegmentedElbow(
  totalAngleDeg: number,
  cuts: number,
  nps: string,
  radiusMultiplier: number = 1.5,
): SegmentedElbowResult {
  const od = getOdByNps(nps);
  const halfOd = od / 2;

  // Parse NPS to numeric inches
  let npsNum: number;
  if (nps.includes('-')) {
    const parts = nps.split('-');
    npsNum = parseFloat(parts[0]) + parseFloat(parts[1].replace('/', '.'));
    // Handle fractions properly
    if (nps === '1-1/4') npsNum = 1.25;
    else if (nps === '1-1/2') npsNum = 1.5;
    else if (nps === '2-1/2') npsNum = 2.5;
  } else if (nps.includes('/')) {
    const [num, den] = nps.split('/').map(Number);
    npsNum = num / den;
  } else {
    npsNum = parseFloat(nps);
  }

  const R = radiusMultiplier * npsNum * 25.4; // mm
  const segments = cuts + 1;

  // Angle at each miter cut = totalAngle / cuts
  const anglePerCut = totalAngleDeg / cuts;
  // Bevel angle = half of the angle at each cut
  const bevelAngle = anglePerCut / 2;
  const bevelRad = (bevelAngle * Math.PI) / 180;

  // Advance from center = R × tan(totalAngle/2) — the center-to-end dimension
  const totalRad = (totalAngleDeg * Math.PI) / 180;
  const advance = R * Math.tan(totalRad / 2);

  // End segments: one bevel cut, one square end
  // Length at centerline = R × tan(bevelAngle)
  const endSegmentCL = R * Math.tan(bevelRad);
  // Length at intrados (shorter) = (R - OD/2) × tan(bevelAngle)
  const endSegmentInt = (R - halfOd) * Math.tan(bevelRad);
  // Length at extrados (longer) = (R + OD/2) × tan(bevelAngle)
  const endSegmentExt = (R + halfOd) * Math.tan(bevelRad);

  // Middle segments: two bevel cuts
  // Length at centerline = 2 × R × tan(bevelAngle)
  const midSegmentCL = 2 * R * Math.tan(bevelRad);
  const midSegmentInt = 2 * (R - halfOd) * Math.tan(bevelRad);
  const midSegmentExt = 2 * (R + halfOd) * Math.tan(bevelRad);

  return {
    totalAngle: totalAngleDeg,
    cuts,
    segments,
    radius: R,
    od,
    bevelAngle,
    advance,
    endSegmentCL,
    midSegmentCL,
    endSegmentInt: Math.max(0, endSegmentInt),
    endSegmentExt,
    midSegmentInt: Math.max(0, midSegmentInt),
    midSegmentExt,
  };
}
