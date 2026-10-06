/**
 * Pure visualization model for the genuine pipe comb (stagger) diagram.
 * Ticket: PB-PIPE-COMB-CORRECTION-001 / P2
 *
 * This is a SCREEN SCHEMATIC view model only — NOT a 1:1 fabrication
 * drawing. It consumes the P1 kernel result (`PipeCombStaggerSolution`)
 * and never recomputes the core law A = (Df − Di·cos θ)/sin θ: every
 * stagger value used here comes directly from the kernel output.
 *
 * Coordinate convention (model space, millimetres, +Y up):
 *   u = (0, 1)                     initial pipe direction
 *   v = (sin θ, cos θ)             final pipe direction (clockwise bend θ)
 *   n = (cos θ, −sin θ)            final-line normal (perpendicular to v)
 *   E_k = (k·Di, −k·A)             elbow/reference point of pipe k (0-based)
 *
 * Visualization consistency identity (documented, never used to derive A):
 *   (E_{k+1} − E_k) · n = Di·cos θ + A·sin θ = Df
 *
 * Positive A staggers elbows downwards (−u) as the pipe index grows;
 * negative A staggers them upwards (+u); A = 0 leaves all elbow points on
 * a common line perpendicular to u (longitudinally aligned).
 *
 * Purity: no React, no DOM, no i18n. Plain serializable data.
 */

import type { PipeCombStaggerSolution } from '../../core/geometry/pipe-comb-stagger.ts';

export interface PipeCombStaggerPoint {
  x: number;
  y: number;
}

export interface PipeCombStaggerViewModelPipe {
  /** 1-based pipe number. */
  pipeNumber: number;
  /** Entrance point on the common start plane (initial direction u). */
  start: PipeCombStaggerPoint;
  /** Elbow / reference point E_k. */
  elbow: PipeCombStaggerPoint;
  /** Exit point along the final direction v. */
  end: PipeCombStaggerPoint;
}

export interface PipeCombStaggerDimension {
  from: PipeCombStaggerPoint;
  to: PipeCombStaggerPoint;
  /** Physical value in mm (signed for the stagger dimension). */
  valueMm: number;
}

export interface PipeCombStaggerAngleArc {
  center: PipeCombStaggerPoint;
  radiusMm: number;
  /** Start angle in degrees, math convention (CCW from +X). */
  startDeg: number;
  /** End angle in degrees, math convention (CCW from +X). */
  endDeg: number;
}

export interface PipeCombStaggerViewModel {
  pipes: PipeCombStaggerViewModelPipe[];
  /** Di between the initial axes of pipes 1 and 2 (perpendicular). */
  dimInitial: PipeCombStaggerDimension;
  /** Df between the final axes of pipes 1 and 2 (perpendicular to v). */
  dimFinal: PipeCombStaggerDimension;
  /** Signed adjacent stagger A between elbows 1 and 2, along u. */
  dimStagger: PipeCombStaggerDimension;
  /** Elbow angle arc at the elbow of pipe 1, between u and v. */
  angleArc: PipeCombStaggerAngleArc;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

function rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Build the schematic view model from a solved kernel result.
 * Deterministic: the same solution always yields the same model.
 */
export function buildPipeCombStaggerViewModel(solution: PipeCombStaggerSolution): PipeCombStaggerViewModel {
  const { pipes, initialSpacingMm, finalSpacingMm, elbowAngleDeg } = solution;
  const n = pipes.length;
  const di = initialSpacingMm;
  const theta = rad(elbowAngleDeg);
  const v = { x: Math.sin(theta), y: Math.cos(theta) };
  const normal = { x: Math.cos(theta), y: -Math.sin(theta) };

  // Elbow/reference points from the kernel cumulative stagger (never
  // recomputed here): E_k = (k·Di, −cumulative_k).
  const elbows: PipeCombStaggerPoint[] = pipes.map((p, k) => ({
    x: k * di,
    y: -p.cumulativeStaggerMm,
  }));

  // Scene scale drives the entrance/exit extensions so any geometry fits.
  const spanX = Math.max((n - 1) * di, di);
  const spanY = Math.max(Math.abs(elbows[n - 1].y - elbows[0].y), di, finalSpacingMm);
  const base = Math.max(spanX, spanY, finalSpacingMm, 1);
  const back = 0.55 * base;
  const fwd = 0.9 * base;

  // Common start plane perpendicular to u below (−u of) every elbow.
  const yStart = Math.min(...elbows.map((e) => e.y)) - back;

  const modelPipes: PipeCombStaggerViewModelPipe[] = pipes.map((p, k) => ({
    pipeNumber: p.pipeNumber,
    start: { x: elbows[k].x, y: yStart },
    elbow: elbows[k],
    end: {
      x: elbows[k].x + v.x * fwd,
      y: elbows[k].y + v.y * fwd,
    },
  }));

  // Di dimension: horizontal (perpendicular to the vertical initial axes)
  // between pipes 1 and 2, near the entrances.
  const yDimInitial = yStart + 0.35 * back;
  const dimInitial: PipeCombStaggerDimension = {
    from: { x: elbows[0].x, y: yDimInitial },
    to: { x: elbows[1].x, y: yDimInitial },
    valueMm: di,
  };

  // Df dimension: perpendicular to the final axes, anchored on pipe 1's
  // final axis and landing exactly on pipe 2's final axis (because
  // (E_1 − E_0)·n = Df by the kernel law).
  const tFinal = 0.5 * fwd;
  const anchor = {
    x: elbows[0].x + v.x * tFinal,
    y: elbows[0].y + v.y * tFinal,
  };
  const dimFinal: PipeCombStaggerDimension = {
    from: anchor,
    to: {
      x: anchor.x + normal.x * finalSpacingMm,
      y: anchor.y + normal.y * finalSpacingMm,
    },
    valueMm: finalSpacingMm,
  };

  // Signed A dimension: longitudinal (along u) offset of elbow 2 relative
  // to elbow 1. Degenerate to a point when A = 0 (aligned); the component
  // skips drawing the line but the model keeps the identity.
  const dimStagger: PipeCombStaggerDimension = {
    from: { x: elbows[1].x, y: elbows[1].y },
    to: { x: elbows[1].x, y: elbows[0].y },
    valueMm: pipes.length > 1 ? -(elbows[1].y - elbows[0].y) : 0,
  };

  // Angle arc at elbow 1, between the final direction v and the initial
  // direction u. In math degrees: u = 90°, v = 90° − θ.
  const angleArc: PipeCombStaggerAngleArc = {
    center: elbows[0],
    radiusMm: 0.28 * base,
    startDeg: 90 - elbowAngleDeg,
    endDeg: 90,
  };

  // Bounding box over every drawn point (arc approximated by its bounding
  // square, which always encloses it).
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of modelPipes) {
    xs.push(p.start.x, p.elbow.x, p.end.x);
    ys.push(p.start.y, p.elbow.y, p.end.y);
  }
  for (const d of [dimInitial, dimFinal, dimStagger]) {
    xs.push(d.from.x, d.to.x);
    ys.push(d.from.y, d.to.y);
  }
  xs.push(angleArc.center.x - angleArc.radiusMm, angleArc.center.x + angleArc.radiusMm);
  ys.push(angleArc.center.y - angleArc.radiusMm, angleArc.center.y + angleArc.radiusMm);

  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  // Non-degenerate guard: a perfectly collapsed axis still renders.
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || maxX - minX < 1e-6) {
    minX -= 1;
    maxX += 1;
  }
  if (!Number.isFinite(minY) || !Number.isFinite(maxY) || maxY - minY < 1e-6) {
    minY -= 1;
    maxY += 1;
  }

  return {
    pipes: modelPipes,
    dimInitial,
    dimFinal,
    dimStagger,
    angleArc,
    bounds: { minX, minY, maxX, maxY },
  };
}
