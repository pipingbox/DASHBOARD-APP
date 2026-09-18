/**
 * Canonical accessor for ASME B36.10M pipe dimensions.
 *
 * All PipingBox Tools must consume pipe dimensions through this layer.
 * Do not introduce new hardcoded OD/WT tables.
 *
 * Ticket: PB-TOOLS-FUNCTIONAL-PARITY-001 / W1.A
 */

import {
  PIPE_DIMENSIONS,
  NPS_LIST,
  DN_LIST,
  SCHEDULES_BY_NPS,
  PIPE_DIMENSIONS_PROVENANCE,
  type PipeDimension,
} from './generated/pipe-dimensions.ts';

export { PIPE_DIMENSIONS_PROVENANCE, type PipeDimension };

export interface PipeDimensionQuery {
  nps: string;
  schedule: string;
}

export interface PipeDimensionResult {
  success: true;
  dimension: PipeDimension;
}

export interface PipeDimensionNotFound {
  success: false;
  reason: string;
}

/**
 * Look up a pipe dimension by NPS + schedule.
 * Returns explicit N/A for unsupported combinations (no silent fallback).
 */
export function getPipeDimension(query: PipeDimensionQuery): PipeDimensionResult | PipeDimensionNotFound {
  const dim = PIPE_DIMENSIONS.find(
    (r) => r.nps === query.nps && r.schedule === query.schedule
  );
  if (!dim) {
    return {
      success: false,
      reason: `NPS ${query.nps} / schedule ${query.schedule} is not defined in ${PIPE_DIMENSIONS_PROVENANCE.datasetId}.`,
    };
  }
  return { success: true, dimension: dim };
}

/** List all supported NPS values in canonical order. */
export function listNps(): readonly string[] {
  return NPS_LIST;
}

/** List all supported DN values. */
export function listDn(): readonly number[] {
  return DN_LIST;
}

/** List schedules available for a given NPS. */
export function listSchedules(nps: string): readonly string[] {
  return SCHEDULES_BY_NPS[nps] ?? [];
}

/** Map NPS → DN. Returns undefined if unknown. */
export function npsToDn(nps: string): number | undefined {
  const dim = PIPE_DIMENSIONS.find((r) => r.nps === nps);
  return dim?.dn;
}

/** Map DN → first matching NPS. Returns undefined if unknown. */
export function dnToNps(dn: number): string | undefined {
  const dim = PIPE_DIMENSIONS.find((r) => r.dn === dn);
  return dim?.nps;
}

/** Map OD (mm) → NPS. Returns undefined if unknown. */
export function odMmToNps(odMm: number): string | undefined {
  const dim = PIPE_DIMENSIONS.find((r) => r.odMm === odMm);
  return dim?.nps;
}

/** True if the NPS/schedule combination is supported. */
export function isPipeCombinationSupported(nps: string, schedule: string): boolean {
  return PIPE_DIMENSIONS.some((r) => r.nps === nps && r.schedule === schedule);
}
