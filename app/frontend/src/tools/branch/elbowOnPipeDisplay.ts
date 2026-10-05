/**
 * PB-BRANCH-INJERTO-EXPANSION-001 — U5.2a
 * CODO → TUBO screen projection. Pure, no React, no DOM, no i18n.
 *
 * This module is the single definition of what the elbow-on-pipe panel shows.
 * The panel renders these strings verbatim and the regression runner
 * `scripts/test-elbow-on-pipe-display.ts` asserts them against the Tubero
 * reference corpus, so the UI contract cannot drift away from the validated
 * numbers without a test failure.
 *
 * TWO HARD RULES
 *
 * 1. STATION ORDER IS PHYSICAL. Stations are projected in the order returned by
 *    `computeElbowOnPipe` (0..N, N closing 0). The Tubero row re-indexing proved
 *    in U5-PREFLIGHT-R3 lives only in the test fixture; it must never appear in
 *    product code, because a PIPINGBOX station is one physical point whose
 *    Picaje X, Picaje Y, bend angle and arc outputs share a single phase.
 *
 * 2. COTA Y' IS EXTERNAL. Y' is a positioning dimension the fabricator carries
 *    over from the drawing; it is NOT an input of the geometry kernel. Passing
 *    it here can only add the `cotaY` summary entry. Every other summary entry
 *    and every station row is derived from the kernel result alone, so they are
 *    bit-identical whether Y' is absent or set. This reproduces the controlled
 *    REF-07 / REF-08 pair, identical cell by cell with and without Y' = 100.
 */

import { formatMm } from './formatMm.ts';
import type { ElbowOnPipeResult } from './elbowOnPipeGeometry';

/** Decimals used on screen. Shared by the panel and its regression runner. */
export const ELBOW_ON_PIPE_DECIMALS = {
  /** Summary dimensions: Cota X', seating height, Div, Cota Y'. */
  summary: 2,
  /** Developed circumference, kept at the canonical 3 decimals. */
  circumference: 3,
  /** Station coordinates and arc outputs. */
  station: 3,
  /** Angles in degrees. */
  angle: 1,
} as const;

export type ElbowOnPipeSummaryKey =
  | 'cotaX'
  | 'seatingHeight'
  | 'div'
  | 'circumference'
  | 'cotaY';

export interface ElbowOnPipeSummaryEntry {
  key: ElbowOnPipeSummaryKey;
  /** Formatted millimetre value without unit. */
  value: string;
  /**
   * True only for `cotaY`: an external positioning dimension echoed back to the
   * user, never a kernel output.
   */
  external: boolean;
}

export interface ElbowOnPipeDisplayRow {
  /** Kernel station index, 0..N. */
  index: number;
  /**
   * Physical shop label P1..PN. Station N carries the label of station 0 because
   * it is the same point; the panel replaces it with the localized closure text
   * using `isClosure`, it does not invent a new station number.
   */
  label: string;
  /** True for station N, which closes station 0 and is not a new point. */
  isClosure: boolean;
  angleDeg: string;
  arcPosition: string;
  picajeX: string;
  picajeY: string;
  arcRadius: string;
  arcLength: string;
  bendAngleDeg: string;
  /** The cut reaches the physical 90 degree end face of the finite elbow. */
  clamped: boolean;
}

export interface ElbowOnPipeDisplay {
  summary: ElbowOnPipeSummaryEntry[];
  rows: ElbowOnPipeDisplayRow[];
  /** Physical stations (station N excluded) sitting on the 90 degree end face. */
  clampedCount: number;
}

export interface ElbowOnPipeDisplayOptions {
  /**
   * Cota Y' in millimetres, or null when the user left it blank. External
   * positioning dimension only: it never reaches the geometry kernel.
   */
  yPrimeMm?: number | null;
}

function dimension(value: number): string {
  return formatMm(value, ELBOW_ON_PIPE_DECIMALS.summary);
}

/**
 * Projects a valid kernel result into the exact strings the panel renders.
 * Returns null for an invalid result so the caller can never show partial
 * numbers next to an error.
 */
export function projectElbowOnPipe(
  result: ElbowOnPipeResult,
  options: ElbowOnPipeDisplayOptions = {},
): ElbowOnPipeDisplay | null {
  if (!result.valid) return null;

  const summary: ElbowOnPipeSummaryEntry[] = [
    { key: 'cotaX', value: dimension(result.cotaXMm), external: false },
    { key: 'seatingHeight', value: dimension(result.seatingHeightMm), external: false },
    { key: 'div', value: dimension(result.stationSpacingMm), external: false },
    {
      key: 'circumference',
      value: formatMm(result.circumferenceMm, ELBOW_ON_PIPE_DECIMALS.circumference),
      external: false,
    },
  ];

  /* Cota Y' is appended, never interleaved, and flagged external so the UI can
     mark it as a positioning dimension rather than a computed one. */
  const yPrime = options.yPrimeMm;
  if (yPrime !== null && yPrime !== undefined && Number.isFinite(yPrime)) {
    summary.push({ key: 'cotaY', value: dimension(yPrime), external: true });
  }

  const rows = result.stations.map((station): ElbowOnPipeDisplayRow => ({
    index: station.index,
    label: `P${(station.index % result.divisions) + 1}`,
    isClosure: station.index === result.divisions,
    angleDeg: formatMm(station.angleDeg, ELBOW_ON_PIPE_DECIMALS.angle),
    arcPosition: formatMm(station.arcPositionMm, ELBOW_ON_PIPE_DECIMALS.station),
    picajeX: formatMm(station.picajeXMm, ELBOW_ON_PIPE_DECIMALS.station),
    picajeY: formatMm(station.picajeYMm, ELBOW_ON_PIPE_DECIMALS.station),
    arcRadius: formatMm(station.arcRadiusMm, ELBOW_ON_PIPE_DECIMALS.station),
    arcLength: formatMm(station.arcLengthMm, ELBOW_ON_PIPE_DECIMALS.station),
    bendAngleDeg: formatMm(station.bendAngleDeg, ELBOW_ON_PIPE_DECIMALS.angle),
    clamped: station.clampedAtElbowEnd,
  }));

  return {
    summary,
    rows,
    clampedCount: rows.filter(row => !row.isClosure && row.clamped).length,
  };
}
