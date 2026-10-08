/**
 * Pipe comb fabrication layer (P3-A): elbow take-out, pup cut lengths and
 * assembly dimensions on top of the frozen P1 stagger kernel.
 *
 * Internal convention: lengths in mm, angles in degrees. No React, no DOM,
 * no i18n, no SVG, no PDF, no unit conversion, no display rounding.
 * Ticket: PB-PIPE-COMB-CORRECTION-001 / P3-A
 *
 * Contract (Brain spec PENDING/PB-PIPE-COMB-CORRECTION-001-P3-SPEC.md):
 *
 * - `solvePipeCombStagger` remains the ONLY source of the stagger A, its
 *   sign, direction and cumulative values. This layer never re-derives A
 *   and never mutates the P1 solution.
 * - Catalog mode: the commercial elbow is a 90 deg ASME B16.9 elbow
 *   (arc-only between faces, A = CLR per Weldbend p.26) CUT DOWN to the
 *   comb angle theta, keeping one face. An independent coordinate
 *   construction proves the cut elbow is symmetric about the comb axis
 *   intersection: both faces land at t = CLR*tan(theta/2) from the
 *   intersection along each axis. That t is exactly `cutCenterlineMm`
 *   from the existing `solveElbowCut` engine, which is consumed read-only
 *   (the engine is NOT modified). `cutIntradosMm`/`cutExtradosMm` are the
 *   physical cut-plane markings on the accessory.
 * - Bend mode (custom CLR, "doblez"): no accessory; t = CLR*tan(theta/2)
 *   by direct tangent construction; the piece is one bent tube per pipe
 *   (straight inlet + developed arc + straight outlet).
 * - Absolute lengths come from two explicit workshop references
 *   (REF-ENT / REF-SAL, common planes perpendicular to the initial/final
 *   axes, axis-to-axis dimensions Lin/Lout on pipe 1). Until both are
 *   provided, pieces stay `pending-references`; no default lengths are
 *   invented and no SVG drawing lengths are reused.
 * - Weld gap g and fitting allowance are EXPLICIT inputs (default 0).
 *   No standard gap is assumed, no saw kerf is added, no invisible
 *   correction is applied. Each pup is deducted for exactly ONE elbow
 *   face on its single elbow end (never two elbows).
 * - A negative P1 stagger does NOT by itself imply a negative cut length;
 *   any physically non-positive piece is flagged `invalid` and the cut
 *   plan is marked not valid, but the remaining pieces are still computed.
 * - Engine precision: `solveElbowCut` rounds each output to 6 decimals
 *   (max error 5e-7 mm per value). Comparisons involving engine outputs
 *   must use a 1e-6 mm integration tolerance; pure constructions 1e-9.
 */

import {
  solvePipeCombStagger,
  type PipeCombStaggerInput,
  type PipeCombStaggerSolution,
} from '../../core/geometry/pipe-comb-stagger.ts';
import type { GeometryResult } from '../../core/geometry/offsets.ts';
import { solveElbowCut } from '../elbow-cut/engine.ts';
import { getElbowRadius } from '../../core/standards/elbow-radius.ts';
import {
  getPipeDimension,
  listSchedules,
} from '../../core/standards/pipe-dimensions.ts';

const DEG_TO_RAD = Math.PI / 180;

/** Total angle of the catalog elbow that is cut down to the comb angle. */
export const CATALOG_ELBOW_TOTAL_ANGLE_DEG = 90;

/**
 * Documented precision of the reused `solveElbowCut` engine: every output
 * is rounded to 6 decimals, so each engine value carries at most this
 * absolute error. Integration comparisons use 1e-6 mm.
 */
export const ELBOW_ENGINE_PRECISION_MM = 5e-7;

export type ElbowSource =
  | { kind: 'catalog'; radiusType: 'LR' | 'SR' }
  | { kind: 'bend'; clrMm: number };

export interface FabricationReferencesInput {
  /**
   * Lin: axis-to-axis distance from REF-ENT (common inlet plane holding the
   * free face of pipe 1's inlet pup) to the pipe-1 axis intersection E_1,
   * measured along the initial axis. > 0 when provided.
   */
  inletAxisToAxisMm?: number;
  /**
   * Lout: axis-to-axis distance from E_1 to REF-SAL (common outlet plane
   * holding pipe 1's free outlet end), measured along the final axis.
   * > 0 when provided.
   */
  outletAxisToAxisMm?: number;
  /** Explicit weld gap per elbow-to-pup joint (mm). Default 0. */
  weldGapMm?: number;
  /** Explicit per-pup fitting allowance added on top of the finished
   *  length to obtain the cut length (mm). Default 0. */
  fittingAllowanceMm?: number;
}

export interface PipeCombFabricationInput extends PipeCombStaggerInput {
  /** Common pipe spec for the whole comb (OD source + catalog CLR key). */
  nps: string;
  elbow: ElbowSource;
  references?: FabricationReferencesInput;
}

export interface FabricationDeduction {
  source: 'elbow_face' | 'weld_gap';
  mm: number;
  provenance: string;
}

export type FabricationPieceStatus = 'ok' | 'invalid' | 'pending-references';

export interface FabricationPiece {
  /** Stable identifier: P{i}-IN / P{i}-ELBOW / P{i}-OUT / P{i}-BEND. */
  id: string;
  pipeNumber: number;
  kind: 'inlet-pup' | 'elbow' | 'outlet-pup' | 'bent-tube';
  /** Physical endpoints of the piece. */
  ends: { start: string; end: string };
  /** Axis-to-axis length before deductions (pups only). */
  axisToAxisLengthMm?: number;
  /** Applied deductions with provenance (pups only). */
  deductions: FabricationDeduction[];
  /** Finished physical length (pups / bent bar). */
  finishedLengthMm?: number;
  /** Explicit fitting allowance (separate from the finished length). */
  fittingAllowanceMm: number;
  /** Final cut length = finished + allowance (cut pieces only). */
  cutLengthMm?: number;
  /** Bend mode: straight lengths to the tangent points and developed arc. */
  straightInletMm?: number;
  straightOutletMm?: number;
  arcLengthMm?: number;
  status: FabricationPieceStatus;
  statusCode?: string;
}

export interface PipeFabrication {
  pipeNumber: number;
  cumulativeStaggerMm: number;
  pieces: FabricationPiece[];
}

export interface ElbowFabrication {
  mode: 'catalog-cut' | 'bend';
  nps: string;
  odMm: number;
  clrMm: number;
  clrSource: 'b16.9-90A-crossref' | 'user-custom';
  /** Total angle of the original catalog elbow (catalog mode only). */
  totalAngleDeg?: number;
  /** Angle kept after the cut = comb angle theta. */
  keptAngleDeg: number;
  /**
   * Take-out per side: distance from the elbow face (or tangent point) to
   * the axis intersection along each axis = CLR*tan(theta/2).
   */
  takeOutMm: number;
  /** Physical cut-plane markings on the accessory (catalog mode only). */
  cutIntradosMm?: number;
  cutCenterlineMm?: number;
  cutExtradosMm?: number;
  keptArcLengthMm?: number;
  discardedArcLengthMm?: number;
  /** Documented precision of the reused engine (0 for pure construction). */
  enginePrecisionMm: number;
}

export interface FabricationWarning {
  code: string;
  params: Record<string, string | number>;
}

export interface PipeCombFabricationSolution {
  /** Frozen P1 solution, echoed unmodified. */
  stagger: PipeCombStaggerSolution;
  elbow: ElbowFabrication;
  /** Clearances between adjacent pipe outer surfaces (may be <= 0: warning). */
  initialClearanceMm: number;
  finalClearanceMm: number;
  references: {
    defined: boolean;
    inletDefinition: string;
    outletDefinition: string;
    inletAxisToAxisMm?: number;
    outletAxisToAxisMm?: number;
    weldGapMm: number;
    fittingAllowanceMm: number;
  };
  pipes: PipeFabrication[];
  /** Flat cut list: pieces with a cut length (accessories excluded). */
  cutList: Array<{
    pieceId: string;
    pipeNumber: number;
    kind: FabricationPiece['kind'];
    qty: 1;
    cutLengthMm?: number;
    status: FabricationPieceStatus;
    statusCode?: string;
  }>;
  /** False when references are defined but any piece is invalid. */
  cutPlanValid: boolean;
  warnings: FabricationWarning[];
}

function fail(
  code: string,
  reason: string,
  params: Record<string, string | number>,
): GeometryResult<PipeCombFabricationSolution> {
  return { success: false, code, params, reason };
}

/** Resolve the pipe OD for an NPS. OD is an NPS property in B36.10M
 *  (constant across schedules; a test asserts that invariant), so the
 *  first available schedule row provides it. Explicit N/A, never a
 *  fallback. */
function resolveOdMm(nps: string): number | undefined {
  const schedules = listSchedules(nps);
  if (schedules.length === 0) return undefined;
  const dim = getPipeDimension({ nps, schedule: schedules[0] });
  return dim.success ? dim.dimension.odMm : undefined;
}

function isValidLength(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

/**
 * Solve the pipe comb fabrication layer: elbow take-out + pup cut lengths.
 * Pure and deterministic; read-only over the P1 kernel, the standards
 * layer and the `solveElbowCut` engine.
 */
export function solvePipeCombFabrication(
  input: PipeCombFabricationInput,
): GeometryResult<PipeCombFabricationSolution> {
  // 1. Stagger from the frozen P1 kernel (only source of A).
  const staggerResult = solvePipeCombStagger(input);
  if (staggerResult.success === false) {
    // Re-wrap: the failure payload is identical, only the success type differs.
    return {
      success: false,
      code: staggerResult.code,
      params: staggerResult.params ?? {},
      reason: staggerResult.reason,
    };
  }
  const stagger = staggerResult.result;
  const A = stagger.adjacentStaggerMm;
  const thetaRad = stagger.elbowAngleDeg * DEG_TO_RAD;

  // 2. Pipe OD (B36.10M, read-only).
  const odMm = resolveOdMm(input.nps);
  if (odMm === undefined) {
    return fail('nps_unknown', `NPS ${input.nps} is not defined in the B36.10M layer`, {
      nps: input.nps,
    });
  }

  const warnings: FabricationWarning[] = [];

  // 3. CLR + take-out.
  let clrMm: number;
  let clrSource: ElbowFabrication['clrSource'];
  let elbow: ElbowFabrication;
  if (input.elbow.kind === 'catalog') {
    const catalogClr = getElbowRadius(input.nps, input.elbow.radiusType);
    if (catalogClr === undefined) {
      return fail(
        'clr_not_tabulated',
        `No tabulated B16.9 ${input.elbow.radiusType} elbow for NPS ${input.nps}`,
        { nps: input.nps, radiusType: input.elbow.radiusType },
      );
    }
    clrMm = catalogClr;
    clrSource = 'b16.9-90A-crossref';
    const cut = solveElbowCut({
      odMm,
      clrMm,
      totalAngleDeg: CATALOG_ELBOW_TOTAL_ANGLE_DEG,
      betaDeg: stagger.elbowAngleDeg,
    });
    if (cut.success === false) {
      return fail('elbow_cut_failed', `Elbow-cut engine rejected the case: ${cut.reason}`, {
        engineCode: cut.code ?? 'unknown',
      });
    }
    elbow = {
      mode: 'catalog-cut',
      nps: input.nps,
      odMm,
      clrMm,
      clrSource,
      totalAngleDeg: CATALOG_ELBOW_TOTAL_ANGLE_DEG,
      keptAngleDeg: stagger.elbowAngleDeg,
      takeOutMm: cut.result.cutCenterlineMm,
      cutIntradosMm: cut.result.cutIntradosMm,
      cutCenterlineMm: cut.result.cutCenterlineMm,
      cutExtradosMm: cut.result.cutExtradosMm,
      keptArcLengthMm: cut.result.keptArcLengthMm,
      discardedArcLengthMm: cut.result.discardedArcLengthMm,
      enginePrecisionMm: ELBOW_ENGINE_PRECISION_MM,
    };
    if (stagger.elbowAngleDeg < CATALOG_ELBOW_TOTAL_ANGLE_DEG) {
      warnings.push({
        code: 'catalog_elbow_cut',
        params: { total: CATALOG_ELBOW_TOTAL_ANGLE_DEG, kept: stagger.elbowAngleDeg },
      });
    }
  } else {
    if (!Number.isFinite(input.elbow.clrMm) || input.elbow.clrMm <= 0) {
      return fail('clr_positive', 'Custom CLR must be a positive finite length', {
        clr: String(input.elbow.clrMm),
      });
    }
    clrMm = input.elbow.clrMm;
    clrSource = 'user-custom';
    const takeOutMm = clrMm * Math.tan(thetaRad / 2);
    elbow = {
      mode: 'bend',
      nps: input.nps,
      odMm,
      clrMm,
      clrSource,
      keptAngleDeg: stagger.elbowAngleDeg,
      takeOutMm,
      keptArcLengthMm: clrMm * thetaRad,
      enginePrecisionMm: 0,
    };
    if (clrMm <= odMm / 2) {
      warnings.push({ code: 'clr_below_half_od', params: { clr: clrMm, halfOd: odMm / 2 } });
    }
  }

  // 4. Clearances (physical warning only, never blocking).
  const initialClearanceMm = stagger.initialSpacingMm - odMm;
  const finalClearanceMm = stagger.finalSpacingMm - odMm;
  if (initialClearanceMm <= 0) {
    warnings.push({ code: 'clearance_non_positive_initial', params: { clearance: initialClearanceMm } });
  }
  if (finalClearanceMm <= 0) {
    warnings.push({ code: 'clearance_non_positive_final', params: { clearance: finalClearanceMm } });
  }

  // 5. Workshop references and explicit adjustments.
  const refs = input.references ?? {};
  const weldGapMm = refs.weldGapMm ?? 0;
  const fittingAllowanceMm = refs.fittingAllowanceMm ?? 0;
  if (!Number.isFinite(weldGapMm) || weldGapMm < 0 || !Number.isFinite(fittingAllowanceMm) || fittingAllowanceMm < 0) {
    return fail('invalid_adjustment', 'Weld gap and fitting allowance must be finite and >= 0', {
      weldGap: String(refs.weldGapMm),
      fittingAllowance: String(refs.fittingAllowanceMm),
    });
  }
  const hasInlet = refs.inletAxisToAxisMm !== undefined;
  const hasOutlet = refs.outletAxisToAxisMm !== undefined;
  if (hasInlet && !isValidLength(refs.inletAxisToAxisMm)) {
    return fail('invalid_reference', 'Inlet reference (Lin) must be a positive finite length', {
      value: String(refs.inletAxisToAxisMm),
    });
  }
  if (hasOutlet && !isValidLength(refs.outletAxisToAxisMm)) {
    return fail('invalid_reference', 'Outlet reference (Lout) must be a positive finite length', {
      value: String(refs.outletAxisToAxisMm),
    });
  }
  const referencesDefined = hasInlet && hasOutlet;
  if (hasInlet !== hasOutlet) {
    warnings.push({ code: 'references_incomplete', params: {} });
  }

  const references: PipeCombFabricationSolution['references'] = {
    defined: referencesDefined,
    inletDefinition:
      'REF-ENT: common plane perpendicular to the initial axes holding the free face of pipe 1 inlet pup; Lin is axis-to-axis from that plane to E_1 along the initial axis',
    outletDefinition:
      'REF-SAL: common plane perpendicular to the final axes holding the free outlet end of pipe 1; Lout is axis-to-axis from E_1 to that plane along the final axis',
    inletAxisToAxisMm: referencesDefined ? refs.inletAxisToAxisMm : undefined,
    outletAxisToAxisMm: referencesDefined ? refs.outletAxisToAxisMm : undefined,
    weldGapMm,
    fittingAllowanceMm,
  };

  if (!referencesDefined) {
    return {
      success: true,
      result: {
        stagger,
        elbow,
        initialClearanceMm,
        finalClearanceMm,
        references,
        pipes: [],
        cutList: [],
        cutPlanValid: false,
        warnings,
      },
    };
  }

  if (elbow.mode === 'bend' && weldGapMm > 0) {
    warnings.push({ code: 'weld_gap_not_applicable_bend', params: { weldGap: weldGapMm } });
  }

  // 6. Per-pipe pieces. A comes from the kernel; delta is the longitudinal
  //    projection step of the outlet run (Di*sin(theta) - A*cos(theta)).
  const Lin = refs.inletAxisToAxisMm as number;
  const Lout = refs.outletAxisToAxisMm as number;
  const t = elbow.takeOutMm;
  const delta = stagger.initialSpacingMm * Math.sin(thetaRad) - A * Math.cos(thetaRad);

  const pipes: PipeFabrication[] = [];
  const cutList: PipeCombFabricationSolution['cutList'] = [];
  let cutPlanValid = true;

  for (let k = 0; k < stagger.pipeCount; k++) {
    const pipeNumber = k + 1;
    const cumulativeStaggerMm = stagger.pipes[k].cumulativeStaggerMm;
    const axisInMm = Lin - k * A;
    const axisOutMm = Lout - k * delta;
    const pieces: FabricationPiece[] = [];

    if (elbow.mode === 'catalog-cut') {
      const inletFinishedMm = axisInMm - t - weldGapMm;
      const inletStatus: FabricationPieceStatus = inletFinishedMm > 0 ? 'ok' : 'invalid';
      if (inletStatus === 'invalid') cutPlanValid = false;
      const inletPup: FabricationPiece = {
        id: `P${pipeNumber}-IN`,
        pipeNumber,
        kind: 'inlet-pup',
        ends: { start: 'REF-ENT', end: `P${pipeNumber} elbow inlet face` },
        axisToAxisLengthMm: axisInMm,
        deductions: [
          { source: 'elbow_face', mm: t, provenance: 'elbow take-out t = CLR*tan(theta/2) (solveElbowCut, B16.9 90A cut to theta)' },
          { source: 'weld_gap', mm: weldGapMm, provenance: 'explicit user input (default 0)' },
        ],
        finishedLengthMm: inletFinishedMm,
        fittingAllowanceMm,
        cutLengthMm: inletFinishedMm + fittingAllowanceMm,
        status: inletStatus,
        statusCode: inletStatus === 'invalid' ? 'non_positive_piece_length' : undefined,
      };
      pieces.push(inletPup);

      pieces.push({
        id: `P${pipeNumber}-ELBOW`,
        pipeNumber,
        kind: 'elbow',
        ends: { start: 'inlet face', end: 'cut face' },
        deductions: [],
        fittingAllowanceMm: 0,
        status: 'ok',
      });

      const outletFinishedMm = axisOutMm - t - weldGapMm;
      const outletStatus: FabricationPieceStatus = outletFinishedMm > 0 ? 'ok' : 'invalid';
      if (outletStatus === 'invalid') cutPlanValid = false;
      const outletPup: FabricationPiece = {
        id: `P${pipeNumber}-OUT`,
        pipeNumber,
        kind: 'outlet-pup',
        ends: { start: `P${pipeNumber} elbow cut face`, end: 'REF-SAL' },
        axisToAxisLengthMm: axisOutMm,
        deductions: [
          { source: 'elbow_face', mm: t, provenance: 'elbow take-out t = CLR*tan(theta/2) (solveElbowCut, B16.9 90A cut to theta)' },
          { source: 'weld_gap', mm: weldGapMm, provenance: 'explicit user input (default 0)' },
        ],
        finishedLengthMm: outletFinishedMm,
        fittingAllowanceMm,
        cutLengthMm: outletFinishedMm + fittingAllowanceMm,
        status: outletStatus,
        statusCode: outletStatus === 'invalid' ? 'non_positive_piece_length' : undefined,
      };
      pieces.push(outletPup);
    } else {
      const straightInletMm = axisInMm - t;
      const straightOutletMm = axisOutMm - t;
      const arcLengthMm = elbow.keptArcLengthMm as number;
      const valid = straightInletMm > 0 && straightOutletMm > 0;
      if (!valid) cutPlanValid = false;
      const barFinishedMm = straightInletMm + arcLengthMm + straightOutletMm;
      pieces.push({
        id: `P${pipeNumber}-BEND`,
        pipeNumber,
        kind: 'bent-tube',
        ends: { start: 'REF-ENT', end: 'REF-SAL' },
        deductions: [],
        straightInletMm,
        straightOutletMm,
        arcLengthMm,
        finishedLengthMm: barFinishedMm,
        fittingAllowanceMm,
        cutLengthMm: barFinishedMm + fittingAllowanceMm,
        status: valid ? 'ok' : 'invalid',
        statusCode: valid ? undefined : 'non_positive_piece_length',
      });
    }

    for (const piece of pieces) {
      if (piece.kind === 'elbow') continue;
      cutList.push({
        pieceId: piece.id,
        pipeNumber,
        kind: piece.kind,
        qty: 1,
        cutLengthMm: piece.cutLengthMm,
        status: piece.status,
        statusCode: piece.statusCode,
      });
    }
    pipes.push({ pipeNumber, cumulativeStaggerMm, pieces });
  }

  return {
    success: true,
    result: {
      stagger,
      elbow,
      initialClearanceMm,
      finalClearanceMm,
      references,
      pipes,
      cutList,
      cutPlanValid,
      warnings,
    },
  };
}
