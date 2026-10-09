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
 * - The comb is planar. With the inlet axis direction (1, 0) and the
 *   outlet axis direction (cos(theta), sin(theta)) turned CCW by the comb
 *   angle theta about each axis intersection, pipe i's axis intersection
 *   E_i sits at
 *       E_k = (-k*A, k*Di)        (k = 0 .. N-1)
 *   where A is the SIGNED P1 stagger and Di the initial spacing.
 *   Sign convention (P1/P3-A contract, verified by reconstruction):
 *   the inlet free faces of ALL pipes lie on the common REF-ENT plane and
 *   the outlet free faces on REF-SAL. With E_k = (-k*A, k*Di):
 *     inlet pup length  = Lin  - t - k*A - g        (P3-A relation)
 *     outlet pup length = Lout - t - k*delta - g
 *     delta = (E_{k+1} - E_k) . outletDir = Di*sin(theta) - A*cos(theta)
 *   and the perpendicular spacing of adjacent OUTLET axes is
 *     Df = A*sin(theta) + Di*cos(theta)             (P1 definition of A)
 *   The opposite sign (E_k = (+k*A, k*Di)) puts every free face k >= 2 off
 *   its reference plane by multiples of A and yields a wrong outlet
 *   spacing |Di*cos(theta) - A*sin(theta)|; the reconstruction checks in
 *   the test suite fail against that mutation.
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
    /* P1/P3-A placement: E_k = (-k*A, k*Di). See header: with this sign
     * every inlet free face lies on REF-ENT and every outlet free face on
     * REF-SAL, and the perpendicular outlet spacing equals Df. */
    const E: Vec2 = { x: -k * A, y: k * Di };
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
    /* Signed stagger A: E_1 = (0, Di) line to E_2 = (-A, Di). The run is
     * |A|; the value keeps the P1 sign (positive A offsets each successive
     * pipe upstream, -x). */
    dimensions.push({
      id: 'dim-stagger',
      kind: 'stagger',
      ownerId: 'assembly',
      measureKey: 'staggerA',
      from: { x: 0, y: Di },
      to: { x: -A, y: Di },
      valueMm: A,
      offsetDir: { x: 0, y: 1 },
      labelAt: { x: -A / 2, y: Di + dimOffsetBase * 1.1 },
    });
    /* Df as a REAL perpendicular dimension between the outlet axes of
     * pipes 1 and 2: from E_1 to the projection of E_2 on the plane
     * perpendicular to the outlet axis through E_1. Measured run == Df. */
    const E2: Vec2 = { x: -A, y: Di };
    const step = sub(E2, { x: 0, y: 0 });
    const along = step.x * outletDir.x + step.y * outletDir.y;
    const E2perp: Vec2 = sub(E2, scale(outletDir, along));
    dimensions.push({
      id: 'dim-Df',
      kind: 'spacing',
      ownerId: 'assembly',
      measureKey: 'df',
      from: { x: 0, y: 0 },
      to: E2perp,
      valueMm: sol.stagger.finalSpacingMm,
      offsetDir: outletDir,
      labelAt: add(scale(E2perp, 0.5), scale(outletDir, dimOffsetBase * 1.2)),
    });
  }

  /* Framing includes the annotation layer: dimension label anchors,
   * theoretical-point labels and reference-plane label zones are part of
   * the bounding box so neither the SVG view nor the PDF crops text. */
  for (const dim of dimensions) expandBounds(bounds, dim.labelAt, dimOffsetBase * 0.45);
  for (const lab of labels) expandBounds(bounds, lab.at, dimOffsetBase * 0.3);
  expandBounds(bounds, refEnt.point, dimOffsetBase * 0.6);
  expandBounds(bounds, refSal.point, dimOffsetBase * 0.6);

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
 * Independent reconstruction of the assembly FROM THE DRAWING PRIMITIVES
 * (test support). It deliberately derives everything geometrically from
 * segments, arcs, joint markers, elbow details and reference planes — it
 * never re-applies the builder's placement formulas:
 *
 * - Inlet axis direction: unit(E_1 - keptFacePoint_1) (travel direction of
 *   pipe 1 towards its axis intersection).
 * - Outlet axis direction: unit(cutFacePoint_1 - E_1).
 * - Free faces: for each piece segment, the endpoint that is neither a
 *   joint pup face (catalog) nor an arc tangent point (bend).
 * - Plane errors: signed distance of each free face to REF-ENT / REF-SAL,
 *   using the planes' own point+normal.
 * - Spacings: perpendicular distances between consecutive axis
 *   intersections measured on the derived axis directions.
 *
 * A mutation restoring the old placement (E_k = +k*A) leaves every free
 * face k >= 2 off its reference plane by multiples of A and changes the
 * perpendicular outlet spacing, so these checks fail against it.
 */
export interface AssemblyReconstruction {
  linMm: number;
  loutMm: number;
  diMm: number;
  dfMm: number;
  axisIntersections: Vec2[];
  inletAxisDir: Vec2;
  outletAxisDir: Vec2;
  inletFreeFaces: { pieceId: string; point: Vec2; planeErrorMm: number }[];
  outletFreeFaces: { pieceId: string; point: Vec2; planeErrorMm: number }[];
  /** Perpendicular spacing between consecutive inlet axes (k, k+1). */
  initialPerpSpacingsMm: number[];
  /** Perpendicular spacing between consecutive outlet axes (k, k+1). */
  finalPerpSpacingsMm: number[];
}

export function reconstructAssemblyFromDrawing(drawing: PipeCombFabDrawing): AssemblyReconstruction {
  const refEnt = drawing.referencePlanes.find((r) => r.id === 'REF-ENT');
  const refSal = drawing.referencePlanes.find((r) => r.id === 'REF-SAL');
  const details = drawing.elbowDetails.slice().sort((a, b) => a.pipeNumber - b.pipeNumber);
  const d1 = details[0];
  const e1 = d1?.axisIntersection ?? { x: 0, y: 0 };
  const inletAxisDir = d1 ? norm(sub(d1.axisIntersection, d1.keptFacePoint)) : { x: 1, y: 0 };
  const outletAxisDir = d1 ? norm(sub(d1.cutFacePoint, d1.axisIntersection)) : { x: 1, y: 0 };
  const axisIntersections = details.map((d) => d.axisIntersection);

  const linMm = refEnt ? Math.hypot(e1.x - refEnt.point.x, e1.y - refEnt.point.y) : 0;
  const loutMm = refSal ? Math.hypot(refSal.point.x - e1.x, refSal.point.y - e1.y) : 0;

  // Free faces: segment endpoints that are not joint pup faces and not arc
  // tangent points. Catalog: pup free face = endpoint != pupFace; bend:
  // bar free ends = endpoints not lying on the arc circle.
  const jointFaces = new Set(drawing.joints.map((j) => `${j.pupFace.x.toFixed(9)},${j.pupFace.y.toFixed(9)}`));
  const onArc = (p: Vec2): boolean =>
    drawing.arcs.some((a) => Math.abs(Math.hypot(p.x - a.center.x, p.y - a.center.y) - a.radiusMm) < 1e-6);
  const key = (p: Vec2) => `${p.x.toFixed(9)},${p.y.toFixed(9)}`;
  const freeEnd = (seg: FabDrawingSegment): Vec2 | null => {
    const cands = [seg.from, seg.to].filter((p) => !jointFaces.has(key(p)) && !onArc(p));
    // A finished straight has exactly one free end (the other is a joint
    // face or a tangent). Allowance over-length segments are ignored by
    // the caller (they are not finished).
    if (cands.length !== 1) return null;
    return cands[0];
  };

  const planeError = (p: Vec2, plane: FabDrawingReferencePlane | undefined): number => {
    if (!plane) return Number.NaN;
    const n = { x: -plane.direction.y, y: plane.direction.x };
    return (p.x - plane.point.x) * n.x + (p.y - plane.point.y) * n.y;
  };

  const inletFreeFaces: AssemblyReconstruction['inletFreeFaces'] = [];
  const outletFreeFaces: AssemblyReconstruction['outletFreeFaces'] = [];
  for (const seg of drawing.segments) {
    if (!seg.finished) continue;
    const free = freeEnd(seg);
    if (!free) continue;
    // Classify by side: inlet pieces run along the inlet axis; outlet
    // pieces (and bend outlet straights) along the outlet axis.
    const run = norm(sub(seg.to, seg.from));
    const alongIn = Math.abs(run.x * inletAxisDir.x + run.y * inletAxisDir.y);
    const alongOut = Math.abs(run.x * outletAxisDir.x + run.y * outletAxisDir.y);
    if (alongIn >= alongOut) {
      inletFreeFaces.push({ pieceId: seg.pieceId, point: free, planeErrorMm: planeError(free, refEnt) });
    } else {
      outletFreeFaces.push({ pieceId: seg.pieceId, point: free, planeErrorMm: planeError(free, refSal) });
    }
  }
  const byPiece = (a: { pieceId: string }, b: { pieceId: string }) => a.pieceId.localeCompare(b.pieceId);
  inletFreeFaces.sort(byPiece);
  outletFreeFaces.sort(byPiece);

  const perpOf = (dir: Vec2): Vec2 => ({ x: -dir.y, y: dir.x });
  const initialPerpSpacingsMm: number[] = [];
  const finalPerpSpacingsMm: number[] = [];
  for (let i = 1; i < axisIntersections.length; i++) {
    const step = sub(axisIntersections[i], axisIntersections[i - 1]);
    initialPerpSpacingsMm.push(Math.abs(step.x * perpOf(inletAxisDir).x + step.y * perpOf(inletAxisDir).y));
    finalPerpSpacingsMm.push(Math.abs(step.x * perpOf(outletAxisDir).x + step.y * perpOf(outletAxisDir).y));
  }
  const diMm = initialPerpSpacingsMm[0] ?? 0;
  const dfMm = finalPerpSpacingsMm[0] ?? 0;

  return {
    linMm,
    loutMm,
    diMm,
    dfMm,
    axisIntersections,
    inletAxisDir,
    outletAxisDir,
    inletFreeFaces,
    outletFreeFaces,
    initialPerpSpacingsMm,
    finalPerpSpacingsMm,
  };
}
