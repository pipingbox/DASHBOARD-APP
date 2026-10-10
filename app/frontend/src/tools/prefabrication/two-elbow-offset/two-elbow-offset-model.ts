/**
 * PB-PIPE-COMB-CORRECTION-001 / P4 — presentation adapter for the two-elbow
 * offset tool ("Desplazamiento con dos codos").
 *
 * The engine `solvePipeComb` (legacy W1.B.1, frozen) is the single source of
 * geometry. This module only derives PRESENTATION rows and statuses from its
 * solution; it never recomputes geometry.
 *
 * Contract reminders encoded here:
 *   - Reference line (offset 0): zeros mean "straight run, no elbows" — never
 *     "cut a 0 mm piece".
 *   - Displaced line with straightCutLengthMm = 0: elbows tangent to each
 *     other, NO intermediate straight stick — distinct from the reference
 *     line and from an order to cut 0 mm of pipe.
 *   - `travelMm` is the distance between the theoretical intersection points
 *     (PIs), NOT the elbow arc length. `advanceMm` is the horizontal run
 *     between the PIs, NOT a cut length.
 *   - The straight cut is NOMINAL between tangent points: it excludes weld
 *     gaps, assembly margins and saw kerf, which the tool does not add.
 *
 * Pure module: no React, no DOM, no i18n.
 */

import type { PipeCombSolution } from '../../core/geometry/pipe-comb.ts';

/** Presentation status of one solved line. */
export type TwoElbowOffsetLineStatus =
  /** Offset 0: straight run, no elbows, no take-out. */
  | 'reference'
  /** Displaced line with a positive intermediate straight. */
  | 'displaced'
  /** Displaced line whose elbows are tangent (zero intermediate straight). */
  | 'tangent_elbows';

export interface TwoElbowOffsetRow {
  /** Stable line identifier from the engine ("1".."N"). */
  id: string;
  status: TwoElbowOffsetLineStatus;
  /** Signed transverse displacement (mm). Sign = direction of the jog. */
  offsetMm: number;
  /** Horizontal run between the two PIs (mm). 0 for the reference line. */
  advanceMm: number;
  /** Distance between the two PIs along the diagonal (mm). NOT arc length. */
  travelMm: number;
  /** Take-out of ONE elbow, PI to tangent point (mm). */
  takeOutPerElbowMm: number;
  /** Nominal straight between tangent points (mm); 0 when elbows are tangent. */
  straightCutLengthMm: number;
  /** Travel difference vs the reference line (mm). */
  travelDifferenceMm: number;
}

/** Overall direction of the spacing change. */
export type TwoElbowOffsetDirection = 'expanding' | 'contracting' | 'straight';

export interface TwoElbowOffsetPresentation {
  direction: TwoElbowOffsetDirection;
  rows: TwoElbowOffsetRow[];
  /** True when at least one displaced line has tangent elbows (zero cut). */
  hasTangentElbows: boolean;
  /** Common elbow angle (degrees). */
  elbowAngleDeg: number;
  /** Travel spread across lines (mm). */
  travelSpreadMm: number;
}

function lineStatus(offsetAbsMm: number, straightCutLengthMm: number): TwoElbowOffsetLineStatus {
  if (offsetAbsMm === 0) return 'reference';
  if (straightCutLengthMm === 0) return 'tangent_elbows';
  return 'displaced';
}

/**
 * Derive presentation rows from an engine solution. Pure pass-through of
 * engine values plus status classification; no geometry is recomputed.
 */
export function presentTwoElbowOffset(solution: PipeCombSolution): TwoElbowOffsetPresentation {
  const rows = solution.lines.map((line) => ({
    id: line.id,
    status: lineStatus(line.offsetAbsMm, line.straightCutLengthMm),
    offsetMm: line.offsetMm,
    advanceMm: line.advanceMm,
    travelMm: line.travelMm,
    takeOutPerElbowMm: line.takeOutPerElbowMm,
    straightCutLengthMm: line.straightCutLengthMm,
    travelDifferenceMm: line.travelDifferenceMm,
  }));
  return {
    direction:
      solution.deltaSpacingMm > 0 ? 'expanding' : solution.deltaSpacingMm < 0 ? 'contracting' : 'straight',
    rows,
    hasTangentElbows: rows.some((r) => r.status === 'tangent_elbows'),
    elbowAngleDeg: solution.elbowAngleDeg,
    travelSpreadMm: solution.travelSpreadMm,
  };
}
