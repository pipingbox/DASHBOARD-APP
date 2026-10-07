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
  // Extensions are intentionally short: they inflate the scene span, and
  // an inflated span squeezes the elbow pitch in screen pixels, which
  // hurts label legibility (P2 final review, H3).
  const spanX = Math.max((n - 1) * di, di);
  const spanY = Math.max(Math.abs(elbows[n - 1].y - elbows[0].y), di, finalSpacingMm);
  const base = Math.max(spanX, spanY, finalSpacingMm, 1);
  const back = 0.35 * base;
  const fwd = 0.55 * base;

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

  // Bounding box over every drawn point. The arc only sweeps from the
  // final direction (90deg − θ) to the initial direction (90deg), so its
  // exact box is used instead of the full radius square (which inflated
  // the scene width and squeezed the elbow pitch — P2 review, H3).
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
  const thetaForArcBox = rad(elbowAngleDeg);
  xs.push(angleArc.center.x, angleArc.center.x + angleArc.radiusMm * Math.sin(thetaForArcBox));
  ys.push(angleArc.center.y + angleArc.radiusMm * Math.cos(thetaForArcBox), angleArc.center.y + angleArc.radiusMm);

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

/* ------------------------------------------------------------------ *
 * Screen layout (P2 final review fixes — H2 arc, H3 legibility).
 *
 * The view model above is unit-pure geometry; this section turns it into
 * concrete viewBox coordinates with legibility guarantees:
 *
 *  - The viewBox tightly wraps the content (no fixed 640x440 canvas), so
 *    desktop space is used and nothing is padded with emptiness.
 *  - All font sizes, ticks and label offsets are computed from the real
 *    display width (`displayWidthPx`), so text renders at a constant,
 *    legible CSS-pixel size at ANY viewport instead of shrinking with the
 *    drawing (H3).
 *  - The elbow-angle arc path is emitted with the sweep flag that keeps
 *    the arc CENTERED on the elbow of pipe 1 (H2). With the screen Y
 *    flip, math-CCW from the final direction to the initial direction is
 *    sweep=0; sweep=1 selected the mirrored centre away from the elbow.
 *  - Pipe labels use a deterministic subset rule when elbows are too
 *    close in screen pixels, so N=12 never produces unreadable overlaps.
 *
 * Everything is derived from the kernel solution via the view model; no
 * geometry is recomputed here either.
 * ------------------------------------------------------------------ */

export interface PipeCombScreenPoint {
  x: number;
  y: number;
}

export interface PipeCombScreenPipe {
  pipeNumber: number;
  start: PipeCombScreenPoint;
  elbow: PipeCombScreenPoint;
  end: PipeCombScreenPoint;
  /** Screen position of the pipe label; null when the subset rule hides it. */
  labelPos: PipeCombScreenPoint | null;
  labelAnchor: 'start' | 'middle' | 'end';
}

export interface PipeCombScreenDimension {
  from: PipeCombScreenPoint;
  to: PipeCombScreenPoint;
  labelPos: PipeCombScreenPoint;
  labelAnchor: 'start' | 'middle' | 'end';
  valueMm: number;
}

export interface PipeCombStaggerScreenLayout {
  viewBox: { x: number; y: number; w: number; h: number };
  /** Constant on-screen font size in CSS px that `fontSize` renders at. */
  fontPx: number;
  /** Font size in viewBox units (fontPx * unitsPerPx). */
  fontSize: number;
  /** Model units per CSS px at the given display width. */
  unitsPerPx: number;
  /** Half-length of dimension ticks in viewBox units. */
  tick: number;
  pipes: PipeCombScreenPipe[];
  dimInitial: PipeCombScreenDimension;
  dimFinal: PipeCombScreenDimension;
  dimStagger: PipeCombScreenDimension & { visible: boolean };
  /** Real SVG path data for the angle arc, centred on elbow 1 (sweep=0). */
  angleArcPath: string;
  angleLabelPos: PipeCombScreenPoint;
  angleLabelAnchor: 'start' | 'middle' | 'end';
  /** Estimated on-screen label boxes (H3): guaranteed mutually
   *  non-overlapping by the deterministic placement pass; exposed for
   *  pure tests. */
  labelRects: {
    initial: PipeCombScreenRect;
    final: PipeCombScreenRect;
    stagger: PipeCombScreenRect;
    angle: PipeCombScreenRect;
    pipeLabels: PipeCombScreenRect[];
  };
}

/** Margins reserved for labels, in CSS px of display width. */
const SCREEN_MARGIN = { leftPx: 96, rightPx: 24, topPx: 56, bottomPx: 48 };

function fmtNum(v: number): string {
  // Compact, locale-independent path/attribute number formatting. Six
  // decimals keep the serialised arc geometrically faithful (the H2 tests
  // reconstruct the arc centre from this string within ~1e-6 units).
  return String(Number(v.toFixed(6)));
}

/* ------------------------------------------------------------------ *
 * Deterministic label placement (P2 final review, H3).
 *
 * Dimension labels ("Di/Df/A …") are placed by scoring a small candidate
 * set: labels must never overlap each other or the other drawing labels,
 * must stay inside the viewBox, and prefer not to cross drawn segments
 * (the background-colour text halo in the component covers residual
 * crossings). Fully deterministic and unit-tested.
 * ------------------------------------------------------------------ */

/** Axis-aligned rectangle in viewBox units. */
export interface PipeCombScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function rectsOverlap(a: PipeCombScreenRect, b: PipeCombScreenRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function overlapArea(a: PipeCombScreenRect, b: PipeCombScreenRect): number {
  if (!rectsOverlap(a, b)) return 0;
  return (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
    (Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
}

/** Liang–Barsky segment/axis-aligned-rect intersection. */
function segIntersectsRect(
  x1: number, y1: number, x2: number, y2: number, r: PipeCombScreenRect,
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return (
    clip(-dx, x1 - r.x) &&
    clip(dx, r.x + r.w - x1) &&
    clip(-dy, y1 - r.y) &&
    clip(dy, r.y + r.h - y1)
  );
}

/**
 * Estimated on-screen box of a label. Character count is derived from the
 * value (sign, integer digits, two decimals, unit, short prefix) — a
 * placement heuristic only, deliberately conservative. Calibrated against
 * real Chromium glyph boxes (H3 final integration): the app font averages
 * ≈0.56em/char and the ink box is ≈1.33em tall starting ≈1.0em above the
 * baseline, so the estimate uses 0.62em/char, 1.5em height and a 1.1em
 * baseline offset to always enclose the real glyphs.
 */
function estimateLabelRect(
  pos: PipeCombScreenPoint,
  anchor: 'start' | 'middle' | 'end',
  chars: number,
  fontSize: number,
): PipeCombScreenRect {
  const w = chars * 0.62 * fontSize;
  const h = fontSize * 1.5;
  const x = anchor === 'start' ? pos.x : anchor === 'middle' ? pos.x - w / 2 : pos.x - w;
  return { x, y: pos.y - 1.1 * fontSize, w, h };
}

/** Estimated character count of a dimension label like "Df -117.16 mm". */
function dimLabelChars(valueMm: number): number {
  const a = Math.abs(valueMm);
  const intDigits = a >= 1 ? Math.floor(Math.log10(a)) + 1 : 1;
  return 2 + (valueMm < 0 ? 1 : 0) + intDigits + 3 + 3;
}

/**
 * Build the concrete screen layout for a solved pipe comb.
 *
 * @param solution       P1 kernel result (geometry source of truth).
 * @param displayWidthPx Real rendered width of the SVG in CSS px. The
 *                       layout guarantees text stays at `fontPx` CSS px at
 *                       this width; React re-invokes on container resize.
 * @param fontPx         Target on-screen font size (default 12, >= 11 at
 *                       every viewport for legibility — H3).
 */
export function buildPipeCombStaggerScreenLayout(
  solution: PipeCombStaggerSolution,
  displayWidthPx: number,
  fontPx = 12,
): PipeCombStaggerScreenLayout {
  const vm = buildPipeCombStaggerViewModel(solution);

  const spanX = Math.max(vm.bounds.maxX - vm.bounds.minX, 1e-6);
  const spanY = Math.max(vm.bounds.maxY - vm.bounds.minY, 1e-6);

  // unitsPerPx is solved (not iterated) so the final viewBox width maps
  // exactly onto the real display width:
  //   W_vb = spanX + margins_units,  unitsPerPx = W_vb / displayWidthPx.
  const marginsPx = SCREEN_MARGIN.leftPx + SCREEN_MARGIN.rightPx;
  const usablePx = Math.max(displayWidthPx - marginsPx, 40);
  const unitsPerPx = spanX / usablePx;

  const W = spanX + marginsPx * unitsPerPx;
  // `let`: the stage-2 fallback may extend the canvas downward (H only,
  // never W — the horizontal scale guarantees the on-screen font size).
  let H = spanY + (SCREEN_MARGIN.topPx + SCREEN_MARGIN.bottomPx) * unitsPerPx;
  const X = (x: number) => SCREEN_MARGIN.leftPx * unitsPerPx + (x - vm.bounds.minX);
  const Y = (y: number) => SCREEN_MARGIN.topPx * unitsPerPx + (vm.bounds.maxY - y);

  const fontSize = fontPx * unitsPerPx;
  const tick = 3.5 * unitsPerPx;

  // --- Pipe labels: deterministic greedy subset (H3 final integration).
  // Include pipe 1, then every pipe at least `labelPitchPx` away from the
  // last included one, and always PN. The side (below/above the elbow) is
  // NOT fixed: every label goes through the same scoring/fallback pass as
  // the dimension labels, so a tight PN lands on the free side instead of
  // overlapping its neighbour.
  const elbowPitchPx = solution.pipeCount > 1 ? solution.initialSpacingMm / unitsPerPx : Infinity;
  // End-anchored labels ("Tubería 12" ≈ 10 chars × 0.62em) extend left of
  // the elbow; same-side labels keep at least width + 8px clearance.
  const labelPitchPx = fontPx * 6.2 + 8;
  const lastK = solution.pipeCount - 1;
  const labeledIdx = new Set<number>([0]);
  let lastIncluded = 0;
  for (let k = 1; k < lastK; k++) {
    if ((k - lastIncluded) * elbowPitchPx >= labelPitchPx) {
      labeledIdx.add(k);
      lastIncluded = k;
    }
  }
  if (lastK > 0) labeledIdx.add(lastK); // PN always labeled
  const isLabeled = (k: number) => labeledIdx.has(k);

  const pipes: PipeCombScreenPipe[] = vm.pipes.map((p, k) => ({
    pipeNumber: p.pipeNumber,
    start: { x: X(p.start.x), y: Y(p.start.y) },
    elbow: { x: X(p.elbow.x), y: Y(p.elbow.y) },
    end: { x: X(p.end.x), y: Y(p.end.y) },
    // Provisional position (below the elbow); the scoring pass below may
    // move it above when the free side requires it. Null when the greedy
    // subset rule hides the label.
    labelPos: isLabeled(k)
      ? { x: X(p.elbow.x) - 8 * unitsPerPx, y: Y(p.elbow.y) + 16 * unitsPerPx }
      : null,
    labelAnchor: 'end',
  }));

  // --- Dimensions (first adjacent pair only, as before).
  const dimInitial: PipeCombScreenDimension = {
    from: { x: X(vm.dimInitial.from.x), y: Y(vm.dimInitial.from.y) },
    to: { x: X(vm.dimInitial.to.x), y: Y(vm.dimInitial.to.y) },
    labelPos: {
      x: (X(vm.dimInitial.from.x) + X(vm.dimInitial.to.x)) / 2,
      y: Y(vm.dimInitial.from.y) + (fontPx + 6) * unitsPerPx,
    },
    labelAnchor: 'middle',
    valueMm: vm.dimInitial.valueMm,
  };

  // --- Angle arc (H2): centred on elbow 1 with sweep=0.
  // Model: u = 90deg, v = 90deg - theta (CCW-positive, +Y up). Screen Y is
  // flipped, so math-CCW maps to screen-CCW, i.e. SVG sweep-flag=0.
  // sweep=1 selected the mirrored centre away from the elbow.
  const arc = vm.angleArc;
  const arcStart = {
    x: X(arc.center.x + arc.radiusMm * Math.cos((arc.startDeg * Math.PI) / 180)),
    y: Y(arc.center.y + arc.radiusMm * Math.sin((arc.startDeg * Math.PI) / 180)),
  };
  const arcEnd = {
    x: X(arc.center.x + arc.radiusMm * Math.cos((arc.endDeg * Math.PI) / 180)),
    y: Y(arc.center.y + arc.radiusMm * Math.sin((arc.endDeg * Math.PI) / 180)),
  };
  const r = arc.radiusMm;
  const angleArcPath =
    `M ${fmtNum(arcStart.x)} ${fmtNum(arcStart.y)} ` +
    `A ${fmtNum(r)} ${fmtNum(r)} 0 0 0 ${fmtNum(arcEnd.x)} ${fmtNum(arcEnd.y)}`;

  const midDeg = (arc.startDeg + arc.endDeg) / 2;

  // --- Deterministic label placement (H3 final integration): EVERY
  // annotation — pipe labels, Di, angle, A and Df — goes through the same
  // scoring pass with a ring-scan fallback, so no two labels ever overlap
  // and all stay inside the viewBox. Pick order: pipe labels (P1..PN),
  // then Di, angle, A, Df.
  const staggerVisible = Math.abs(vm.dimStagger.valueMm) > 1e-9;
  const staggerFrom = { x: X(vm.dimStagger.from.x), y: Y(vm.dimStagger.from.y) };
  const staggerTo = { x: X(vm.dimStagger.to.x), y: Y(vm.dimStagger.to.y) };
  const finalFrom = { x: X(vm.dimFinal.from.x), y: Y(vm.dimFinal.from.y) };
  const finalTo = { x: X(vm.dimFinal.to.x), y: Y(vm.dimFinal.to.y) };

  // Drawn segments (screen coords) used for the crossing penalty.
  const segments: Array<[number, number, number, number]> = [];
  for (const p of pipes) {
    segments.push([p.start.x, p.start.y, p.elbow.x, p.elbow.y]);
    segments.push([p.elbow.x, p.elbow.y, p.end.x, p.end.y]);
  }
  segments.push([dimInitial.from.x, dimInitial.from.y, dimInitial.to.x, dimInitial.to.y]);
  segments.push([finalFrom.x, finalFrom.y, finalTo.x, finalTo.y]);
  if (staggerVisible) {
    segments.push([staggerFrom.x, staggerFrom.y, staggerTo.x, staggerTo.y]);
    segments.push([pipes[0].elbow.x, pipes[0].elbow.y, pipes[1].elbow.x, pipes[0].elbow.y]);
  }

  // Boxes of already-placed labels; every pick appends its winner.
  const occupied: PipeCombScreenRect[] = [];

  interface LabelCandidate {
    pos: PipeCombScreenPoint;
    anchor: 'start' | 'middle' | 'end';
  }
  const scoreCandidate = (cand: LabelCandidate, chars: number, index: number): number => {
    const rect = estimateLabelRect(cand.pos, cand.anchor, chars, fontSize);
    const m = 4 * unitsPerPx;
    let score = index; // deterministic preference for earlier candidates
    if (rect.x < m || rect.y < m || rect.x + rect.w > W - m || rect.y + rect.h > H - m) {
      score += 1e6;
    }
    for (const o of occupied) score += overlapArea(rect, o) * 1000;
    for (const [x1, y1, x2, y2] of segments) {
      if (segIntersectsRect(x1, y1, x2, y2, rect)) score += 25;
    }
    return score;
  };
  // A rect is "free" when it stays inside the viewBox (same margin as the
  // scorer) and overlaps none of the already-placed label boxes.
  const rectIsFree = (rect: PipeCombScreenRect): boolean => {
    const m = 4 * unitsPerPx;
    if (rect.x < m || rect.y < m || rect.x + rect.w > W - m || rect.y + rect.h > H - m) return false;
    for (const o of occupied) if (rectsOverlap(rect, o)) return false;
    return true;
  };
  const pick = (cands: LabelCandidate[], chars: number): LabelCandidate => {
    let best = cands[0];
    let bestScore = Infinity;
    cands.forEach((c, i) => {
      const s = scoreCandidate(c, chars, i);
      if (s < bestScore) {
        bestScore = s;
        best = c;
      }
    });
    let rect = estimateLabelRect(best.pos, best.anchor, chars, fontSize);
    // Deterministic fallback (H3 final integration), two stages:
    //  1) When EVERY scored candidate still overlaps another label or
    //     leaves the viewBox, scan concentric rings around the candidates'
    //     centroid until a fully free, in-viewBox spot is found. Rings
    //     stop at the farthest viewBox corner (beyond it every position is
    //     outside, so the scan is exhaustive).
    //  2) Extremely narrow canvases can be genuinely full: then grow the
    //     canvas DOWNWARD (H only) and place the label in the fresh band.
    //     Extending H never changes the horizontal scale, so the
    //     guaranteed on-screen font size (fontPx) and the physical
    //     geometry are untouched; no dimension is ever hidden.
    if (!rectIsFree(rect)) {
      const centre = {
        x: cands.reduce((s, c) => s + c.pos.x, 0) / cands.length,
        y: cands.reduce((s, c) => s + c.pos.y, 0) / cands.length,
      };
      const maxR = Math.max(
        Math.hypot(centre.x, centre.y),
        Math.hypot(W - centre.x, centre.y),
        Math.hypot(centre.x, H - centre.y),
        Math.hypot(W - centre.x, H - centre.y),
      );
      const stepR = fontSize * 0.8;
      const anchors: Array<'start' | 'end' | 'middle'> = ['start', 'end', 'middle'];
      let found: LabelCandidate | null = null;
      for (let k = 0; k * stepR <= maxR && !found; k++) {
        const r = k * stepR;
        const steps = k === 0 ? 1 : Math.max(8, Math.ceil((2 * Math.PI * r) / stepR));
        for (let j = 0; j < steps && !found; j++) {
          const a = (j / steps) * 2 * Math.PI;
          const pos = { x: centre.x + r * Math.cos(a), y: centre.y + r * Math.sin(a) };
          for (const anchor of anchors) {
            const candRect = estimateLabelRect(pos, anchor, chars, fontSize);
            if (rectIsFree(candRect)) {
              found = { pos, anchor };
              break;
            }
          }
        }
      }
      if (!found) {
        // Stage 2: fresh band below everything — always free by
        // construction (nothing occupies it yet).
        const m2 = 4 * unitsPerPx;
        H += fontSize * 1.5 + 2 * m2;
        const bandBaseline = H - m2 - 0.4 * fontSize;
        const rectW = chars * 0.62 * fontSize;
        if (rectW <= W - 2 * m2) {
          found = { pos: { x: m2, y: bandBaseline }, anchor: 'start' };
        } else {
          found = { pos: { x: W / 2, y: bandBaseline }, anchor: 'middle' };
        }
      }
      best = found;
      rect = estimateLabelRect(best.pos, best.anchor, chars, fontSize);
    }
    occupied.push(rect);
    return best;
  };

  // --- Pick 1: pipe labels (ascending). Below the elbow preferred, above
  // as the alternate side; the scorer moves a tight PN to the free side
  // instead of letting it overlap its neighbour (H3 final integration).
  for (const p of pipes) {
    if (!p.labelPos) continue;
    const chars = 8 + String(p.pipeNumber).length;
    const chosen = pick(
      [
        { pos: { x: p.elbow.x - 8 * unitsPerPx, y: p.elbow.y + 16 * unitsPerPx }, anchor: 'end' },
        { pos: { x: p.elbow.x - 8 * unitsPerPx, y: p.elbow.y - 10 * unitsPerPx }, anchor: 'end' },
      ],
      chars,
    );
    p.labelPos = chosen.pos;
    p.labelAnchor = chosen.anchor;
  }

  // --- Pick 2: Di label. Below the dimension line preferred; above,
  // further below and past either end as alternates.
  const diMidX = (dimInitial.from.x + dimInitial.to.x) / 2;
  const diPick = pick(
    [
      { pos: { x: diMidX, y: dimInitial.from.y + (fontPx + 6) * unitsPerPx }, anchor: 'middle' },
      { pos: { x: diMidX, y: dimInitial.from.y - 10 * unitsPerPx }, anchor: 'middle' },
      { pos: { x: diMidX, y: dimInitial.from.y + (fontPx * 2.2 + 6) * unitsPerPx }, anchor: 'middle' },
      { pos: { x: dimInitial.from.x - 8 * unitsPerPx, y: dimInitial.from.y + fontSize * 0.35 }, anchor: 'end' },
      { pos: { x: dimInitial.to.x + 8 * unitsPerPx, y: dimInitial.from.y + fontSize * 0.35 }, anchor: 'start' },
    ],
    dimLabelChars(dimInitial.valueMm),
  );
  dimInitial.labelPos = diPick.pos;
  dimInitial.labelAnchor = diPick.anchor;

  // Angle label candidates: radial offsets around the arc mid-direction
  // (the pipe bundle rises to one side of the arc, so alternates matter).
  const angleRadius = arc.radiusMm + 30 * unitsPerPx;
  const angleAt = (deg: number, radius: number): PipeCombScreenPoint => ({
    x: X(arc.center.x + radius * Math.cos((deg * Math.PI) / 180)),
    y: Y(arc.center.y + radius * Math.sin((deg * Math.PI) / 180)),
  });
  const angleCandidates: LabelCandidate[] = [
    { pos: angleAt(midDeg, angleRadius), anchor: 'middle' },
    { pos: angleAt(midDeg + 14, angleRadius), anchor: 'middle' },
    { pos: angleAt(midDeg - 14, angleRadius), anchor: 'middle' },
    { pos: angleAt(midDeg + 14, angleRadius + 24 * unitsPerPx), anchor: 'middle' },
  ];
  const angleChars = 9 + String(solution.elbowAngleDeg).length;
  const anglePick = pick(angleCandidates, angleChars);
  const angleLabelPos = anglePick.pos;
  const angleLabelAnchor = anglePick.anchor;

  // A label candidates: beside the line mid (both sides) and clear of
  // either end of the line. The vertical order of the ends swaps with the
  // sign of A, so candidates are expressed against the TOP/BOTTOM end
  // rather than from/to (a "beyond to" guess landed on the pipe labels
  // for negative A).
  const aMid = { x: (staggerFrom.x + staggerTo.x) / 2, y: (staggerFrom.y + staggerTo.y) / 2 };
  const aLineX = staggerFrom.x;
  const aTopY = Math.min(staggerFrom.y, staggerTo.y);
  const aBottomY = Math.max(staggerFrom.y, staggerTo.y);
  const aCandidates: LabelCandidate[] = staggerVisible
    ? [
        { pos: { x: aLineX + 8 * unitsPerPx, y: aMid.y + fontSize * 0.35 }, anchor: 'start' },
        { pos: { x: aLineX - 8 * unitsPerPx, y: aMid.y + fontSize * 0.35 }, anchor: 'end' },
        { pos: { x: aLineX + 8 * unitsPerPx, y: aTopY - 10 * unitsPerPx }, anchor: 'start' },
        { pos: { x: aLineX - 8 * unitsPerPx, y: aTopY - 10 * unitsPerPx }, anchor: 'end' },
        { pos: { x: aLineX + 8 * unitsPerPx, y: aTopY - 26 * unitsPerPx }, anchor: 'start' },
        { pos: { x: aLineX + 8 * unitsPerPx, y: aBottomY + 26 * unitsPerPx }, anchor: 'start' },
      ]
    : [];
  const aChars = dimLabelChars(vm.dimStagger.valueMm);
  // Aligned (A=0): no dimension line is drawn, but the "A 0" annotation
  // still goes through the same collision-safe pick around elbow 2 (H3
  // final integration — previously a fixed position that could overlap).
  const aPick = staggerVisible
    ? pick(aCandidates, aChars)
    : pick(
        [
          { pos: { x: pipes[1].elbow.x + 10 * unitsPerPx, y: pipes[1].elbow.y - 8 * unitsPerPx }, anchor: 'start' },
          { pos: { x: pipes[1].elbow.x + 10 * unitsPerPx, y: pipes[1].elbow.y + 20 * unitsPerPx }, anchor: 'start' },
          {
            pos: { x: (pipes[0].elbow.x + pipes[1].elbow.x) / 2, y: pipes[0].elbow.y - 24 * unitsPerPx },
            anchor: 'middle',
          },
          { pos: { x: pipes[1].elbow.x - 10 * unitsPerPx, y: pipes[1].elbow.y - 8 * unitsPerPx }, anchor: 'end' },
        ],
        aChars,
      );

  // Df label candidates: beside the line mid along v (both sides), then
  // past either end of the line along n.
  const thetaRadLayout = (solution.elbowAngleDeg * Math.PI) / 180;
  const vScreen = { x: Math.sin(thetaRadLayout), y: -Math.cos(thetaRadLayout) };
  const nScreen = { x: Math.cos(thetaRadLayout), y: Math.sin(thetaRadLayout) };
  const dfMid = { x: (finalFrom.x + finalTo.x) / 2, y: (finalFrom.y + finalTo.y) / 2 };
  const dfCandidates: LabelCandidate[] = [
    {
      pos: {
        x: dfMid.x + vScreen.x * fontPx * 1.4 * unitsPerPx,
        y: dfMid.y + vScreen.y * fontPx * 1.4 * unitsPerPx + fontSize * 0.35,
      },
      anchor: 'middle',
    },
    {
      pos: {
        x: dfMid.x - vScreen.x * fontPx * 1.4 * unitsPerPx,
        y: dfMid.y - vScreen.y * fontPx * 1.4 * unitsPerPx + fontSize * 0.35,
      },
      anchor: 'middle',
    },
    { pos: { x: finalTo.x + nScreen.x * 8 * unitsPerPx, y: finalTo.y + nScreen.y * 8 * unitsPerPx }, anchor: 'start' },
    { pos: { x: finalFrom.x - nScreen.x * 8 * unitsPerPx, y: finalFrom.y - nScreen.y * 8 * unitsPerPx }, anchor: 'end' },
    {
      pos: {
        x: dfMid.x + vScreen.x * fontPx * 2.6 * unitsPerPx,
        y: dfMid.y + vScreen.y * fontPx * 2.6 * unitsPerPx + fontSize * 0.35,
      },
      anchor: 'middle',
    },
    {
      pos: {
        x: dfMid.x - vScreen.x * fontPx * 2.6 * unitsPerPx,
        y: dfMid.y - vScreen.y * fontPx * 2.6 * unitsPerPx + fontSize * 0.35,
      },
      anchor: 'middle',
    },
  ];
  const dfPick = pick(dfCandidates, dimLabelChars(vm.dimFinal.valueMm));

  const dimFinal: PipeCombScreenDimension = {
    from: finalFrom,
    to: finalTo,
    labelPos: dfPick.pos,
    labelAnchor: dfPick.anchor,
    valueMm: vm.dimFinal.valueMm,
  };
  const dimStagger: PipeCombScreenDimension & { visible: boolean } = {
    from: staggerFrom,
    to: staggerTo,
    labelPos: aPick.pos,
    labelAnchor: aPick.anchor,
    valueMm: vm.dimStagger.valueMm,
    visible: staggerVisible,
  };

  return {
    viewBox: { x: 0, y: 0, w: W, h: H },
    fontPx,
    fontSize,
    unitsPerPx,
    tick,
    pipes,
    dimInitial,
    dimFinal,
    dimStagger,
    angleArcPath,
    angleLabelPos,
    angleLabelAnchor,
    labelRects: {
      initial: estimateLabelRect(dimInitial.labelPos, dimInitial.labelAnchor, dimLabelChars(dimInitial.valueMm), fontSize),
      final: estimateLabelRect(dimFinal.labelPos, dimFinal.labelAnchor, dimLabelChars(dimFinal.valueMm), fontSize),
      stagger: estimateLabelRect(dimStagger.labelPos, dimStagger.labelAnchor, aChars, fontSize),
      angle: estimateLabelRect(angleLabelPos, angleLabelAnchor, angleChars, fontSize),
      pipeLabels: pipes
        .filter((p) => p.labelPos)
        .map((p) => estimateLabelRect(p.labelPos as PipeCombScreenPoint, p.labelAnchor, 8 + String(p.pipeNumber).length, fontSize)),
    },
  };
}
