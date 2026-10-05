/* ───────────────────────────────────────────────────────────────────────────
   CODO→TUBO — PICAJE CONTOUR ON THE RECEIVER PIPE. Screen preview, U5.3.

   Plot plane = the developed outer surface of the receiver, which is a cylinder
   and therefore developable, so the contour keeps its true shape:
     u = station.picajeXMm  arc distance around the receiver from the datum
                            generatrix (Ω vertical line, u = 0)
     v = station.picajeYMm  distance along the receiver axis from the plane that
                            contains the axis of the elbow's t = 0 leg (v = 0)

   NO GEOMETRY HERE. u, v, Cota X′, the seating height and the datum offset are
   taken verbatim from the ElbowOnPipeResult produced by elbowOnPipeGeometry.ts
   (U5.1). One single UNIFORM scale is applied to both axes: the shop reads this
   contour as a shape, so anisotropic stretching is not acceptable.

   STATION ORDER IS PHYSICAL. Stations are plotted in kernel order 0..N−1 and
   the polygon closes itself on station 0, exactly as `data-closes-on` states.
   The Tubero row re-indexing lives only in the reference fixture and must never
   reach product code.

   COTA Y′ IS EXTERNAL. It is accepted only to be echoed as a positioning
   annotation; it takes no part in the domain, the scale or any plotted point.

   SCREEN PREVIEW ONLY — responsive, never a 1:1 fabrication template. The 1:1
   receiver picaje sheet belongs to U5.4.
   ─────────────────────────────────────────────────────────────────────────── */

import type { ElbowOnPipeResult } from './elbowOnPipeGeometry';
import { ELBOW_SVG, exactMm, labelStride, px, responsiveSvg, svgText } from './branchOnElbowSvgUtils.ts';

export interface ElbowOnPipePicajeLabels {
  title: string;
  originLabel: string;
  xAxis: string;
  yAxis: string;
  cotaX: string;
  cotaY: string;
  datum: string;
  closesOn: string;
  clampedLegend: string;
  screenPreviewNote: string;
}

export interface ElbowOnPipePicajeOptions {
  viewBoxWidth?: number;
  viewBoxHeight?: number;
  /** External positioning dimension, echoed as text only. Never geometry. */
  yPrimeMm?: number | null;
}

export interface ElbowOnPipePicajeMarker {
  index: number;
  /** Verbatim kernel station.picajeXMm. */
  picajeXMm: number;
  /** Verbatim kernel station.picajeYMm. */
  picajeYMm: number;
  /** Verbatim kernel station.clampedAtElbowEnd. */
  clamped: boolean;
  cx: number;
  cy: number;
}

export interface ElbowOnPipePicajeResult {
  svg: string;
  /** Uniform px per mm used on both axes. */
  scale: number;
  /** Screen position of Ω (u = 0, v = 0). */
  origin: { x: number; y: number };
  markers: ElbowOnPipePicajeMarker[];
}

export function buildElbowOnPipePicaje(
  result: ElbowOnPipeResult,
  labels: ElbowOnPipePicajeLabels,
  options: ElbowOnPipePicajeOptions = {},
): ElbowOnPipePicajeResult | null {
  if (!result.valid || result.stations.length < 2) return null;
  const W = options.viewBoxWidth ?? 620;
  const H = options.viewBoxHeight ?? 470;
  const left = 46;
  const top = 42;
  const plotW = W - left - 34;
  const plotH = H - top - 74;

  const divisions = result.divisions;
  /* Station N repeats station 0: it is the same physical point, so it is not
     plotted twice. The polygon closes on index 0. */
  const physical = result.stations.slice(0, divisions);

  /* Ω is kept inside the domain so the reference cross stays visible. */
  const us = [0, ...physical.map(station => station.picajeXMm)];
  const vs = [0, ...physical.map(station => station.picajeYMm)];
  const uMin = Math.min(...us);
  const uMax = Math.max(...us);
  const vMin = Math.min(...vs);
  const vMax = Math.max(...vs);
  const uSpan = Math.max(uMax - uMin, 1) * 1.18;
  const vSpan = Math.max(vMax - vMin, 1) * 1.18;
  /* Uniform scale — the picaje outline must not be distorted. */
  const scale = Math.min(plotW / uSpan, plotH / vSpan);
  const originX = left + plotW / 2 - ((uMin + uMax) / 2) * scale;
  const originY = top + plotH / 2 + ((vMin + vMax) / 2) * scale;
  /* Documented uniform transform: screen = Ω ± mm · scale (v axis flipped). */
  const mapU = (mm: number) => originX + mm * scale;
  const mapV = (mm: number) => originY - mm * scale;

  const stride = labelStride(divisions);
  /* Labels are pushed radially outward from the contour centroid so they never
     land on the outline. The centroid is a label-placement device only: it takes
     no part in any plotted coordinate. */
  const labelAnchorU = physical.reduce((sum, station) => sum + station.picajeXMm, 0) / divisions;
  const labelAnchorV = physical.reduce((sum, station) => sum + station.picajeYMm, 0) / divisions;
  const parts: string[] = [];

  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${ELBOW_SVG.background}"/>`);
  parts.push(`<rect x="${px(left)}" y="${px(top)}" width="${px(plotW)}" height="${px(plotH)}" fill="${ELBOW_SVG.panel}" stroke="${ELBOW_SVG.grid}" stroke-width="1"/>`);
  parts.push(svgText(left, top - 19, labels.title, { size: 11, fill: ELBOW_SVG.text, weight: 'bold' }));
  parts.push(svgText(W - 34, top - 19, labels.screenPreviewNote, { size: 9, fill: ELBOW_SVG.faint, anchor: 'end' }));

  /* ── Reference axes through Ω: datum generatrix and the t = 0 leg plane ── */
  parts.push(`<line x1="${px(left)}" y1="${px(originY)}" x2="${px(left + plotW)}" y2="${px(originY)}" stroke="${ELBOW_SVG.axis}" stroke-width="0.9" stroke-dasharray="9,3,2,3" data-axis="u"/>`);
  parts.push(`<line x1="${px(originX)}" y1="${px(top)}" x2="${px(originX)}" y2="${px(top + plotH)}" stroke="${ELBOW_SVG.axis}" stroke-width="0.9" stroke-dasharray="9,3,2,3" data-axis="v"/>`);

  /* ── Hole contour: closed polygon on the N physical kernel stations ── */
  const polygon = physical
    .map(station => `${px(mapU(station.picajeXMm))},${px(mapV(station.picajeYMm))}`)
    .join(' ');
  parts.push(`<polygon points="${polygon}" fill="${ELBOW_SVG.curve}" fill-opacity="0.1"`
    + ` stroke="${ELBOW_SVG.curve}" stroke-width="2" stroke-linejoin="round"`
    + ` data-picaje-contour="kernel-stations" data-contour-points="${divisions}" data-closes-on="0"/>`);

  /* ── Stations. Those sitting on the elbow's 90° end face are drawn as a
        distinct diamond so the physical cut limit is identifiable at a glance;
        the flag itself is the kernel's, nothing is recomputed here. ── */
  const markers: ElbowOnPipePicajeMarker[] = physical.map(station => {
    const cx = mapU(station.picajeXMm);
    const cy = mapV(station.picajeYMm);
    const shared = `data-station="${station.index}" data-station-kind="physical"`
      + ` data-picaje-x-mm="${exactMm(station.picajeXMm)}" data-picaje-y-mm="${exactMm(station.picajeYMm)}"`
      + ` data-clamped="${station.clampedAtElbowEnd}"`;
    if (station.clampedAtElbowEnd) {
      parts.push(`<polygon points="${px(cx)},${px(cy - 4.4)} ${px(cx + 4.4)},${px(cy)} ${px(cx)},${px(cy + 4.4)} ${px(cx - 4.4)},${px(cy)}"`
        + ` fill="${ELBOW_SVG.closure}" stroke="${ELBOW_SVG.background}" stroke-width="0.6" ${shared}/>`);
    } else {
      parts.push(`<circle cx="${px(cx)}" cy="${px(cy)}" r="2.6" fill="${ELBOW_SVG.marker}" ${shared}/>`);
    }
    if (station.index % stride === 0) {
      const du = station.picajeXMm - labelAnchorU;
      const dv = station.picajeYMm - labelAnchorV;
      const norm = Math.hypot(du, dv) || 1;
      parts.push(svgText(cx + (du / norm) * 11, cy - (dv / norm) * 11 + 3, `P${station.index + 1}`,
        { size: 8, fill: ELBOW_SVG.muted, anchor: du >= 0 ? 'start' : 'end' }));
    }
    return {
      index: station.index,
      picajeXMm: station.picajeXMm,
      picajeYMm: station.picajeYMm,
      clamped: station.clampedAtElbowEnd,
      cx, cy,
    };
  });

  /* ── Ω origin cross: datum generatrix × t = 0 leg axis plane ── */
  parts.push(`<line x1="${px(originX - 9)}" y1="${px(originY)}" x2="${px(originX + 9)}" y2="${px(originY)}" stroke="${ELBOW_SVG.datum}" stroke-width="1.4"/>`);
  parts.push(`<line x1="${px(originX)}" y1="${px(originY - 9)}" x2="${px(originX)}" y2="${px(originY + 9)}" stroke="${ELBOW_SVG.datum}" stroke-width="1.4"/>`);
  parts.push(`<circle cx="${px(originX)}" cy="${px(originY)}" r="2" fill="${ELBOW_SVG.datum}" data-origin="omega"/>`);
  /* Only the glyph goes next to the cross: the contour runs across Ω, so the
     full wording would sit on the outline. It is spelled out in the footer. */
  parts.push(svgText(originX + 11, originY + 13, 'Ω', { size: 10, fill: ELBOW_SVG.datum }));

  /* ── Direction arrows: X around the receiver, Y along its axis ── */
  const arrowY = top + plotH + 18;
  parts.push(`<line x1="${px(left + 6)}" y1="${px(arrowY)}" x2="${px(left + 58)}" y2="${px(arrowY)}" stroke="${ELBOW_SVG.muted}" stroke-width="1"/>`);
  parts.push(`<polygon points="${px(left + 58)},${px(arrowY)} ${px(left + 52)},${px(arrowY - 2.6)} ${px(left + 52)},${px(arrowY + 2.6)}" fill="${ELBOW_SVG.muted}"/>`);
  parts.push(svgText(left + 64, arrowY + 3, labels.xAxis, { size: 9 }));
  parts.push(`<line x1="${px(originX)}" y1="${px(top + 30)}" x2="${px(originX)}" y2="${px(top + 6)}" stroke="${ELBOW_SVG.muted}" stroke-width="1"/>`);
  parts.push(`<polygon points="${px(originX)},${px(top + 6)} ${px(originX - 2.6)},${px(top + 12)} ${px(originX + 2.6)},${px(top + 12)}" fill="${ELBOW_SVG.muted}"/>`);
  parts.push(svgText(left - 10, top + plotH / 2, labels.yAxis, { size: 9, anchor: 'middle', rotate: -90 }));

  /* ── Footer: kernel globals, clamp legend and the external Cota Y′ ── */
  const clampedCount = markers.filter(marker => marker.clamped).length;
  parts.push(svgText(left, H - 40, `${labels.datum} · ${labels.originLabel} · ${labels.closesOn}`,
    { size: 9, fill: ELBOW_SVG.faint }));
  parts.push(svgText(left, H - 25, `${labels.cotaX} ${result.cotaXMm.toFixed(2)} mm · e ${result.datumOffsetMm >= 0 ? '+' : ''}${result.datumOffsetMm.toFixed(2)} mm`,
    { size: 10, fill: ELBOW_SVG.text }));
  if (clampedCount > 0) {
    parts.push(`<polygon points="${px(left + 4)},${px(H - 14)} ${px(left + 8.4)},${px(H - 9.6)} ${px(left + 4)},${px(H - 5.2)} ${px(left - 0.4)},${px(H - 9.6)}" fill="${ELBOW_SVG.closure}"/>`);
    parts.push(svgText(left + 14, H - 6, `${labels.clampedLegend} · ${clampedCount}`, { size: 9, fill: ELBOW_SVG.closure }));
  }
  const yPrime = options.yPrimeMm;
  const hasYPrime = yPrime !== null && yPrime !== undefined && Number.isFinite(yPrime);
  if (hasYPrime) {
    parts.push(svgText(W - 34, H - 25, `${labels.cotaY} ${(yPrime as number).toFixed(2)} mm`,
      { size: 10, fill: ELBOW_SVG.muted, anchor: 'end' }));
  }

  const svg = responsiveSvg(W, H, parts.join(''), {
    'data-preview': 'elbow-on-pipe-picaje',
    'data-station-count': String(divisions),
    'data-clamped-count': String(clampedCount),
    'data-cota-x-mm': exactMm(result.cotaXMm),
    'data-seating-height-mm': exactMm(result.seatingHeightMm),
    'data-datum-offset-mm': exactMm(result.datumOffsetMm),
    ...(hasYPrime ? { 'data-external-cota-y-mm': exactMm(yPrime as number) } : {}),
  });
  return { svg, scale, origin: { x: originX, y: originY }, markers };
}
