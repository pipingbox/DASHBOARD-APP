/* ───────────────────────────────────────────────────────────────────────────
   TUBO→CODO developed branch-cut (INJERTO) screen preview — pure generator.

   Horizontal axis: developed arc position around the branch circumference
   (station.arcPosition, mm, 0 → π·developmentDiameter).
   Vertical axis:  injerto / cut ordinate (station.cutOrdinate, mm).

   NO GEOMETRY HERE. Both coordinates are taken verbatim from the
   BranchOnElbowResult produced by branchOnElbowGeometry.ts (U1). The curve is
   a polyline through the ACTUAL stations — never an approximated sinusoid,
   which matters because a branch cut on a curved (torus) header is not the
   sinusoidal profile of a straight header.

   Station semantics: indices 0…N-1 are the N physical stations (P1…PN);
   index N is the 360° closure that repeats P1, so the polyline closes exactly.

   SCREEN PREVIEW ONLY — responsive, not a 1:1 fabrication template.
   ─────────────────────────────────────────────────────────────────────────── */

import type { BranchOnElbowResult } from './branchOnElbowGeometry';
import { ELBOW_SVG, affine, exactMm, labelStride, padDomain, px, responsiveSvg, svgText } from './branchOnElbowSvgUtils.ts';
import type { AffineScale } from './branchOnElbowSvgUtils.ts';

export interface BranchOnElbowDevelopmentLabels {
  title: string;
  arcAxis: string;
  injertoAxis: string;
  minLabel: string;
  maxLabel: string;
  closureLabel: string;
  screenPreviewNote: string;
}

export interface BranchOnElbowDevelopmentOptions {
  /** viewBox width — px. Default 760. */
  viewBoxWidth?: number;
  /** viewBox height — px. Default 380. */
  viewBoxHeight?: number;
}

export interface DevelopmentMarker {
  index: number;
  kind: 'physical' | 'closure';
  /** Verbatim U1 station.arcPosition — mm. */
  arcMm: number;
  /** Verbatim U1 station.cutOrdinate — mm. */
  injertoMm: number;
  cx: number;
  cy: number;
}

export interface BranchOnElbowDevelopmentResult {
  svg: string;
  /** Plot rectangle in viewBox px. */
  plot: { left: number; top: number; width: number; height: number };
  /** mm → px transforms actually used (documented, testable, no distortion of mm values). */
  scaleX: AffineScale;
  scaleY: AffineScale;
  markers: DevelopmentMarker[];
  minInjertoMm: number;
  maxInjertoMm: number;
}

export function buildBranchOnElbowDevelopment(
  result: BranchOnElbowResult,
  labels: BranchOnElbowDevelopmentLabels,
  options: BranchOnElbowDevelopmentOptions = {},
): BranchOnElbowDevelopmentResult | null {
  if (!result.valid || result.stations.length < 2) return null;
  const W = options.viewBoxWidth ?? 760;
  const H = options.viewBoxHeight ?? 380;
  const left = 64;
  const top = 34;
  const plotW = W - left - 24;
  const plotH = H - top - 52;

  const ordinates = result.stations.map(station => station.cutOrdinate);
  const minInjertoMm = Math.min(...ordinates);
  const maxInjertoMm = Math.max(...ordinates);
  const [yLow, yHigh] = padDomain(minInjertoMm, maxInjertoMm, 0.08);
  const scaleX = affine(0, result.developedCircumference, left, plotW, 1);
  const scaleY = affine(yLow, yHigh, top + plotH, plotH, -1);

  const divisions = result.stations.length - 1;
  const stride = labelStride(divisions);
  const parts: string[] = [];

  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${ELBOW_SVG.background}"/>`);
  parts.push(`<rect x="${px(left)}" y="${px(top)}" width="${px(plotW)}" height="${px(plotH)}" fill="${ELBOW_SVG.panel}" stroke="${ELBOW_SVG.grid}" stroke-width="1"/>`);
  parts.push(svgText(left, top - 14, labels.title, { size: 11, fill: ELBOW_SVG.text, weight: 'bold' }));
  parts.push(svgText(W - 24, top - 14, labels.screenPreviewNote, { size: 9, fill: ELBOW_SVG.faint, anchor: 'end' }));

  /* ── Horizontal ordinate grid + min/max guides (values straight from U1) ── */
  for (const [value, label, colour] of [
    [minInjertoMm, labels.minLabel, ELBOW_SVG.closure],
    [maxInjertoMm, labels.maxLabel, ELBOW_SVG.curve],
  ] as const) {
    const y = scaleY.map(value);
    parts.push(`<line x1="${px(left)}" y1="${px(y)}" x2="${px(left + plotW)}" y2="${px(y)}" stroke="${colour}" stroke-width="0.8" stroke-dasharray="6,4" opacity="0.55"/>`);
    parts.push(svgText(left - 8, y + 3, `${label} ${value.toFixed(2)}`, { size: 9, fill: colour, anchor: 'end' }));
  }

  /* ── Station guides: every station gets a line; labels are thinned only ── */
  for (const station of result.stations) {
    const isClosure = station.index === divisions;
    const x = scaleX.map(station.arcPosition);
    parts.push(`<line x1="${px(x)}" y1="${px(top)}" x2="${px(x)}" y2="${px(top + plotH)}"`
      + ` stroke="${isClosure ? ELBOW_SVG.closure : ELBOW_SVG.gridSoft}" stroke-width="${isClosure ? 1 : 0.7}"`
      + `${isClosure ? ' stroke-dasharray="4,3"' : ''} data-station-line="${station.index}"/>`);
    if (isClosure) {
      parts.push(svgText(x, top + plotH + 30, labels.closureLabel, { size: 9, fill: ELBOW_SVG.closure, anchor: 'end' }));
    } else if (station.index % stride === 0) {
      parts.push(svgText(x, top + plotH + 15, `P${station.index + 1}`, { size: 9, fill: ELBOW_SVG.muted, anchor: 'middle' }));
    }
  }

  /* ── The cut curve: polyline through the real U1 stations, closing at 360° ── */
  const polyline = result.stations
    .map(station => `${px(scaleX.map(station.arcPosition))},${px(scaleY.map(station.cutOrdinate))}`)
    .join(' ');
  parts.push(`<polyline points="${polyline}" fill="none" stroke="${ELBOW_SVG.curve}" stroke-width="2.2"`
    + ` stroke-linecap="round" stroke-linejoin="round" data-cut-curve="u1-stations"/>`);

  /* ── Station markers carrying their exact U1 millimetre values ── */
  const markers: DevelopmentMarker[] = result.stations.map(station => {
    const kind = station.index === divisions ? 'closure' : 'physical';
    const cx = scaleX.map(station.arcPosition);
    const cy = scaleY.map(station.cutOrdinate);
    parts.push(`<circle cx="${px(cx)}" cy="${px(cy)}" r="${kind === 'closure' ? 3.4 : 2.6}"`
      + ` fill="${kind === 'closure' ? 'none' : ELBOW_SVG.marker}"`
      + ` stroke="${kind === 'closure' ? ELBOW_SVG.closure : 'none'}" stroke-width="${kind === 'closure' ? 1.4 : 0}"`
      + ` data-station="${station.index}" data-station-kind="${kind}"`
      + ` data-arc-mm="${exactMm(station.arcPosition)}" data-injerto-mm="${exactMm(station.cutOrdinate)}"/>`);
    return { index: station.index, kind, arcMm: station.arcPosition, injertoMm: station.cutOrdinate, cx, cy };
  });

  /* ── Axis captions ── */
  parts.push(svgText(left + plotW / 2, H - 8, labels.arcAxis, { size: 10, fill: ELBOW_SVG.text, anchor: 'middle' }));
  parts.push(svgText(14, top + plotH / 2, labels.injertoAxis, { size: 10, fill: ELBOW_SVG.text, anchor: 'middle', rotate: -90 }));
  parts.push(`<line x1="${px(left)}" y1="${px(top + plotH)}" x2="${px(left + plotW)}" y2="${px(top + plotH)}" stroke="${ELBOW_SVG.axis}" stroke-width="1"/>`);

  const svg = responsiveSvg(W, H, parts.join(''), {
    'data-preview': 'branch-on-elbow-development',
    'data-station-count': String(divisions),
    'data-developed-circumference-mm': exactMm(result.developedCircumference),
  });
  return { svg, plot: { left, top, width: plotW, height: plotH }, scaleX, scaleY, markers, minInjertoMm, maxInjertoMm };
}
