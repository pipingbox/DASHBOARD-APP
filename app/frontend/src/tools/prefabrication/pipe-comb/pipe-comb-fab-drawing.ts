/**
 * Pipe comb fabrication presentation model (P3-C): pure geometry for the
 * dimensioned fabrication view, the on-screen drawing and the PDF export.
 *
 * Internal convention: mm in the model plane, degrees. No React, no DOM,
 * no SVG, no PDF, no i18n, no unit conversion, no display rounding.
 * Ticket: PB-PIPE-COMB-CORRECTION-001 / P3-C.
 *
 * SINGLE SOURCE CONTRACT:
 * - Every physical value (A, take-out t, pup lengths, gaps, allowances,
 *   marks, identifiers, statuses) comes UNMODIFIED from the approved
 *   `PipeCombFabricationSolution` (P3-A). This module NEVER recomputes
 *   fabrication numbers; it only builds coordinates, frames, dimension
 *   placements and label slots from that solution. That is representation,
 *   not a second fabrication engine.
 * - The decorative extensions of the P2 schematic are NEVER used as
 *   physical dimensions, and no length is ever derived from pixels.
 * - The drawing is a dimensioned representation, NOT a 1:1 cutting
 *   template: "do not scale the drawing".
 *
 * GEOMETRY (documented, fixed):
 * - The comb is planar. Pipe i axis intersection E_i sits at
 *   (k*A, k*Di) in the (initial-axis, perpendicular) plane, where A is the
 *   signed P1 stagger and Di the initial spacing. The elbow turns by the
 *   comb angle theta; the outlet axis direction is
 *   (cos(theta), sin(theta)) rotated about E_i.
 * - REF-ENT is the common plane perpendicular to the initial axes holding
 *   the free face of pipe 1's inlet pup; REF-SAL likewise on the outlet
 *   side. Lin/Lout are axis-to-axis on pipe 1 (P3-A contract).
 * - Catalog mode: each pipe is inlet pup -> weld joint -> cut elbow ->
 *   weld joint -> outlet pup. The elbow is drawn as a circular arc of
 *   radius CLR about its centre C_i (constructed from E_i, t and theta),
 *   spanning the kept angle theta between its two face planes.
 * - Bend mode: each pipe is ONE continuous bent bar: inlet straight to
 *   tangent T1, arc of radius CLR, outlet straight from tangent T2.
 * - Weld gap g > 0: the pup's own joint face and the elbow face are
 *   DISTINCT points separated by g along the local axis; both are drawn.
 * - The fitting allowance is NEVER drawn as part of the finished assembly:
 *   it appears only as a labelled over-length extension beyond the free
 *   face of each pup (remove-at-fit-up), visually distinct.
 *
 * PROJECTION: fixed dimetric-style oblique projection of the planar model
 * (the comb lies in one plane; nothing is invented out of plane):
 *   screen = ( x*cos(tilt) - y*sin(tilt), (x*sin(tilt) + y*cos(tilt))*squash )
 * with tilt = 30 deg and squash = 0.5. Labels always carry the REAL model
 * values; the projection is only a view and must never be measured.
 */

import type {
  PipeCombFabricationSolution,
  FabricationPiece,
} from './pipe-comb-fabrication.ts';

const DEG_TO_RAD = Math.PI / 180;

/** Fixed documented projection parameters (see header). */
export const PROJECTION = {
  tiltDeg: 30,
  squash: 0.5,
  note: 'fixed dimetric oblique projection of the planar comb; labels carry real model values — never measure the view',
} as const;

export interface Vec2 {
  x: number;
  y: number;
}

export interface FabDrawingSegment {
  kind: 'straight';
  pieceId: string;
  from: Vec2;
  to: Vec2;
  /** True for the finished assembly; false for the allowance over-length. */
  finished: boolean;
}

export interface FabDrawingArc {
  kind: 'arc';
  pieceId: string;
  center: Vec2;
  radiusMm: number;
  /** Start/end angles of the arc in the MODEL plane (radians, CCW). */
  startRad: number;
  endRad: number;
}

export interface FabDrawingJointMarker {
  jointId: string;
  /** Pup's own joint face point. */
  pupFace: Vec2;
  /** Elbow face point (== pupFace when g = 0). */
  elbowFace: Vec2;
  gapMm: number;
  /** Local axis direction (unit) from pup towards the elbow. */
  axis: Vec2;
}

export interface FabDrawingReferencePlane {
  id: 'REF-ENT' | 'REF-SAL';
  /** A point of the plane line and its direction (unit). */
  point: Vec2;
  direction: Vec2;
}

export type FabDimensionKind =
  | 'finished-length'
  | 'cut-length'
  | 'reference'
  | 'theoretical'
  | 'stagger'
  | 'spacing'
  | 'gap';

export interface FabDrawingDimension {
  id: string;
  kind: FabDimensionKind;
  /** Piece or reference this dimension belongs to. */
  ownerId: string;
  /** What it measures (stable key, localized by the UI/PDF layer). */
  measureKey: string;
  from: Vec2;
  to: Vec2;
  /** Physical value from the solution (mm). */
  valueMm: number;
  /** Offset direction (unit, perpendicular to the measured run). */
  offsetDir: Vec2;
  /** Suggested label anchor (model plane). */
  labelAt: Vec2;
}

export interface FabDrawingLabel {
  id: string;
  /** Stable text key + params, localized by the consumer. */
  textKey: string;
  params: Record<string, string | number>;
  at: Vec2;
  /** Optional anchor point the label refers to (leader line). */
  anchor?: Vec2;
}

export interface FabDrawingElbowDetail {
  pipeNumber: number;
  pieceId: string;
  center: Vec2;
  clrMm: number;
  odMm: number;
  keptAngleDeg: number;
  totalAngleDeg?: number;
  /** Kept face point (inlet side) and cut face point (outlet side). */
  keptFacePoint: Vec2;
  cutFacePoint: Vec2;
  axisIntersection: Vec2;
  takeOutMm: number;
}

export interface PipeCombFabDrawing {
  /** Echo of the solution identity for snapshot/traceability. */
  pipeCount: number;
  mode: 'catalog-cut' | 'bend';
  elbowAngleDeg: number;
  nps: string;
  odMm: number;
  clrMm: number;
  segments: FabDrawingSegment[];
  arcs: FabDrawingArc[];
  joints: FabDrawingJointMarker[];
  referencePlanes: FabDrawingReferencePlane[];
  dimensions: FabDrawingDimension[];
  labels: FabDrawingLabel[];
  elbowDetails: FabDrawingElbowDetail[];
  /** Model-plane bounding box of everything drawn (finished assembly +
   *  allowances + references + dimension offsets). */
  bounds: { min: Vec2; max: Vec2 };
}

/** Build the fixed projection of a model-plane point. */
export function projectPoint(p: Vec2): Vec2 {
  const tilt = PROJECTION.tiltDeg * DEG_TO_RAD;
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  return {
    x: p.x * c - p.y * s,
    y: (p.x * s + p.y * c) * PROJECTION.squash,
  };
}

const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });
const norm = (a: Vec2): Vec2 => {
  const l = Math.hypot(a.x, a.y);
  return l === 0 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
};

function expandBounds(bounds: { min: Vec2; max: Vec2 }, p: Vec2, margin = 0): void {
  bounds.min.x = Math.min(bounds.min.x, p.x - margin);
  bounds.min.y = Math.min(bounds.min.y, p.y - margin);
  bounds.max.x = Math.max(bounds.max.x, p.x + margin);
  bounds.max.y = Math.max(bounds.max.y, p.y + margin);
}

/**
 * Build the pure presentation model from the approved fabrication
 * solution. Throws nothing: callers must only invoke it with a solution
 * whose cut plan is valid (the UI gates this); pending/invalid pieces
 * simply have no coordinates and are skipped.
 */
export function buildPipeCombFabDrawing(sol: PipeCombFabricationSolution): PipeCombFabDrawing {
  const theta = sol.stagger.elbowAngleDeg;
  const thetaRad = theta * DEG_TO_RAD;
  const A = sol.stagger.adjacentStaggerMm;
  const Di = sol.stagger.initialSpacingMm;
  const t = sol.elbow.takeOutMm;
  const g = sol.references.weldGapMm;
  const allowance = sol.references.fittingAllowanceMm;
  const Lin = sol.references.inletAxisToAxisMm ?? 0;
  const Lout = sol.references.outletAxisToAxisMm ?? 0;
  const clr = sol.elbow.clrMm;
  const delta = sol.outletAxisStepMm;

  const inletDir: Vec2 = { x: 1, y: 0 };
  const outletDir: Vec2 = { x: Math.cos(thetaRad), y: Math.sin(thetaRad) };
  const spacingDir: Vec2 = { x: 0, y: 1 };

  const segments: FabDrawingSegment[] = [];
  const arcs: FabDrawingArc[] = [];
  const jointMarkers: FabDrawingJointMarker[] = [];
  const dimensions: FabDrawingDimension[] = [];
  const labels: FabDrawingLabel[] = [];
  const elbowDetails: FabDrawingElbowDetail[] = [];
  const bounds = { min: { x: Infinity, y: Infinity }, max: { x: -Infinity, y: -Infinity } };

  const dimOffsetBase = Math.max(40, clr * 0.35);

  for (let k = 0; k < sol.stagger.pipeCount; k++) {
    const pipeNumber = k + 1;
    const E: Vec2 = { x: k * A, y: k * Di };
    const pieces = sol.pipes[k]?.pieces ?? [];
    const byId = new Map(pieces.map((p) => [p.id, p]));

    // Elbow centre: from E, back t along the inlet axis to the inlet face
    // plane point on the axis. The centre lies on the perpendicular to the
    // inlet axis at that point, at distance CLR, on the side the elbow
    // turns towards (+90 deg CCW of the inlet direction for theta in
    // (0, 180) turning CCW).
    const inletFaceAxis = sub(E, scale(inletDir, t));
    const outletFaceAxis = add(E, scale(outletDir, t));
    const nIn: Vec2 = { x: -inletDir.y, y: inletDir.x }; // +90deg CCW
    const turnSign = Math.sign(Math.sin(thetaRad)) || 1;
    const centre = add(inletFaceAxis, scale(nIn, clr * turnSign));

    if (sol.elbow.mode === 'catalog-cut') {
      const inPup = byId.get(`P${pipeNumber}-IN`);
      const outPup = byId.get(`P${pipeNumber}-OUT`);
      // Inlet pup: free face at REF-ENT side, joint face towards the elbow.
      if (inPup?.finishedLengthMm !== undefined && inPup.finishedLengthMm > 0) {
        const jointFace = sub(inletFaceAxis, scale(inletDir, g));
        const freeFace = sub(jointFace, scale(inletDir, inPup.finishedLengthMm));
        segments.push({ kind: 'straight', pieceId: inPup.id, from: freeFace, to: jointFace, finished: true });
        if (allowance > 0) {
          const allowEnd = sub(freeFace, scale(inletDir, allowance));
          segments.push({ kind: 'straight', pieceId: inPup.id, from: freeFace, to: allowEnd, finished: false });
          expandBounds(bounds, allowEnd);
        }
        dimensions.push(pupDimension(inPup, freeFace, jointFace, 'finished-length', spacingDir, dimOffsetBase, k));
        if (allowance > 0) {
          dimensions.push(pupDimension(inPup, sub(freeFace, scale(inletDir, allowance)), jointFace, 'cut-length', spacingDir, dimOffsetBase * 1.9, k));
        }
        expandBounds(bounds, freeFace);
        expandBounds(bounds, jointFace);
        jointMarkers.push({
          jointId: `J${pipeNumber}-IN`,
          pupFace: jointFace,
          elbowFace: inletFaceAxis,
          gapMm: g,
          axis: inletDir,
        });
      }
      // Elbow arc between the two face points on the centreline.
      const keptFacePoint = inletFaceAxis;
      const cutFacePoint = outletFaceAxis;
      const startRad = Math.atan2(keptFacePoint.y - centre.y, keptFacePoint.x - centre.x);
      let endRad = Math.atan2(cutFacePoint.y - centre.y, cutFacePoint.x - centre.x);
      // Ensure the arc spans exactly theta in the turn direction.
      if (turnSign > 0) {
        while (endRad <= startRad) endRad += 2 * Math.PI;
      } else {
        while (endRad >= startRad) endRad -= 2 * Math.PI;
      }
      arcs.push({
        kind: 'arc',
        pieceId: `P${pipeNumber}-ELBOW`,
        center: centre,
        radiusMm: clr,
        startRad,
        endRad,
      });
      elbowDetails.push({
        pipeNumber,
        pieceId: `P${pipeNumber}-ELBOW`,
        center: centre,
        clrMm: clr,
        odMm: sol.elbow.odMm,
        keptAngleDeg: theta,
        totalAngleDeg: sol.elbow.totalAngleDeg,
        keptFacePoint,
        cutFacePoint,
        axisIntersection: E,
        takeOutMm: t,
      });
      expandBounds(bounds, centre, clr + sol.elbow.odMm / 2);
      if (outPup?.finishedLengthMm !== undefined && outPup.finishedLengthMm > 0) {
        const jointFace = add(outletFaceAxis, scale(outletDir, g));
        const freeFace = add(jointFace, scale(outletDir, outPup.finishedLengthMm));
        segments.push({ kind: 'straight', pieceId: outPup.id, from: jointFace, to: freeFace, finished: true });
        if (allowance > 0) {
          const allowEnd = add(freeFace, scale(outletDir, allowance));
          segments.push({ kind: 'straight', pieceId: outPup.id, from: freeFace, to: allowEnd, finished: false });
          expandBounds(bounds, allowEnd);
        }
        dimensions.push(pupDimension(outPup, jointFace, freeFace, 'finished-length', spacingDir, dimOffsetBase, k));
        if (allowance > 0) {
          dimensions.push(pupDimension(outPup, jointFace, add(freeFace, scale(outletDir, allowance)), 'cut-length', spacingDir, dimOffsetBase * 1.9, k));
        }
        expandBounds(bounds, freeFace);
        expandBounds(bounds, jointFace);
        jointMarkers.push({
          jointId: `J${pipeNumber}-OUT`,
          pupFace: jointFace,
          elbowFace: outletFaceAxis,
          gapMm: g,
          axis: outletDir,
        });
      }
    } else {
      // Bend mode: one continuous bar per pipe.
      const bend = byId.get(`P${pipeNumber}-BEND`);
      if (bend && bend.straightInletMm !== undefined && bend.straightOutletMm !== undefined && bend.straightInletMm > 0 && bend.straightOutletMm > 0) {
        const T1 = sub(E, scale(inletDir, t));
        const T2 = add(E, scale(outletDir, t));
        const start = sub(T1, scale(inletDir, bend.straightInletMm));
        const end = add(T2, scale(outletDir, bend.straightOutletMm));
        segments.push({ kind: 'straight', pieceId: bend.id, from: start, to: T1, finished: true });
        const startRad = Math.atan2(T1.y - centre.y, T1.x - centre.x);
        let endRad = Math.atan2(T2.y - centre.y, T2.x - centre.x);
        if (turnSign > 0) {
          while (endRad <= startRad) endRad += 2 * Math.PI;
        } else {
          while (endRad >= startRad) endRad -= 2 * Math.PI;
        }
        arcs.push({ kind: 'arc', pieceId: bend.id, center: centre, radiusMm: clr, startRad, endRad });
        segments.push({ kind: 'straight', pieceId: bend.id, from: T2, to: end, finished: true });
        if (allowance > 0) {
          // Bend allowance applies once to the developed bar; drawn as an
          // over-length at the outlet free end (remove-at-fit-up).
          const allowEnd = add(end, scale(outletDir, allowance));
          segments.push({ kind: 'straight', pieceId: bend.id, from: end, to: allowEnd, finished: false });
          expandBounds(bounds, allowEnd);
        }
        dimensions.push({
          id: `dim-${bend.id}-straight-in`,
          kind: 'finished-length',
          ownerId: bend.id,
          measureKey: 'straightInlet',
          from: start,
          to: T1,
          valueMm: bend.straightInletMm,
          offsetDir: spacingDir,
          labelAt: add(add(scale(add(start, T1), 0.5), scale(spacingDir, dimOffsetBase)), { x: 0, y: 0 }),
        });
        dimensions.push({
          id: `dim-${bend.id}-straight-out`,
          kind: 'finished-length',
          ownerId: bend.id,
          measureKey: 'straightOutlet',
          from: T2,
          to: end,
          valueMm: bend.straightOutletMm,
          offsetDir: spacingDir,
          labelAt: add(scale(add(T2, end), 0.5), scale(spacingDir, dimOffsetBase)),
        });
        dimensions.push({
          id: `dim-${bend.id}-arc`,
          kind: 'theoretical',
          ownerId: bend.id,
          measureKey: 'arcDeveloped',
          from: T1,
          to: T2,
          valueMm: bend.arcLengthMm ?? 0,
          offsetDir: spacingDir,
          labelAt: add(centre, scale(norm(sub(add(T1, T2), scale(centre, 2))), clr + dimOffsetBase)),
        });
        elbowDetails.push({
          pipeNumber,
          pieceId: bend.id,
          center: centre,
          clrMm: clr,
          odMm: sol.elbow.odMm,
          keptAngleDeg: theta,
          keptFacePoint: T1,
          cutFacePoint: T2,
          axisIntersection: E,
          takeOutMm: t,
        });
        expandBounds(bounds, start);
        expandBounds(bounds, end);
        expandBounds(bounds, centre, clr + sol.elbow.odMm / 2);
      }
    }

    // Axis intersection label (theoretical point E_i).
    labels.push({
      id: `label-E${pipeNumber}`,
      textKey: 'axisIntersection',
      params: { pipe: pipeNumber },
      at: add(E, { x: 0, y: -dimOffsetBase * 0.6 }),
      anchor: E,
    });
    expandBounds(bounds, E);
  }

  // Reference planes (P3-A axis-to-axis contract): REF-ENT is the plane
  // perpendicular to the inlet axes at distance Lin upstream of E_1
  // (E_1 = origin); REF-SAL is the plane perpendicular to the outlet axes
  // at distance Lout from E_1 along the outlet direction. The pipe-1 pup
  // free faces lie on these planes by construction.
  const refEnt: FabDrawingReferencePlane = {
    id: 'REF-ENT',
    point: { x: -Lin, y: 0 },
    direction: spacingDir,
  };
  const refSal: FabDrawingReferencePlane = {
    id: 'REF-SAL',
    point: scale(outletDir, Lout),
    direction: norm(perp(outletDir)),
  };
  const referencePlanes = [refEnt, refSal];
  expandBounds(bounds, refEnt.point);
  expandBounds(bounds, refSal.point);

  // Assembly dimensions: Lin, Lout, Di, Df, A (stagger), theta.
  dimensions.push({
    id: 'dim-Lin',
    kind: 'reference',
    ownerId: 'REF-ENT',
    measureKey: 'lin',
    from: refEnt.point,
    to: { x: 0, y: 0 },
    valueMm: Lin,
    offsetDir: { x: 0, y: -1 },
    labelAt: { x: -Lin / 2, y: -dimOffsetBase * 1.4 },
  });
  dimensions.push({
    id: 'dim-Lout',
    kind: 'reference',
    ownerId: 'REF-SAL',
    measureKey: 'lout',
    from: { x: 0, y: 0 },
    to: refSal.point,
    valueMm: Lout,
    offsetDir: norm(perp(outletDir)),
    labelAt: add(scale(refSal.point, 0.5), scale(norm(perp(outletDir)), -dimOffsetBase * 1.4)),
  });
  if (sol.stagger.pipeCount >= 2) {
    dimensions.push({
      id: 'dim-Di',
      kind: 'spacing',
      ownerId: 'assembly',
      measureKey: 'di',
      from: { x: 0, y: 0 },
      to: { x: 0, y: Di },
      valueMm: Di,
      offsetDir: { x: -1, y: 0 },
      labelAt: { x: -dimOffsetBase * 1.2, y: Di / 2 },
    });
    dimensions.push({
      id: 'dim-stagger',
      kind: 'stagger',
      ownerId: 'assembly',
      measureKey: 'staggerA',
      from: { x: 0, y: Di },
      to: { x: A, y: Di },
      valueMm: A,
      offsetDir: { x: 0, y: 1 },
      labelAt: { x: A / 2, y: Di + dimOffsetBase * 1.1 },
    });
  }

  return {
    pipeCount: sol.stagger.pipeCount,
    mode: sol.elbow.mode,
    elbowAngleDeg: theta,
    nps: sol.elbow.nps,
    odMm: sol.elbow.odMm,
    clrMm: clr,
    segments,
    arcs,
    joints: jointMarkers,
    referencePlanes,
    dimensions,
    labels,
    elbowDetails,
    bounds,
  };
}

function pupDimension(
  pup: FabricationPiece,
  from: Vec2,
  to: Vec2,
  kind: 'finished-length' | 'cut-length',
  offsetDir: Vec2,
  offset: number,
  pipeIndex: number,
): FabDrawingDimension {
  const mid = scale(add(from, to), 0.5);
  const side = pup.kind === 'inlet-pup' ? -1 : 1;
  return {
    id: `dim-${pup.id}-${kind}`,
    kind,
    ownerId: pup.id,
    measureKey: kind === 'finished-length' ? 'finishedLength' : 'cutLength',
    from,
    to,
    valueMm: kind === 'finished-length' ? (pup.finishedLengthMm ?? 0) : (pup.cutLengthMm ?? 0),
    offsetDir,
    labelAt: add(mid, scale(offsetDir, side * offset * (1 + (pipeIndex % 2) * 0.35))),
  };
}

/**
 * Independent reconstruction check (test support): rebuild the pipe-1
 * reference planes and every axis intersection from the drawing model and
 * verify they recover Lin, Lout, Di and the stagger positions of the
 * original solution. Pure geometry — does not share formulas with the
 * fabrication module beyond the documented coordinate construction.
 */
export function reconstructAssemblyFromDrawing(drawing: PipeCombFabDrawing): {
  linMm: number;
  loutMm: number;
  diMm: number;
  axisIntersections: Vec2[];
} {
  const refEnt = drawing.referencePlanes.find((r) => r.id === 'REF-ENT');
  const refSal = drawing.referencePlanes.find((r) => r.id === 'REF-SAL');
  const e1 = drawing.elbowDetails.find((d) => d.pipeNumber === 1)?.axisIntersection ?? { x: 0, y: 0 };
  const linMm = refEnt ? Math.hypot(e1.x - refEnt.point.x, e1.y - refEnt.point.y) : 0;
  const loutMm = refSal ? Math.hypot(refSal.point.x - e1.x, refSal.point.y - e1.y) : 0;
  const axisIntersections = drawing.elbowDetails
    .slice()
    .sort((a, b) => a.pipeNumber - b.pipeNumber)
    .map((d) => d.axisIntersection);
  const diMm = axisIntersections.length >= 2
    ? Math.abs(axisIntersections[1].y - axisIntersections[0].y)
    : 0;
  return { linMm, loutMm, diMm, axisIntersections };
}
