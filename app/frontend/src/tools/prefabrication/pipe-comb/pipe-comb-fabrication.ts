/**
 * Pipe comb fabrication layer (P3-A): elbow take-out, pup cut lengths and
 * assembly dimensions on top of the frozen P1 stagger kernel.
 *
 * Internal convention: lengths in mm, angles in degrees. No React, no DOM,
 * no i18n, no SVG, no PDF, no unit conversion, no display rounding.
 * Ticket: PB-PIPE-COMB-CORRECTION-001 / P3-A (review-fix revision).
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
 *   (the engine is NOT modified).
 * - MARKING CONTRACT (review finding 3 + marking-semantics final fix):
 *   every delivered mark declares its origin, destination, direction and
 *   measurement method (arc-development / tangent-takeout /
 *   axial-projection), and whether it is a point on material or an
 *   axis-theoretical reference. The MVP marking method for the accessory is
 *   ARC DEVELOPMENT FROM THE KEPT FACE. The intrados/extrados developments
 *   are MATERIAL marks (inner/outer surface of the nominal model); the
 *   CENTRELINE development is a THEORETICAL axis reference — the centreline
 *   is not a surface of the accessory, so it is NOT a material mark. The
 *   engine cutIntrados/centerline/extrados values are the
 *   tangent-construction family r*tan(theta/2): they are kept as GEOMETRIC
 *   REFERENCES ONLY and are NOT labelled as distances measurable from the
 *   kept face. t = CLR*tan(theta/2) (tangent take-out from the axis
 *   intersection), R*sin(theta) (axial projection from the kept-face plane)
 *   and R*theta (arc development) are DIFFERENT dimensions — not
 *   interchangeable names.
 * - Bend mode (custom CLR, "doblez"): no accessory; t = CLR*tan(theta/2)
 *   by direct tangent construction. If CLR <= OD/2 the intrados radius of
 *   the nominal circular-arc model is zero or negative: the fabrication
 *   results are INVALIDATED (pieces invalid, plan not valid) — a warning
 *   next to a valid-looking cut list is not acceptable. Stagger and
 *   independent data stay available. CLR > OD/2 only means the nominal
 *   model is constructible; it does NOT certify workshop bendability.
 * - Absolute lengths come from two explicit workshop references
 *   (REF-ENT / REF-SAL, common planes perpendicular to the initial/final
 *   axes, axis-to-axis dimensions Lin/Lout on pipe 1). Until both are
 *   provided, the planned pieces are emitted with status
 *   `pending-references` (stable identifiers, any provided reference
 *   value preserved, NO invented lengths).
 * - Weld gap g and fitting allowance are EXPLICIT inputs (default 0).
 *   No standard gap is assumed, no saw kerf is added. When g > 0 the
 *   pup's own joint face does NOT coincide with the elbow face: both
 *   carry stable identifiers and the joint is associated to both faces.
 *   A pup length dimension ends at its OWN face. Finished length and cut
 *   length are separate: the allowance is marked remove-at-fit-up and
 *   must never be drawn as part of the finished assembly.
 * - A negative P1 stagger does NOT by itself imply a negative cut length;
 *   any physically non-positive piece is flagged `invalid` and the cut
 *   plan is marked not valid, but the remaining pieces are still computed.
 * - Direction semantics (review finding 5): inlet pups step by A along the
 *   INLET axis; outlet pups step by delta = Di*sin(theta) - A*cos(theta)
 *   along the OUTLET axis. The sign of delta is independent of the sign
 *   of A (e.g. theta=90 deg: delta = Di > 0 with A > 0; A = 0: inlet pups
 *   equal but outlet pups still step by Di*sin(theta)).
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

/** Declared MVP marking method for the accessory (review finding 3). */
export const MVP_MARKING_METHOD = 'arc-development-from-kept-face';

/** Explicit semantics note for the engine cut* values. */
export const CUT_VALUES_SEMANTICS =
  'tangent-construction family r*tan(theta/2): geometric reference only, NOT an arc distance measurable from the kept face';

/** Nominal model limitation, always attached to the elbow result. */
export const NOMINAL_MODEL_NOTE =
  'nominal circular-arc model: no extra tangent straights, no guarantee on tolerances of any real accessory';

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

export type MarkingMethod = 'arc-development' | 'tangent-takeout' | 'axial-projection';

/**
 * A delivered marking dimension with an explicit datum, direction and
 * method (review finding 3). `onMaterial` distinguishes points measurable
 * on the physical accessory from axis-theoretical references.
 */
export interface FabricationMark {
  id: string;
  valueMm: number;
  origin: string;
  destination: string;
  method: MarkingMethod;
  onMaterial: boolean;
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
  /**
   * Stable face identifiers (review finding 4): a pup length dimension
   * ends at its OWN faces. When g > 0 the pup joint face and the elbow
   * face are distinct points; the joint links them (see `joints`).
   */
  faces?: { free: string; joint?: string } | { inlet: string; outlet: string };
  /** Axis-to-axis length before deductions (pups only). */
  axisToAxisLengthMm?: number;
  /** Applied deductions with provenance (pups only). */
  deductions: FabricationDeduction[];
  /** Finished physical length (pups / bent bar), as installed. */
  finishedLengthMm?: number;
  /** Explicit fitting allowance (separate from the finished length). */
  fittingAllowanceMm: number;
  /** Final cut length = finished + allowance (cut pieces only). */
  cutLengthMm?: number;
  /** How the allowance must be handled (never draw it as finished). */
  allowanceHandling?: 'remove-at-fit-up';
  /** Bend mode: straight lengths to the tangent points and developed arc. */
  straightInletMm?: number;
  straightOutletMm?: number;
  arcLengthMm?: number;
  status: FabricationPieceStatus;
  statusCode?: string;
}

/** A weld joint associating two identified faces (review finding 4). */
export interface FabricationJoint {
  id: string;
  kind: 'weld';
  /** Pup's own joint face. */
  faceA: string;
  /** Elbow face. */
  faceB: string;
  pieces: [string, string];
  /** Explicit weld gap between the two faces (mm; may be 0). */
  gapMm: number;
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
  /** Intrados radius of the nominal model = CLR - OD/2. */
  intradosRadiusMm: number;
  /**
   * False when the nominal circular-arc model is not constructible
   * (intradosRadiusMm <= 0, bend mode). Fabrication results are then
   * invalidated. True does NOT certify workshop bendability.
   */
  geometryValid: boolean;
  /**
   * Take-out per side: distance from the elbow face (or tangent point) to
   * the axis intersection along each axis = CLR*tan(theta/2).
   * Axis-theoretical reference (method: tangent-takeout).
   */
  takeOutMm: number;
  /** Engine cut-plane values (catalog mode only): geometric references,
   *  see `cutSemantics` — NOT arc distances from the kept face. */
  cutIntradosMm?: number;
  cutCenterlineMm?: number;
  cutExtradosMm?: number;
  cutSemantics?: string;
  /** MVP marking set: arc development from the kept face (on material). */
  arcFromKeptFaceMm?: { intradosMm: number; centerlineMm: number; extradosMm: number };
  /** Geometric reference: axial projection from the kept-face plane. */
  axialProjectionFromKeptFaceMm?: { intradosMm: number; centerlineMm: number; extradosMm: number };
  /** Declared MVP marking method for the accessory. */
  markingMethodDeclared?: string;
  keptArcLengthMm?: number;
  discardedArcLengthMm?: number;
  /** Documented precision of the reused engine (0 for pure construction). */
  enginePrecisionMm: number;
  /** Nominal model limitation note. */
  modelNote: string;
  /** Every delivered mark with datum, direction and method. */
  marks: FabricationMark[];
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
  /**
   * Longitudinal step of the outlet axis-to-axis run per pipe:
   * delta = Di*sin(theta) - A*cos(theta). Independent of the sign of A.
   */
  outletAxisStepMm: number;
  references: {
    defined: boolean;
    provided: { inlet: boolean; outlet: boolean };
    /** Reference keys still missing (empty when defined). */
    missing: string[];
    inletDefinition: string;
    outletDefinition: string;
    inletAxisToAxisMm?: number;
    outletAxisToAxisMm?: number;
    weldGapMm: number;
    fittingAllowanceMm: number;
  };
  pipes: PipeFabrication[];
  /** Weld joints associating identified faces (catalog mode with pieces). */
  joints: FabricationJoint[];
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
  /** False when references are missing or any piece is invalid. */
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

  // 3. CLR, take-out and marking contract.
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
    const intradosRadiusMm = clrMm - odMm / 2;
    const extradosRadiusMm = clrMm + odMm / 2;
    const keptAngleRad = stagger.elbowAngleDeg * DEG_TO_RAD;
    const sinKept = Math.sin(keptAngleRad);
    const marks: FabricationMark[] = [
      {
        id: 'takeout-axis',
        valueMm: cut.result.cutCenterlineMm,
        origin: 'theoretical axis intersection E',
        destination: 'elbow face plane (kept face or cut face)',
        method: 'tangent-takeout',
        onMaterial: false,
      },
      {
        id: 'arc-intrados-from-kept-face',
        valueMm: intradosRadiusMm * keptAngleRad,
        origin: 'kept face (physical accessory face)',
        destination: `cut plane at kept angle ${stagger.elbowAngleDeg} deg`,
        method: 'arc-development',
        onMaterial: true,
      },
      {
        id: 'arc-centerline-from-kept-face',
        valueMm: clrMm * keptAngleRad,
        origin: 'kept face (physical accessory face)',
        destination: `cut plane at kept angle ${stagger.elbowAngleDeg} deg`,
        method: 'arc-development',
        // Theoretical axis development: the centreline is not a surface of
        // the accessory — this is a reference dimension, not a material mark.
        onMaterial: false,
      },
      {
        id: 'arc-extrados-from-kept-face',
        valueMm: extradosRadiusMm * keptAngleRad,
        origin: 'kept face (physical accessory face)',
        destination: `cut plane at kept angle ${stagger.elbowAngleDeg} deg`,
        method: 'arc-development',
        onMaterial: true,
      },
      {
        id: 'projection-centerline-from-kept-face',
        valueMm: clrMm * sinKept,
        origin: 'kept-face plane',
        destination: 'cut centerline point projected along the inlet axis',
        method: 'axial-projection',
        onMaterial: false,
      },
    ];
    elbow = {
      mode: 'catalog-cut',
      nps: input.nps,
      odMm,
      clrMm,
      clrSource,
      totalAngleDeg: CATALOG_ELBOW_TOTAL_ANGLE_DEG,
      keptAngleDeg: stagger.elbowAngleDeg,
      intradosRadiusMm,
      geometryValid: true,
      takeOutMm: cut.result.cutCenterlineMm,
      cutIntradosMm: cut.result.cutIntradosMm,
      cutCenterlineMm: cut.result.cutCenterlineMm,
      cutExtradosMm: cut.result.cutExtradosMm,
      cutSemantics: CUT_VALUES_SEMANTICS,
      arcFromKeptFaceMm: {
        intradosMm: intradosRadiusMm * keptAngleRad,
        centerlineMm: clrMm * keptAngleRad,
        extradosMm: extradosRadiusMm * keptAngleRad,
      },
      axialProjectionFromKeptFaceMm: {
        intradosMm: intradosRadiusMm * sinKept,
        centerlineMm: clrMm * sinKept,
        extradosMm: extradosRadiusMm * sinKept,
      },
      markingMethodDeclared: MVP_MARKING_METHOD,
      keptArcLengthMm: cut.result.keptArcLengthMm,
      discardedArcLengthMm: cut.result.discardedArcLengthMm,
      enginePrecisionMm: ELBOW_ENGINE_PRECISION_MM,
      modelNote: NOMINAL_MODEL_NOTE,
      marks,
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
    const intradosRadiusMm = clrMm - odMm / 2;
    // Review finding 1: CLR <= OD/2 makes the nominal arc model
    // non-constructible -> fabrication results are INVALIDATED (not just
    // warned about). Stagger and independent data stay available.
    const geometryValid = intradosRadiusMm > 0;
    elbow = {
      mode: 'bend',
      nps: input.nps,
      odMm,
      clrMm,
      clrSource,
      keptAngleDeg: stagger.elbowAngleDeg,
      intradosRadiusMm,
      geometryValid,
      takeOutMm,
      keptArcLengthMm: clrMm * thetaRad,
      enginePrecisionMm: 0,
      modelNote: NOMINAL_MODEL_NOTE,
      marks: [
        {
          id: 'takeout-axis',
          valueMm: takeOutMm,
          origin: 'theoretical axis intersection E',
          destination: 'tangent point (either tangent)',
          method: 'tangent-takeout',
          onMaterial: false,
        },
        {
          id: 'arc-centerline-developed',
          valueMm: clrMm * thetaRad,
          origin: 'inlet tangent point T1',
          destination: 'outlet tangent point T2',
          method: 'arc-development',
          // Theoretical axis development: the centreline of a bend is not a
          // surface of the tube — reference dimension, not a material mark.
          onMaterial: false,
        },
      ],
    };
    if (!geometryValid) {
      warnings.push({
        code: 'clr_below_half_od',
        params: { clr: clrMm, halfOd: odMm / 2, intradosRadius: intradosRadiusMm },
      });
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

  // 5. Workshop references and explicit adjustments (review finding 6:
  //    preserve provided values, report exactly what is missing).
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
  const missing: string[] = [];
  if (!hasInlet) missing.push('inletAxisToAxisMm');
  if (!hasOutlet) missing.push('outletAxisToAxisMm');

  const references: PipeCombFabricationSolution['references'] = {
    defined: referencesDefined,
    provided: { inlet: hasInlet, outlet: hasOutlet },
    missing,
    inletDefinition:
      'REF-ENT: common plane perpendicular to the initial axes holding the free face of pipe 1 inlet pup; Lin is axis-to-axis from that plane to E_1 along the initial axis',
    outletDefinition:
      'REF-SAL: common plane perpendicular to the final axes holding the free outlet end of pipe 1; Lout is axis-to-axis from E_1 to that plane along the final axis',
    inletAxisToAxisMm: hasInlet ? refs.inletAxisToAxisMm : undefined,
    outletAxisToAxisMm: hasOutlet ? refs.outletAxisToAxisMm : undefined,
    weldGapMm,
    fittingAllowanceMm,
  };

  if (elbow.mode === 'bend' && weldGapMm > 0) {
    warnings.push({ code: 'weld_gap_not_applicable_bend', params: { weldGap: weldGapMm } });
  }

  // 6. Per-pipe pieces. A comes from the kernel; delta is the longitudinal
  //    projection step of the outlet run (Di*sin(theta) - A*cos(theta)).
  const delta = stagger.initialSpacingMm * Math.sin(thetaRad) - A * Math.cos(thetaRad);
  const t = elbow.takeOutMm;

  const pipes: PipeFabrication[] = [];
  const joints: FabricationJoint[] = [];
  const cutList: PipeCombFabricationSolution['cutList'] = [];
  let cutPlanValid = referencesDefined && elbow.geometryValid;

  if (!referencesDefined) {
    // Review finding 6: emit the planned pieces with stable identifiers and
    // an unambiguous pending status; never invent lengths.
    for (let k = 0; k < stagger.pipeCount; k++) {
      const pipeNumber = k + 1;
      const cumulativeStaggerMm = stagger.pipes[k].cumulativeStaggerMm;
      const pieces: FabricationPiece[] =
        elbow.mode === 'catalog-cut'
          ? [
              {
                id: `P${pipeNumber}-IN`,
                pipeNumber,
                kind: 'inlet-pup',
                ends: { start: 'REF-ENT', end: `P${pipeNumber}-IN own joint face (J${pipeNumber}-IN)` },
                faces: { free: 'REF-ENT', joint: `P${pipeNumber}-IN-FACE-J` },
                deductions: [],
                fittingAllowanceMm,
                status: 'pending-references',
              },
              {
                id: `P${pipeNumber}-ELBOW`,
                pipeNumber,
                kind: 'elbow',
                ends: { start: 'inlet face', end: 'cut face' },
                faces: { inlet: `P${pipeNumber}-ELBOW-FACE-IN`, outlet: `P${pipeNumber}-ELBOW-FACE-OUT` },
                deductions: [],
                fittingAllowanceMm: 0,
                status: 'pending-references',
              },
              {
                id: `P${pipeNumber}-OUT`,
                pipeNumber,
                kind: 'outlet-pup',
                ends: { start: `P${pipeNumber}-OUT own joint face (J${pipeNumber}-OUT)`, end: 'REF-SAL' },
                faces: { free: 'REF-SAL', joint: `P${pipeNumber}-OUT-FACE-J` },
                deductions: [],
                fittingAllowanceMm,
                status: 'pending-references',
              },
            ]
          : [
              {
                id: `P${pipeNumber}-BEND`,
                pipeNumber,
                kind: 'bent-tube',
                ends: { start: 'REF-ENT', end: 'REF-SAL' },
                faces: { free: 'REF-ENT' },
                deductions: [],
                fittingAllowanceMm,
                status: 'pending-references',
              },
            ];
      for (const piece of pieces) {
        if (piece.kind === 'elbow') continue;
        cutList.push({
          pieceId: piece.id,
          pipeNumber,
          kind: piece.kind,
          qty: 1,
          status: 'pending-references',
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
        outletAxisStepMm: delta,
        references,
        pipes,
        joints,
        cutList,
        cutPlanValid: false,
        warnings,
      },
    };
  }

  const Lin = refs.inletAxisToAxisMm as number;
  const Lout = refs.outletAxisToAxisMm as number;

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
        ends: { start: 'REF-ENT', end: `P${pipeNumber}-IN own joint face (J${pipeNumber}-IN)` },
        faces: { free: 'REF-ENT', joint: `P${pipeNumber}-IN-FACE-J` },
        axisToAxisLengthMm: axisInMm,
        deductions: [
          { source: 'elbow_face', mm: t, provenance: 'elbow take-out t = CLR*tan(theta/2) (solveElbowCut, B16.9 90A cut to theta)' },
          { source: 'weld_gap', mm: weldGapMm, provenance: 'explicit user input (default 0)' },
        ],
        finishedLengthMm: inletFinishedMm,
        fittingAllowanceMm,
        cutLengthMm: inletFinishedMm + fittingAllowanceMm,
        allowanceHandling: 'remove-at-fit-up',
        status: inletStatus,
        statusCode: inletStatus === 'invalid' ? 'non_positive_piece_length' : undefined,
      };
      pieces.push(inletPup);

      pieces.push({
        id: `P${pipeNumber}-ELBOW`,
        pipeNumber,
        kind: 'elbow',
        ends: { start: 'inlet face', end: 'cut face' },
        faces: { inlet: `P${pipeNumber}-ELBOW-FACE-IN`, outlet: `P${pipeNumber}-ELBOW-FACE-OUT` },
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
        ends: { start: `P${pipeNumber}-OUT own joint face (J${pipeNumber}-OUT)`, end: 'REF-SAL' },
        faces: { free: 'REF-SAL', joint: `P${pipeNumber}-OUT-FACE-J` },
        axisToAxisLengthMm: axisOutMm,
        deductions: [
          { source: 'elbow_face', mm: t, provenance: 'elbow take-out t = CLR*tan(theta/2) (solveElbowCut, B16.9 90A cut to theta)' },
          { source: 'weld_gap', mm: weldGapMm, provenance: 'explicit user input (default 0)' },
        ],
        finishedLengthMm: outletFinishedMm,
        fittingAllowanceMm,
        cutLengthMm: outletFinishedMm + fittingAllowanceMm,
        allowanceHandling: 'remove-at-fit-up',
        status: outletStatus,
        statusCode: outletStatus === 'invalid' ? 'non_positive_piece_length' : undefined,
      };
      pieces.push(outletPup);

      joints.push(
        {
          id: `J${pipeNumber}-IN`,
          kind: 'weld',
          faceA: `P${pipeNumber}-IN-FACE-J`,
          faceB: `P${pipeNumber}-ELBOW-FACE-IN`,
          pieces: [`P${pipeNumber}-IN`, `P${pipeNumber}-ELBOW`],
          gapMm: weldGapMm,
        },
        {
          id: `J${pipeNumber}-OUT`,
          kind: 'weld',
          faceA: `P${pipeNumber}-OUT-FACE-J`,
          faceB: `P${pipeNumber}-ELBOW-FACE-OUT`,
          pieces: [`P${pipeNumber}-OUT`, `P${pipeNumber}-ELBOW`],
          gapMm: weldGapMm,
        },
      );
    } else {
      const straightInletMm = axisInMm - t;
      const straightOutletMm = axisOutMm - t;
      const arcLengthMm = elbow.keptArcLengthMm as number;
      let status: FabricationPieceStatus = 'ok';
      let statusCode: string | undefined;
      if (!elbow.geometryValid) {
        // Review finding 1: non-constructible intrados -> invalidated.
        status = 'invalid';
        statusCode = 'clr_incompatible_intrados';
        cutPlanValid = false;
      } else if (straightInletMm <= 0 || straightOutletMm <= 0) {
        status = 'invalid';
        statusCode = 'non_positive_piece_length';
        cutPlanValid = false;
      }
      const barFinishedMm = straightInletMm + arcLengthMm + straightOutletMm;
      pieces.push({
        id: `P${pipeNumber}-BEND`,
        pipeNumber,
        kind: 'bent-tube',
        ends: { start: 'REF-ENT', end: 'REF-SAL' },
        faces: { free: 'REF-ENT' },
        deductions: [],
        straightInletMm,
        straightOutletMm,
        arcLengthMm,
        finishedLengthMm: barFinishedMm,
        fittingAllowanceMm,
        cutLengthMm: barFinishedMm + fittingAllowanceMm,
        allowanceHandling: 'remove-at-fit-up',
        status,
        statusCode,
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
      outletAxisStepMm: delta,
      references,
      pipes,
      joints,
      cutList,
      cutPlanValid,
      warnings,
    },
  };
}
