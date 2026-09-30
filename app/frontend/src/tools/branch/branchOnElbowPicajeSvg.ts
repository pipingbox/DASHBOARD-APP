/* ───────────────────────────────────────────────────────────────────────────
   TUBO→CODO PICAJE (hole marking on the elbow) screen preview — pure generator.

   Plot plane = developed elbow surface around the branch axis reference Ω:
     u = station.picajeX  (mm around the elbow circumference; + toward TOP)
     v = station.picajeY  (mm along the elbow meridian)

   NO GEOMETRY HERE. u/v, Cota X′, Cota Y′ and the datum offset are taken
   verbatim from the BranchOnElbowResult produced by branchOnElbowGeometry.ts
   (U1). A UNIFORM scale is used on both axes so the marked opening keeps its
   true shape — the workshop reads the contour, so anisotropic stretching is
   not acceptable here.

   The contour closes on P1: U1 station N repeats station 0, therefore only the
   N physical stations are emitted as markers and the polygon closes itself.

   The drawing changes with the datum (EJE / BOP / TOP / FE) because the signed
   datum offset shifts ψ₀ inside U1, which changes picajeX/picajeY and Cota X′.

   SCREEN PREVIEW ONLY — responsive, not a 1:1 fabrication template.
   ─────────────────────────────────────────────────────────────────────────── */

import type { BranchOnElbowResult } from './branchOnElbowGeometry';
import { ELBOW_SVG, exactMm, labelStride, px, responsiveSvg, svgText } from './branchOnElbowSvgUtils.ts';

export interface BranchOnElbowPicajeLabels {
  title: string;
  originLabel: string;
  xAxis: string;
  yAxis: string;
  cotaX: string;
  cotaY: string;
  datum: string;
  closesOn: string;
  screenPreviewNote: string;
}

export interface BranchOnElbowPicajeOptions {
  /** viewBox width — px. Default 620. */
  viewBoxWidth?: number;
  /** viewBox height — px. Default 460. */
  viewBoxHeight?: number;
}

export interface PicajeMarker {
  index: number;
  /** Verbatim U1 station.picajeX — mm. */
  picajeXMm: number;
  /** Verbatim U1 station.picajeY — mm. */
  picajeYMm: number;
  cx: number;
  cy: number;
}

export interface BranchOnElbowPicajeResult {
  svg: string;
  /** Uniform px per mm used on both axes. */
  scale: number;
  /** Screen position of Ω (u = 0, v = 0). */
  origin: { x: number; y: number };
  markers: PicajeMarker[];
}

export function buildBranchOnElbowPicaje(
  result: BranchOnElbowResult,
  labels: BranchOnElbowPicajeLabels,
  options: BranchOnElbowPicajeOptions = {},
): BranchOnElbowPicajeResult | null {
  if (!result.valid || result.stations.length < 2) return null;
  const W = options.viewBoxWidth ?? 620;
  const H = options.viewBoxHeight ?? 460;
  const left = 44;
  const top = 40;
  const plotW = W - left - 32;
  const plotH = H - top - 62;

  const divisions = result.stations.length - 1;
  const physical = result.stations.slice(0, divisions);
  /* Ω is always inside the domain so the reference cross stays visible. */
  const us = [0, ...physical.map(station => station.picajeX)];
  const vs = [0, ...physical.map(station => station.picajeY)];
  const uMin = Math.min(...us);
  const uMax = Math.max(...us);
  const vMin = Math.min(...vs);
  const vMax = Math.max(...vs);
  const uSpan = Math.max(uMax - uMin, 1) * 1.16;
  const vSpan = Math.max(vMax - vMin, 1) * 1.16;
  /* Uniform scale — the contour must not be stretched. */
  const scale = Math.min(plotW / uSpan, plotH / vSpan);
  const uCentre = (uMin + uMax) / 2;
  const vCentre = (vMin + vMax) / 2;
  const originX = left + plotW / 2 - uCentre * scale;
  const originY = top + plotH / 2 + vCentre * scale;
  /* Documented uniform transform: screen = Ω ± mm · scale (v axis flipped). */
  const mapU = (mm: number) => originX + mm * scale;
  const mapV = (mm: number) => originY - mm * scale;

  const stride = labelStride(divisions);
  const parts: string[] = [];

  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${ELBOW_SVG.background}"/>`);
  parts.push(`<rect x="${px(left)}" y="${px(top)}" width="${px(plotW)}" height="${px(plotH)}" fill="${ELBOW_SVG.panel}" stroke="${ELBOW_SVG.grid}" stroke-width="1"/>`);
  parts.push(svgText(left, top - 18, labels.title, { size: 11, fill: ELBOW_SVG.text, weight: 'bold' }));
  parts.push(svgText(W - 32, top - 18, labels.screenPreviewNote, { size: 9, fill: ELBOW_SVG.faint, anchor: 'end' }));

  /* ── Reference axes through Ω (the branch axis on the elbow surface) ── */
  parts.push(`<line x1="${px(left)}" y1="${px(originY)}" x2="${px(left + plotW)}" y2="${px(originY)}" stroke="${ELBOW_SVG.axis}" stroke-width="0.9" stroke-dasharray="9,3,2,3" data-axis="u"/>`);
  parts.push(`<line x1="${px(originX)}" y1="${px(top)}" x2="${px(originX)}" y2="${px(top + plotH)}" stroke="${ELBOW_SVG.axis}" stroke-width="0.9" stroke-dasharray="9,3,2,3" data-axis="v"/>`);

  /* ── Hole contour: closed polygon on the N physical U1 stations ── */
  const polygon = physical
    .map(station => `${px(mapU(station.picajeX))},${px(mapV(station.picajeY))}`)
    .join(' ');
  parts.push(`<polygon points="${polygon}" fill="${ELBOW_SVG.curve}" fill-opacity="0.1"`
    + ` stroke="${ELBOW_SVG.curve}" stroke-width="2" stroke-linejoin="round"`
    + ` data-picaje-contour="u1-stations" data-contour-points="${divisions}" data-closes-on="0"/>`);

  /* ── Station markers carrying their exact U1 millimetre coordinates ── */
  const markers: PicajeMarker[] = physical.map(station => {
    const cx = mapU(station.picajeX);
    const cy = mapV(station.picajeY);
    parts.push(`<circle cx="${px(cx)}" cy="${px(cy)}" r="2.6" fill="${ELBOW_SVG.marker}"`
      + ` data-station="${station.index}" data-station-kind="physical"`
      + ` data-picaje-x-mm="${exactMm(station.picajeX)}" data-picaje-y-mm="${exactMm(station.picajeY)}"/>`);
    if (station.index % stride === 0) {
      /* Push the label outward from Ω so it never sits on top of the contour. */
      const outward = station.picajeX >= 0 ? 1 : -1;
      parts.push(svgText(cx + outward * 6, cy - 5, `P${station.index + 1}`,
        { size: 8, fill: ELBOW_SVG.muted, anchor: outward > 0 ? 'start' : 'end' }));
    }
    return { index: station.index, picajeXMm: station.picajeX, picajeYMm: station.picajeY, cx, cy };
  });

  /* ── Ω origin cross ── */
  parts.push(`<line x1="${px(originX - 9)}" y1="${px(originY)}" x2="${px(originX + 9)}" y2="${px(originY)}" stroke="${ELBOW_SVG.datum}" stroke-width="1.4"/>`);
  parts.push(`<line x1="${px(originX)}" y1="${px(originY - 9)}" x2="${px(originX)}" y2="${px(originY + 9)}" stroke="${ELBOW_SVG.datum}" stroke-width="1.4"/>`);
  parts.push(`<circle cx="${px(originX)}" cy="${px(originY)}" r="2" fill="${ELBOW_SVG.datum}" data-origin="omega"/>`);
  parts.push(svgText(originX + 12, originY + 14, labels.originLabel, { size: 9, fill: ELBOW_SVG.datum }));

  /* ── Direction arrows: X around the elbow, Y along the elbow ── */
  const arrowY = top + plotH + 18;
  parts.push(`<line x1="${px(left + 6)}" y1="${px(arrowY)}" x2="${px(left + 58)}" y2="${px(arrowY)}" stroke="${ELBOW_SVG.muted}" stroke-width="1"/>`);
  parts.push(`<polygon points="${px(left + 58)},${px(arrowY)} ${px(left + 52)},${px(arrowY - 2.6)} ${px(left + 52)},${px(arrowY + 2.6)}" fill="${ELBOW_SVG.muted}"/>`);
  parts.push(svgText(left + 64, arrowY + 3, labels.xAxis, { size: 9 }));
  parts.push(`<line x1="${px(originX)}" y1="${px(top + 30)}" x2="${px(originX)}" y2="${px(top + 6)}" stroke="${ELBOW_SVG.muted}" stroke-width="1"/>`);
  parts.push(`<polygon points="${px(originX)},${px(top + 6)} ${px(originX - 2.6)},${px(top + 12)} ${px(originX + 2.6)},${px(top + 12)}" fill="${ELBOW_SVG.muted}"/>`);
  parts.push(svgText(originX - 7, top + 14, labels.yAxis, { size: 9, anchor: 'end' }));

  /* ── Datum / Cota annotations, verbatim U1 globals ── */
  const noteY = H - 26;
  parts.push(svgText(left, noteY, `${labels.datum} · ${labels.closesOn}`, { size: 9, fill: ELBOW_SVG.faint }));
  parts.push(svgText(left, H - 10, `${labels.cotaX} ${result.cotaX.toFixed(2)} mm · ${labels.cotaY} ${result.cotaY.toFixed(2)} mm · e ${result.datumOffsetMm.toFixed(2)} mm`,
    { size: 10, fill: ELBOW_SVG.text }));

  const svg = responsiveSvg(W, H, parts.join(''), {
    'data-preview': 'branch-on-elbow-picaje',
    'data-station-count': String(divisions),
    'data-cota-x-mm': exactMm(result.cotaX),
    'data-cota-y-mm': exactMm(result.cotaY),
    'data-datum-offset-mm': exactMm(result.datumOffsetMm),
  });
  return { svg, scale, origin: { x: originX, y: originY }, markers };
}
