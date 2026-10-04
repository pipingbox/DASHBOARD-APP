/* ───────────────────────────────────────────────────────────────────────────
   CODO→TUBO — ELBOW MARKING PREVIEW. Screen preview, U5.3.

   WHAT THIS IS. A marking chart read BY COORDINATES: for every station around
   the elbow, how far along the elbow surface the cut runs. Horizontal axis =
   station.arcPositionMm, the developed position around the elbow OD. Vertical
   axis = station.arcLengthMm, the arc measured along the meridian from the
   t = 0 reference. A secondary trace shows station.bendAngleDeg.

   WHAT THIS IS NOT. The elbow is a torus: it has no isometric flat development,
   so this chart is NOT a flat 1:1 cut template and must never be presented as
   one. The physical output for this family is a MARKING GUIDE by coordinates,
   planned for U5.4 — never a false flat 1:1 elbow template.

   NO GEOMETRY HERE. arcPositionMm, arcLengthMm, arcRadiusMm, bendAngleDeg and
   clampedAtElbowEnd come verbatim from elbowOnPipeGeometry.ts (U5.1). The only
   derived trace is the 90° end-face reference arcRadiusMm · π/2, which is the
   full quarter bend of the kernel's own meridional radius; the kernel's clamped
   stations land exactly on it, which is what makes the plateau readable.

   SCREEN PREVIEW ONLY — responsive, never a 1:1 fabrication template.
   ─────────────────────────────────────────────────────────────────────────── */

import type { ElbowOnPipeResult } from './elbowOnPipeGeometry';
import { affine, ELBOW_SVG, exactMm, labelStride, padDomain, px, responsiveSvg, svgText, type AffineScale } from './branchOnElbowSvgUtils.ts';

export interface ElbowOnPipeMarkingLabels {
  title: string;
  /** Explicit statement that a toroidal elbow has no exact flat development. */
  note: string;
  arcAxis: string;
  lengthAxis: string;
  angleAxis: string;
  limitLabel: string;
  closureLabel: string;
  clampedLegend: string;
  screenPreviewNote: string;
}

export interface ElbowOnPipeMarkingOptions {
  viewBoxWidth?: number;
  viewBoxHeight?: number;
  /** External positioning dimension, echoed as text only. Never geometry. */
  yPrimeMm?: number | null;
}

export interface ElbowOnPipeMarkingResult {
  svg: string;
  /** mm → px transform of the developed position around the elbow OD. */
  scaleArc: AffineScale;
  /** mm → px transform of the arc length along the meridian. */
  scaleLength: AffineScale;
  /** degrees → px transform of the secondary bend-angle trace. */
  scaleAngle: AffineScale;
  minArcLengthMm: number;
  maxArcLengthMm: number;
  clampedCount: number;
}

/** Full quarter bend of a kernel meridional radius: the 90° end-face limit. */
function endFaceLimit(arcRadiusMm: number): number {
  return arcRadiusMm * Math.PI / 2;
}

export function buildElbowOnPipeMarking(
  result: ElbowOnPipeResult,
  labels: ElbowOnPipeMarkingLabels,
  options: ElbowOnPipeMarkingOptions = {},
): ElbowOnPipeMarkingResult | null {
  if (!result.valid || result.stations.length < 2) return null;
  const W = options.viewBoxWidth ?? 680;
  const H = options.viewBoxHeight ?? 440;
  const left = 58;
  const right = 46;
  const top = 46;
  const plotW = W - left - right;
  const plotH = H - top - 78;

  const stations = result.stations;
  const divisions = result.divisions;
  const lengths = stations.map(station => station.arcLengthMm);
  const limits = stations.map(station => endFaceLimit(station.arcRadiusMm));
  const minArcLengthMm = Math.min(...lengths);
  const maxArcLengthMm = Math.max(...lengths);
  /* The vertical domain follows the CUT, not the limit. The 90° reference runs
     far above the cut on the extrados side, so including all of it would squash
     the data the shop actually measures into a fifth of the panel. Only the
     lowest point of the limit is admitted, which is exactly the neighbourhood
     where the cut reaches the end face; the rest of the reference is clipped. */
  const [yMin, yMax] = padDomain(minArcLengthMm, Math.max(maxArcLengthMm, Math.min(...limits)), 0.1);

  const scaleArc = affine(0, result.circumferenceMm, left, plotW, 1);
  const scaleLength = affine(yMin, yMax, top + plotH, plotH, -1);
  /* Secondary axis: the bend angle always lives in [0°, 90°] by construction of
     the finite elbow, so a fixed range keeps the trace comparable across cases. */
  const scaleAngle = affine(0, 90, top + plotH, plotH, -1);

  const stride = labelStride(stations.length);
  /* A stable id is enough: a panel renders one marking preview at a time. */
  const clipId = 'elbow-on-pipe-marking-plot';
  const parts: string[] = [];

  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${ELBOW_SVG.background}"/>`);
  parts.push(`<defs><clipPath id="${clipId}"><rect x="${px(left)}" y="${px(top)}" width="${px(plotW)}" height="${px(plotH)}"/></clipPath></defs>`);
  parts.push(`<rect x="${px(left)}" y="${px(top)}" width="${px(plotW)}" height="${px(plotH)}" fill="${ELBOW_SVG.panel}" stroke="${ELBOW_SVG.grid}" stroke-width="1"/>`);
  parts.push(svgText(left, top - 24, labels.title, { size: 11, fill: ELBOW_SVG.text, weight: 'bold' }));
  parts.push(svgText(W - right, top - 24, labels.screenPreviewNote, { size: 9, fill: ELBOW_SVG.faint, anchor: 'end' }));
  parts.push(svgText(left, top - 10, labels.note, { size: 8.5, fill: ELBOW_SVG.faint }));

  /* ── Station guide lines: one per kernel station, never thinned ── */
  for (const station of stations) {
    const x = scaleArc.map(station.arcPositionMm);
    parts.push(`<line x1="${px(x)}" y1="${px(top)}" x2="${px(x)}" y2="${px(top + plotH)}" stroke="${ELBOW_SVG.gridSoft}" stroke-width="0.6" data-station-line="${station.index}"/>`);
  }

  /* ── Secondary axis ticks for the bend angle ── */
  for (const degrees of [0, 45, 90]) {
    const y = scaleAngle.map(degrees);
    parts.push(`<line x1="${px(left + plotW)}" y1="${px(y)}" x2="${px(left + plotW + 5)}" y2="${px(y)}" stroke="${ELBOW_SVG.axis}" stroke-width="0.8"/>`);
    parts.push(svgText(left + plotW + 8, y + 3, `${degrees}°`, { size: 8, fill: ELBOW_SVG.faint }));
  }

  /* ── 90° end-face reference: the full quarter bend of each station radius ── */
  const limitPolyline = stations
    .map(station => `${px(scaleArc.map(station.arcPositionMm))},${px(scaleLength.map(endFaceLimit(station.arcRadiusMm)))}`)
    .join(' ');
  parts.push(`<polyline points="${limitPolyline}" fill="none" stroke="${ELBOW_SVG.closure}" stroke-width="1.1"`
    + ` stroke-dasharray="7,4" clip-path="url(#${clipId})" data-limit-curve="elbow-end-face"/>`);

  /* ── Secondary trace: bend angle t per station ── */
  const anglePolyline = stations
    .map(station => `${px(scaleArc.map(station.arcPositionMm))},${px(scaleAngle.map(station.bendAngleDeg))}`)
    .join(' ');
  parts.push(`<polyline points="${anglePolyline}" fill="none" stroke="${ELBOW_SVG.datum}" stroke-width="1.1"`
    + ` stroke-opacity="0.75" clip-path="url(#${clipId})" data-angle-curve="bend-angle"/>`);

  /* ── Primary trace: arc length along the meridian ── */
  const cutPolyline = stations
    .map(station => `${px(scaleArc.map(station.arcPositionMm))},${px(scaleLength.map(station.arcLengthMm))}`)
    .join(' ');
  parts.push(`<polyline points="${cutPolyline}" fill="none" stroke="${ELBOW_SVG.curve}" stroke-width="2"`
    + ` stroke-linejoin="round" data-cut-curve="kernel-stations"/>`);

  /* ── Station markers. Clamped stations are diamonds on the limit trace. ── */
  let clampedCount = 0;
  for (const station of stations) {
    const x = scaleArc.map(station.arcPositionMm);
    const y = scaleLength.map(station.arcLengthMm);
    const isClosure = station.index === divisions;
    if (station.clampedAtElbowEnd && !isClosure) clampedCount += 1;
    const shared = `data-station="${station.index}" data-station-kind="${isClosure ? 'closure' : 'physical'}"`
      + ` data-arc-mm="${exactMm(station.arcPositionMm)}" data-arc-length-mm="${exactMm(station.arcLengthMm)}"`
      + ` data-arc-radius-mm="${exactMm(station.arcRadiusMm)}" data-bend-angle-deg="${exactMm(station.bendAngleDeg)}"`
      + ` data-clamped="${station.clampedAtElbowEnd}"`;
    if (station.clampedAtElbowEnd) {
      parts.push(`<polygon points="${px(x)},${px(y - 4.4)} ${px(x + 4.4)},${px(y)} ${px(x)},${px(y + 4.4)} ${px(x - 4.4)},${px(y)}"`
        + ` fill="${ELBOW_SVG.closure}" stroke="${ELBOW_SVG.background}" stroke-width="0.6" ${shared}/>`);
    } else {
      parts.push(`<circle cx="${px(x)}" cy="${px(y)}" r="${isClosure ? 3.4 : 2.6}"`
        + ` fill="${isClosure ? ELBOW_SVG.closure : ELBOW_SVG.marker}" ${shared}/>`);
    }
    /* Text is thinned, and dropped where the closure caption would overlap it.
       The caption length drives the reserved width so it holds in every locale.
       Geometry points are never dropped. */
    if (station.index % stride === 0 && !isClosure && x < left + plotW - 8 - labels.closureLabel.length * 4.8) {
      parts.push(svgText(x, top + plotH + 14, `P${station.index + 1}`, { size: 8, fill: ELBOW_SVG.muted, anchor: 'middle' }));
    }
  }
  parts.push(svgText(left + plotW, top + plotH + 14, labels.closureLabel, { size: 8, fill: ELBOW_SVG.closure, anchor: 'end' }));

  /* ── Axis captions and the arc-length range, verbatim kernel millimetres ── */
  parts.push(svgText(left + plotW / 2, H - 42, labels.arcAxis, { size: 9, anchor: 'middle' }));
  parts.push(svgText(left - 8, top + plotH / 2, labels.lengthAxis, { size: 9, anchor: 'middle', rotate: -90 }));
  parts.push(svgText(W - right + 26, top + plotH / 2, labels.angleAxis, { size: 9, anchor: 'middle', rotate: -90, fill: ELBOW_SVG.datum }));
  parts.push(svgText(left, H - 26, `${minArcLengthMm.toFixed(2)} … ${maxArcLengthMm.toFixed(2)} mm`, { size: 10, fill: ELBOW_SVG.text }));
  parts.push(svgText(left, H - 12, `${labels.limitLabel} · ${labels.clampedLegend} ${clampedCount}/${divisions}`, { size: 9, fill: ELBOW_SVG.closure }));

  const yPrime = options.yPrimeMm;
  const hasYPrime = yPrime !== null && yPrime !== undefined && Number.isFinite(yPrime);
  if (hasYPrime) {
    parts.push(svgText(W - right, H - 12, `Y′ ${(yPrime as number).toFixed(2)} mm`, { size: 9, fill: ELBOW_SVG.muted, anchor: 'end' }));
  }

  const svg = responsiveSvg(W, H, parts.join(''), {
    'data-preview': 'elbow-on-pipe-marking',
    'data-station-count': String(stations.length),
    'data-clamped-count': String(clampedCount),
    'data-circumference-mm': exactMm(result.circumferenceMm),
    'data-station-spacing-mm': exactMm(result.stationSpacingMm),
    'data-flat-development': 'false',
    ...(hasYPrime ? { 'data-external-cota-y-mm': exactMm(yPrime as number) } : {}),
  });
  return { svg, scaleArc, scaleLength, scaleAngle, minArcLengthMm, maxArcLengthMm, clampedCount };
}
