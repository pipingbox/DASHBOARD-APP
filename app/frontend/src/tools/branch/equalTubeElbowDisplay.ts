/**
 * PB-BRANCH-EQUAL-TUBE-ELBOW-001 — U6.2
 * TUBO ⇄ CODO IGUALES screen projection. Pure, no React, no DOM, no i18n.
 *
 * Same contract as elbowOnPipeDisplay (U5.2a): this module is the single
 * definition of what the equal-tube-elbow panel shows. The panel renders these
 * strings verbatim and `scripts/test-equal-tube-elbow-display.ts` asserts them
 * against the Tubero reference corpus, so the UI cannot drift away from the
 * validated U6.1 kernel numbers without a test failure.
 *
 * HARD RULES
 *
 * 1. STATION ORDER IS PHYSICAL. Stations are projected in the order returned by
 *    `computeEqualTubeElbowJoint` (0..N, N closing 0). The kernel's closure
 *    station duplicates station 0 geometrically; it is flagged `isClosure` and
 *    never renumbered.
 *
 * 2. NO GEOMETRY HERE. Every value is copied from the kernel result. The only
 *    derived quantity is `markFromEndMm = lengthMm − tubeCutPositionMm`, the
 *    cut-back measured from the square end at the elbow side, which is plain
 *    arithmetic on two kernel values and is what the physical tube template
 *    wraps against.
 *
 * 3. CONTOUR ID vs MARKING OD. The tube cut contour is computed on the tube ID
 *    by the kernel (Cota tubo), while the wrap/marking circumference and the
 *    station spacing use the OD. Both are surfaced, never blended.
 */

import { formatMm } from './formatMm.ts';
import type { EqualTubeElbowResult } from './equalTubeElbowGeometry.ts';

/** Decimals used on screen. Shared by the panel and its regression runner. */
export const EQUAL_TUBE_ELBOW_DECIMALS = {
  /** Summary dimensions: L, R, max cut-back. */
  summary: 2,
  /** Developed circumference, kept at the canonical 3 decimals. */
  circumference: 3,
  /** Station coordinates and arc outputs. */
  station: 3,
  /** Angles in degrees. */
  angle: 1,
} as const;

export type EqualTubeElbowSummaryKey =
  | 'length'
  | 'radius'
  | 'maxCutback'
  | 'div'
  | 'circumference';

export interface EqualTubeElbowSummaryEntry {
  key: EqualTubeElbowSummaryKey;
  /** Formatted millimetre value without unit. */
  value: string;
  external: false;
}

export interface EqualTubeElbowDisplayRow {
  /** Kernel station index, 0..N. */
  index: number;
  /** Physical shop label P1..PN; the closure row carries the closure flag. */
  label: string;
  /** True for station N, which closes station 0 and is not a new point. */
  isClosure: boolean;
  angleDeg: string;
  arcPosition: string;
  /** Cota tubo: remaining tube length at this generatrix, from the far square end. */
  tubeCota: string;
  /** Cut-back from the square end at the elbow side: L − Cota tubo. */
  markFromEnd: string;
  bendAngleDeg: string;
  arcRadius: string;
  arcLength: string;
  /** The cut reaches the physical 90 degree end face of the finite elbow. */
  clamped: boolean;
}

export interface EqualTubeElbowDisplay {
  summary: EqualTubeElbowSummaryEntry[];
  rows: EqualTubeElbowDisplayRow[];
  /** Physical stations (closure excluded) sitting on the 90 degree end face. */
  clampedCount: number;
}

function dimension(value: number): string {
  return formatMm(value, EQUAL_TUBE_ELBOW_DECIMALS.summary);
}

/**
 * Projects a valid kernel result into the exact strings the panel renders.
 * Returns null for an invalid result so the caller can never show partial
 * numbers next to an error.
 */
export function projectEqualTubeElbow(result: EqualTubeElbowResult): EqualTubeElbowDisplay | null {
  if (!result.valid) return null;

  const summary: EqualTubeElbowSummaryEntry[] = [
    { key: 'length', value: dimension(result.lengthMm), external: false },
    { key: 'radius', value: dimension(result.elbowCenterlineRadiusMm), external: false },
    { key: 'maxCutback', value: dimension(result.maxCutbackMm), external: false },
    { key: 'div', value: dimension(result.stationSpacingMm), external: false },
    {
      key: 'circumference',
      value: formatMm(result.circumferenceMm, EQUAL_TUBE_ELBOW_DECIMALS.circumference),
      external: false,
    },
  ];

  const rows = result.stations.map((station): EqualTubeElbowDisplayRow => ({
    index: station.index,
    label: `P${(station.index % result.divisions) + 1}`,
    isClosure: station.isClosure,
    angleDeg: formatMm((station.angleRad * 180) / Math.PI, EQUAL_TUBE_ELBOW_DECIMALS.angle),
    arcPosition: formatMm(station.circumferentialPositionMm, EQUAL_TUBE_ELBOW_DECIMALS.station),
    tubeCota: formatMm(station.tubeCutPositionMm, EQUAL_TUBE_ELBOW_DECIMALS.station),
    markFromEnd: formatMm(
      result.lengthMm - station.tubeCutPositionMm,
      EQUAL_TUBE_ELBOW_DECIMALS.station,
    ),
    bendAngleDeg: formatMm((station.elbowBendAngleRad * 180) / Math.PI, EQUAL_TUBE_ELBOW_DECIMALS.angle),
    arcRadius: formatMm(station.elbowArcRadiusMm, EQUAL_TUBE_ELBOW_DECIMALS.station),
    arcLength: formatMm(station.elbowArcLengthMm, EQUAL_TUBE_ELBOW_DECIMALS.station),
    clamped: station.clampedAtElbowEnd,
  }));

  return {
    summary,
    rows,
    clampedCount: rows.filter(row => !row.isClosure && row.clamped).length,
  };
}
