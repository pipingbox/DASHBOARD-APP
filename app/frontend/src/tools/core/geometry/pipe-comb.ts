/**
 * Pipe comb / parallel-line offset geometry.
 *
 * Internal convention: lengths in mm, angles in degrees.
 * Ticket: PB-TOOLS-FUNCTIONAL-PARITY-001 / W1.A
 *
 * W1.A scope: per-line offset geometry aggregation. The mapping from
 * initial/final center positions to per-line A/B is left to the tool layer
 * so the engine stays pure and testable.
 */

import {
  solveOffsetWithElbows,
  type ElbowOffsetInput,
  type ElbowOffsetSolution,
} from './offsets.ts';

export interface PipeCombLineInput extends ElbowOffsetInput {
  /** Line identifier, e.g. "1", "2". */
  id: string;
}

export interface PipeCombLineResult extends ElbowOffsetSolution {
  id: string;
  /** Difference in travel vs the first line (mm). */
  travelDifferenceMm: number;
}

export interface PipeCombSolution {
  lines: PipeCombLineResult[];
  /** Longest travel among all lines (mm). */
  maxTravelMm: number;
  /** Shortest travel among all lines (mm). */
  minTravelMm: number;
  /** Difference between longest and shortest travel (mm). */
  travelSpreadMm: number;
}

/**
 * Solve a pipe comb: each line is an independent offset with elbows;
 * the comb aggregates travels and differences.
 */
export function solvePipeComb(lines: PipeCombLineInput[]): PipeCombSolution {
  if (!lines.length) {
    throw new Error('Pipe comb requires at least one line');
  }

  const solved = lines.map((line) => {
    const offset = solveOffsetWithElbows(line);
    return {
      ...offset,
      id: line.id,
    };
  });

  const firstTravel = solved[0].h;
  const linesWithDiff = solved.map((line) => ({
    ...line,
    travelDifferenceMm: Number((line.h - firstTravel).toFixed(6)),
  }));

  const travels = linesWithDiff.map((l) => l.h);
  const maxTravelMm = Math.max(...travels);
  const minTravelMm = Math.min(...travels);

  return {
    lines: linesWithDiff,
    maxTravelMm: Number(maxTravelMm.toFixed(6)),
    minTravelMm: Number(minTravelMm.toFixed(6)),
    travelSpreadMm: Number((maxTravelMm - minTravelMm).toFixed(6)),
  };
}
