/**
 * PB-PIPE-COMB-CORRECTION-001 / P4 — pure diagram model for the two-elbow
 * offset tool ("Desplazamiento con dos codos").
 *
 * Consumes the FROZEN engine solution (`solvePipeComb`) plus the resolved
 * common CLR and produces a testable, renderer-agnostic model in mm space
 * (y down, matching SVG). The React renderer only scales and strokes it.
 *
 * Geometry conventions:
 *   - Entry axis of line i at y = i · initialSpacing; exit axis at
 *     y = i · finalSpacing. Signed offsets therefore point down when the
 *     comb expands and up when it contracts — the sign is visible.
 *   - DISPLAY-ONLY ALIGNMENT: the engine contract does not fix where along
 *     the axis each jog happens. This model places the first intersection
 *     point (PI1) of every displaced line at a common vertical station so
 *     the jogs read as a family. That station is NOT a works dimension.
 *   - Stubs (entry/exit extensions) are decorative continuations of the
 *     axes; they are NOT pipe to cut. The physical assembly is exactly
 *     elbow + intermediate straight + elbow between tangent points.
 *   - Theoretical axes (through the PIs) are emitted separately so the
 *     renderer can dash them, distinct from physical pieces.
 *
 * Arc sampling uses the radius parametrization point(λ) =
 * A + (R·sin(λθ), s·R·(1−cos(λθ))) per elbow, analytically equivalent to
 * the PI/take-out construction (see module tests, which verify the same
 * points independently from engine outputs).
 *
 * Pure module: no React, no DOM, no i18n.
 */

import type { PipeCombSolution } from '../../core/geometry/pipe-comb.ts';

const DEG_TO_RAD = Math.PI / 180;
const ARC_SAMPLES = 24;
/** Minimum decorative stub length (mm of drawing, before scaling). */
const STUB_FRACTION_OF_SPACING = 0.9;
const STUB_MIN_MM = 40;
/** Extra theoretical-axis extension beyond PIs/tangent points. */
const AXIS_EXTENSION_FRACTION = 0.25;

export interface DiagramPoint {
  x: number;
  y: number;
}

export interface DiagramLine {
  id: string;
  kind: 'reference' | 'displaced';
  /** Sampled centerline of the physical assembly (elbow–straight–elbow). Empty for reference. */
  assembly: DiagramPoint[];
  /** Decorative entry continuation (NOT pipe to cut). */
  entryStub: { from: DiagramPoint; to: DiagramPoint } | null;
  /** Decorative exit continuation (NOT pipe to cut). */
  exitStub: { from: DiagramPoint; to: DiagramPoint } | null;
  /** Reference lines are a single straight physical run. */
  straightRun: { from: DiagramPoint; to: DiagramPoint } | null;
  /** Dashed theoretical axes through the intersection points. */
  theoretical: {
    entryAxis: { from: DiagramPoint; to: DiagramPoint };
    diagonalAxis: { from: DiagramPoint; to: DiagramPoint };
    exitAxis: { from: DiagramPoint; to: DiagramPoint };
  } | null;
  pi1: DiagramPoint | null;
  pi2: DiagramPoint | null;
  /** Tangent points: entry, diagonal-start, diagonal-end, exit. */
  tangentPoints: DiagramPoint[];
  /** True when the intermediate straight is zero (elbows tangent). */
  zeroCut: boolean;
}

export interface DiagramDimension {
  kind: 'vertical' | 'horizontal' | 'aligned';
  /** Dimension measured between these two model points. */
  from: DiagramPoint;
  to: DiagramPoint;
  /**
   * Perpendicular distance from the measured element to the dimension line
   * (mm, signed; positive = down/right of the element).
   */
  lane: number;
  /**
   * Position of the label along the dimension line (0 = start, 0.5 =
   * middle, default). Used to keep long localized labels from piling up at
   * the jog midpoint on crowded assemblies (e.g. N=12).
   */
  labelAt?: number;
  /** i18n key suffix under tools.prefab.twoElbowOffset.dims. */
  labelKey: 'spacingInitial' | 'spacingFinal' | 'offset' | 'advance' | 'travel' | 'straightCut';
  /** Display value (mm) taken from the engine solution / inputs. */
  valueMm: number;
  /** Line id this dimension belongs to, when applicable. */
  lineId: string | null;
}

export interface DiagramAngleMark {
  at: DiagramPoint;
  /** Unit direction of the entry axis (+x). */
  fromDir: DiagramPoint;
  /** Unit direction of the diagonal. */
  toDir: DiagramPoint;
  radiusMm: number;
  angleDeg: number;
}

export interface TwoElbowOffsetDiagramModel {
  lines: DiagramLine[];
  dimensions: DiagramDimension[];
  angleMark: DiagramAngleMark | null;
  /** Id of the line carrying the full dimension set (max |offset|). */
  dimensionedLineId: string | null;
  /** True when no line is displaced (equal spacings). */
  allStraight: boolean;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

function sampleArc1(a: DiagramPoint, radiusMm: number, thetaRad: number, s: 1 | -1): DiagramPoint[] {
  const pts: DiagramPoint[] = [];
  for (let k = 0; k <= ARC_SAMPLES; k++) {
    const l = (k / ARC_SAMPLES) * thetaRad;
    pts.push({ x: a.x + radiusMm * Math.sin(l), y: a.y + s * radiusMm * (1 - Math.cos(l)) });
  }
  return pts;
}

function sampleArc2(d: DiagramPoint, radiusMm: number, thetaRad: number, s: 1 | -1): DiagramPoint[] {
  const pts: DiagramPoint[] = [];
  for (let k = 0; k <= ARC_SAMPLES; k++) {
    const l = (k / ARC_SAMPLES) * thetaRad;
    pts.push({
      x: d.x + radiusMm * (Math.sin(thetaRad) - Math.sin(thetaRad - l)),
      y: d.y + s * radiusMm * (Math.cos(thetaRad - l) - Math.cos(thetaRad)),
    });
  }
  return pts;
}

/**
 * Build the diagram model. `clrMm` is the resolved common center-line radius
 * (the engine solution does not carry it; the UI passes its canonical value).
 */
export function buildTwoElbowOffsetDiagram(
  solution: PipeCombSolution,
  clrMm: number,
): TwoElbowOffsetDiagramModel {
  const { lines, initialSpacingMm, finalSpacingMm, elbowAngleDeg } = solution;
  const thetaRad = elbowAngleDeg * DEG_TO_RAD;
  const displaced = lines.filter((l) => l.offsetAbsMm > 0);
  const allStraight = displaced.length === 0;

  const stubLen = Math.max(STUB_MIN_MM, STUB_FRACTION_OF_SPACING * Math.min(initialSpacingMm, finalSpacingMm));
  const takeOutMax = displaced.length > 0 ? Math.max(...displaced.map((l) => l.takeOutPerElbowMm)) : 0;
  const advanceMax = displaced.length > 0 ? Math.max(...displaced.map((l) => l.advanceMm)) : 0;

  // Display-only alignment: every jog's PI1 sits on this common station.
  const jogStationX = stubLen + takeOutMax;
  const xLeft = 0;
  const xRight = jogStationX + advanceMax + takeOutMax + stubLen;

  const yIn = (i: number) => i * initialSpacingMm;
  const yOut = (i: number) => i * finalSpacingMm;

  const modelLines: DiagramLine[] = lines.map((line, i) => {
    const yE = yIn(i);
    const yX = yOut(i);

    if (line.offsetAbsMm === 0) {
      return {
        id: line.id,
        kind: 'reference',
        assembly: [],
        entryStub: null,
        exitStub: null,
        straightRun: { from: { x: xLeft, y: yE }, to: { x: xRight, y: yX } },
        theoretical: null,
        pi1: null,
        pi2: null,
        tangentPoints: [],
        zeroCut: false,
      };
    }

    const s: 1 | -1 = line.offsetMm >= 0 ? 1 : -1;
    const t = line.takeOutPerElbowMm;
    const pi1 = { x: jogStationX, y: yE };
    const pi2 = { x: jogStationX + line.advanceMm, y: yX };
    const travel = line.travelMm;
    const u = { x: (pi2.x - pi1.x) / travel, y: (pi2.y - pi1.y) / travel };

    const entryTangent = { x: pi1.x - t, y: yE };
    const exitTangent = { x: pi2.x + t, y: yX };
    const diagStart = { x: pi1.x + t * u.x, y: pi1.y + t * u.y };
    const diagEnd = { x: pi2.x - t * u.x, y: pi2.y - t * u.y };
    const zeroCut = line.straightCutLengthMm === 0;

    const arc1 = sampleArc1(entryTangent, clrMm, thetaRad, s);
    const arc2 = sampleArc2(diagEnd, clrMm, thetaRad, s);
    // arc2 starts exactly at diagEnd: skip its duplicate first point so the
    // polyline never contains a zero-length segment.
    const assembly = zeroCut
      ? [...arc1, ...arc2.slice(1)]
      : [...arc1, diagEnd, ...arc2.slice(1)];

    const ext = AXIS_EXTENSION_FRACTION * t;
    return {
      id: line.id,
      kind: 'displaced',
      assembly,
      entryStub: { from: { x: xLeft, y: yE }, to: entryTangent },
      exitStub: { from: exitTangent, to: { x: xRight, y: yX } },
      theoretical: {
        entryAxis: { from: entryTangent, to: { x: pi1.x + ext, y: pi1.y } },
        diagonalAxis: { from: pi1, to: pi2 },
        exitAxis: { from: { x: pi2.x - ext, y: pi2.y }, to: exitTangent },
      },
      pi1,
      pi2,
      tangentPoints: [entryTangent, diagStart, diagEnd, exitTangent],
      zeroCut,
      straightRun: null,
    };
  });

  /* ---------------- Dimensions ---------------- */

  const dimensions: DiagramDimension[] = [];
  const lineCount = lines.length;

  // Spacing dimensions: between line 1 and line 2 axes, entry side (left
  // lane) and exit side (right lane). Always present (lineCount >= 2).
  dimensions.push({
    kind: 'vertical',
    from: { x: xLeft, y: yIn(0) },
    to: { x: xLeft, y: yIn(1) },
    lane: -0.45 * stubLen,
    labelKey: 'spacingInitial',
    valueMm: initialSpacingMm,
    lineId: null,
  });
  dimensions.push({
    kind: 'vertical',
    from: { x: xRight, y: yOut(0) },
    to: { x: xRight, y: yOut(1) },
    lane: 0.45 * stubLen,
    labelKey: 'spacingFinal',
    valueMm: finalSpacingMm,
    lineId: null,
  });

  // Representative displaced line: the one with the largest |offset|.
  let dimensionedLineId: string | null = null;
  let angleMark: DiagramAngleMark | null = null;
  if (!allStraight) {
    const rep = displaced[displaced.length - 1];
    const repIdx = lines.findIndex((l) => l.id === rep.id);
    dimensionedLineId = rep.id;
    const s = rep.offsetMm >= 0 ? 1 : -1;
    const repModel = modelLines[repIdx];
    const pi1 = repModel.pi1!;
    const pi2 = repModel.pi2!;
    const laneBase = Math.max(0.5 * stubLen, 2.2 * rep.takeOutPerElbowMm);

    // Offset: between the (extended) theoretical entry/exit axes, mid-jog.
    // Label sits toward the entry end, away from the travel/cut labels that
    // occupy the upper side of the diagonal.
    const midX = (pi1.x + pi2.x) / 2;
    dimensions.push({
      kind: 'vertical',
      from: { x: midX, y: pi1.y },
      to: { x: midX, y: pi2.y },
      lane: 0.35 * stubLen,
      labelAt: 0.28,
      labelKey: 'offset',
      valueMm: rep.offsetAbsMm,
      lineId: rep.id,
    });
    // Advance: horizontal between the PI projections, on the side opposite
    // to the jog so it never crosses the drawing.
    dimensions.push({
      kind: 'horizontal',
      from: { x: pi1.x, y: pi1.y },
      to: { x: pi2.x, y: pi1.y },
      lane: s > 0 ? -laneBase : laneBase + Math.abs(rep.offsetMm),
      labelKey: 'advance',
      valueMm: rep.advanceMm,
      lineId: rep.id,
    });
    // Travel: aligned with the diagonal between the PIs, outward lane far
    // enough to clear the rotated offset label at the jog midpoint.
    dimensions.push({
      kind: 'aligned',
      from: pi1,
      to: pi2,
      lane: s > 0 ? 1.05 * laneBase : -1.05 * laneBase,
      labelAt: 0.35,
      labelKey: 'travel',
      valueMm: rep.travelMm,
      lineId: rep.id,
    });
    // Straight cut: aligned between the diagonal tangent points, further out
    // and toward the exit end so it never stacks on the travel label.
    if (!repModel.zeroCut) {
      dimensions.push({
        kind: 'aligned',
        from: repModel.tangentPoints[1],
        to: repModel.tangentPoints[2],
        lane: s > 0 ? 1.95 * laneBase : -1.95 * laneBase,
        labelAt: 0.75,
        labelKey: 'straightCut',
        valueMm: rep.straightCutLengthMm,
        lineId: rep.id,
      });
    }
    angleMark = {
      at: pi1,
      fromDir: { x: 1, y: 0 },
      toDir: {
        x: (pi2.x - pi1.x) / rep.travelMm,
        y: (pi2.y - pi1.y) / rep.travelMm,
      },
      radiusMm: Math.max(0.45 * laneBase, 0.8 * rep.takeOutPerElbowMm),
      angleDeg: elbowAngleDeg,
    };
  }

  /* ---------------- Bounds ---------------- */

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const eat = (p: DiagramPoint) => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  };
  for (const ml of modelLines) {
    for (const p of ml.assembly) eat(p);
    if (ml.entryStub) {
      eat(ml.entryStub.from);
      eat(ml.entryStub.to);
    }
    if (ml.exitStub) {
      eat(ml.exitStub.from);
      eat(ml.exitStub.to);
    }
    if (ml.straightRun) {
      eat(ml.straightRun.from);
      eat(ml.straightRun.to);
    }
  }
  for (const d of dimensions) {
    eat(d.from);
    eat(d.to);
  }
  // Include the last axes even when everything is straight.
  eat({ x: xLeft, y: yIn(lineCount - 1) });
  eat({ x: xRight, y: yOut(lineCount - 1) });

  return {
    lines: modelLines,
    dimensions,
    angleMark,
    dimensionedLineId,
    allStraight,
    bounds: { minX, maxX, minY, maxY },
  };
}
