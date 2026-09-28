/* ───────────────────────────────────────────────────────────────────────────
   Physical 1:1 branch template generator (H-001 / I5, PO D3).

   Produces a deterministic vector SVG whose user unit is 1 mm. The useful
   development width is the physical circumference (e.g. π × 88.9 = 279.287 mm
   for the 3" reference). Never scale-to-fit: if the development exceeds the
   usable page width it is TILED with fixed additive overlap, page numbers and
   registration marks. The overlap is extra paper; it never alters the useful
   geometry.

   Coordinates come exclusively from the canonical BranchIntersectionResult
   (same numbers as the marking table — table = development = print).
   ─────────────────────────────────────────────────────────────────────────── */

import type { BranchIntersectionResult } from './branchIntersectionGeometry';

export type TemplateOrdinate = 'relative' | 'fromEnd';

export interface BranchTemplateMeta {
  headerLabel: string;
  branchLabel: string;
  betaDeg: number;
  /** Localized labels (generated in the active UI locale). */
  titleLabel: string;
  seamLabel: string;
  pageLabel: string;
  overlapLabel: string;
  wrapNoteLabel: string;
  calibrationNote: string;
  /** Literal required instruction; kept in English on purpose. */
  printAtActualSize: string;
  generatedLabel: string;
}

export interface BranchTemplateOptions {
  /** Usable printable width inside margins — mm. Default 277 (A4 landscape, 10 mm margins). */
  usableWidthMm?: number;
  /** Usable printable height — mm. Default 190. */
  usableHeightMm?: number;
  /** Fixed additive overlap between tiles — mm. Default 15. */
  overlapMm?: number;
  /** Which ordinate the template shows. */
  ordinate: TemplateOrdinate;
  meta: BranchTemplateMeta;
}

export interface TemplateTile {
  pageIndex: number;
  pageCount: number;
  /** mm on the development where this tile starts (before overlap). */
  originX: number;
  widthMm: number;
  heightMm: number;
  svg: string;
}

export interface BranchTemplateResult {
  tiles: TemplateTile[];
  tiled: boolean;
  /** True when the ordinate range + margins does not fit the usable height (V1 limitation, reported to UI). */
  exceedsUsableHeight: boolean;
  circumferenceMm: number;
  ordinateRangeMm: number;
}

const MARGIN_LEFT = 10;
const MARGIN_RIGHT = 10;
const MARGIN_TOP = 32;
const MARGIN_BOTTOM = 34;

/** Canonical template coordinates: (x, y) in mm for station i. Shared by SVG and tests. */
export function templatePoint(result: BranchIntersectionResult, index: number, ordinate: TemplateOrdinate): [number, number] {
  const st = result.stations[index];
  const y = ordinate === 'fromEnd' ? (st.markFromEnd ?? 0) : st.relativeOrdinate;
  return [st.arcPosition, y];
}

const fmt = (v: number) => Number(v.toFixed(3));

export function buildBranchTemplate(
  result: BranchIntersectionResult,
  options: BranchTemplateOptions,
): BranchTemplateResult {
  const usableW = options.usableWidthMm ?? 277;
  const usableH = options.usableHeightMm ?? 190;
  const overlap = options.overlapMm ?? 15;
  const { meta } = options;

  const C = result.developedCircumference;
  const ys = result.stations.map((_, i) => templatePoint(result, i, options.ordinate)[1]);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const range = yMax - yMin;

  const contentW = C + MARGIN_LEFT + MARGIN_RIGHT;
  const contentH = range + MARGIN_TOP + MARGIN_BOTTOM;
  const exceedsUsableHeight = contentH > usableH + 1e-9;

  // Tiling: consecutive tiles advance by (usableW − overlap); the overlap is
  // additive paper area, the useful stations keep their absolute coordinates.
  const tileWidth = Math.min(usableW, contentW);
  const step = usableW - overlap;
  const pageCount = contentW <= usableW ? 1 : Math.ceil((contentW - usableW) / step) + 1;

  const tiles: TemplateTile[] = [];
  for (let p = 0; p < pageCount; p++) {
    // originC: content-frame coordinate (development + MARGIN_LEFT) at this tile's left edge.
    const originC = p * step;
    const originX = originC - MARGIN_LEFT; // development coordinate at the left edge (diagnostic)
    const isFirst = p === 0;
    const isLast = p === pageCount - 1;
    const w = isLast ? contentW - originC : tileWidth;
    const h = contentH;

    const X = (arc: number) => fmt(arc + MARGIN_LEFT - originC);
    const Y = (ord: number) => fmt(MARGIN_TOP + (ord - yMin));

    const parts: string[] = [];
    parts.push(`<rect x="0" y="0" width="${fmt(w)}" height="${fmt(h)}" fill="#ffffff" stroke="none"/>`);
    // Cut contour (same coordinates as the marking table).
    const pts = result.stations.map((_, i) => {
      const [ax, ord] = templatePoint(result, i, options.ordinate);
      return `${X(ax)},${Y(ord)}`;
    }).join(' ');
    parts.push(`<polyline points="${pts}" fill="none" stroke="#000000" stroke-width="0.6"/>`);
    // Station lines + numbers + physical arc positions (PO §7: the user must
    // be able to mark the pipe without computing the circumference).
    for (let i = 0; i < result.stations.length; i++) {
      const st = result.stations[i];
      const x = X(st.arcPosition);
      if (st.arcPosition + MARGIN_LEFT < originC - 1e-9 || st.arcPosition + MARGIN_LEFT > originC + w + 1e-9) continue;
      const ord = ys[i];
      const isClosure = i === result.stations.length - 1;
      parts.push(`<line x1="${x}" y1="${Y(ord)}" x2="${x}" y2="${fmt(h - MARGIN_BOTTOM + 6)}" stroke="#888888" stroke-width="0.2" stroke-dasharray="2,1.5"/>`);
      parts.push(`<text x="${x}" y="${fmt(h - MARGIN_BOTTOM + 12)}" font-size="3.2" text-anchor="middle" fill="#000000" font-family="monospace">${isClosure ? '≡1' : i + 1}</text>`);
      parts.push(`<text x="${x}" y="${fmt(h - MARGIN_BOTTOM + 17.5)}" font-size="2.6" text-anchor="middle" fill="#222222" font-family="monospace">${fmt(st.arcPosition)}</text>`);
      parts.push(`<text x="${x}" y="${fmt(h - MARGIN_BOTTOM + 23)}" font-size="2.6" text-anchor="middle" fill="#444444" font-family="monospace">${fmt(st.thetaDeg)}°</text>`);
    }
    // Seam line at development 0 (first tile) and at C (last tile).
    if (isFirst) {
      parts.push(`<line x1="${X(0)}" y1="${fmt(MARGIN_TOP - 6)}" x2="${X(0)}" y2="${fmt(h - MARGIN_BOTTOM)}" stroke="#000000" stroke-width="0.5" stroke-dasharray="5,2"/>`);
      parts.push(`<text x="${X(0) + 2}" y="${fmt(MARGIN_TOP - 8)}" font-size="3" fill="#000000" font-family="monospace">${escapeXml(meta.seamLabel)} 0°</text>`);
    }
    if (isLast && pageCount > 1) {
      parts.push(`<line x1="${X(C)}" y1="${fmt(MARGIN_TOP - 6)}" x2="${X(C)}" y2="${fmt(h - MARGIN_BOTTOM)}" stroke="#000000" stroke-width="0.5" stroke-dasharray="5,2"/>`);
      parts.push(`<text x="${X(C) - 2}" y="${fmt(MARGIN_TOP - 8)}" font-size="3" text-anchor="end" fill="#000000" font-family="monospace">${escapeXml(meta.seamLabel)} 360°</text>`);
    }
    // 100 mm calibration bar (every tile, so every page can be verified).
    const cbY = h - 10;
    parts.push(`<line x1="${MARGIN_LEFT}" y1="${fmt(cbY)}" x2="${MARGIN_LEFT + 100}" y2="${fmt(cbY)}" stroke="#000000" stroke-width="0.5"/>`);
    parts.push(`<line x1="${MARGIN_LEFT}" y1="${fmt(cbY - 2)}" x2="${MARGIN_LEFT}" y2="${fmt(cbY + 2)}" stroke="#000000" stroke-width="0.5"/>`);
    parts.push(`<line x1="${MARGIN_LEFT + 100}" y1="${fmt(cbY - 2)}" x2="${MARGIN_LEFT + 100}" y2="${fmt(cbY + 2)}" stroke="#000000" stroke-width="0.5"/>`);
    parts.push(`<text x="${MARGIN_LEFT + 50}" y="${fmt(cbY - 2.5)}" font-size="3" text-anchor="middle" fill="#000000" font-family="monospace">100 mm</text>`);
    // Title block.
    parts.push(`<text x="${MARGIN_LEFT}" y="8" font-size="3.6" fill="#000000" font-family="monospace">${escapeXml(meta.titleLabel)} — ${escapeXml(meta.headerLabel)} × ${escapeXml(meta.branchLabel)} @ ${fmt(meta.betaDeg)}°</text>`);
    parts.push(`<text x="${MARGIN_LEFT}" y="13" font-size="3" fill="#222222" font-family="monospace">π·OD = ${fmt(C)} mm · N = ${result.resolved.divisions} · Δθ = ${fmt(result.angularStepDeg)}° · Δs = ${fmt(result.stationSpacing)} mm · ${escapeXml(meta.generatedLabel)}</text>`);
    parts.push(`<text x="${MARGIN_LEFT}" y="18" font-size="3.4" font-weight="bold" fill="#000000" font-family="monospace">${escapeXml(meta.printAtActualSize)}</text>`);
    parts.push(`<text x="${MARGIN_LEFT}" y="23" font-size="2.8" fill="#222222" font-family="monospace">${escapeXml(meta.calibrationNote)}</text>`);
    parts.push(`<text x="${MARGIN_LEFT}" y="28" font-size="2.8" fill="#222222" font-family="monospace">${escapeXml(meta.wrapNoteLabel)}</text>`);
    // Page number + overlap/registration marks.
    parts.push(`<text x="${fmt(w - MARGIN_RIGHT)}" y="8" font-size="3.4" text-anchor="end" fill="#000000" font-family="monospace">${escapeXml(meta.pageLabel)} ${p + 1}/${pageCount}</text>`);
    if (!isLast) {
      // Registration crosshair at the centre of this tile's overlap zone (right edge).
      const cx = fmt(usableW - overlap / 2);
      parts.push(`<circle cx="${cx}" cy="${fmt(MARGIN_TOP - 4)}" r="1.5" fill="none" stroke="#000000" stroke-width="0.3"/>`);
      parts.push(`<line x1="${fmt(usableW - overlap / 2 - 2.5)}" y1="${fmt(MARGIN_TOP - 4)}" x2="${fmt(usableW - overlap / 2 + 2.5)}" y2="${fmt(MARGIN_TOP - 4)}" stroke="#000000" stroke-width="0.3"/>`);
      parts.push(`<text x="${fmt(w - MARGIN_RIGHT)}" y="13" font-size="2.8" text-anchor="end" fill="#222222" font-family="monospace">${escapeXml(meta.overlapLabel)} ${fmt(overlap)} mm</text>`);
    }
    if (!isFirst) {
      // Matching crosshair at the centre of the overlap zone (left edge of this tile).
      const cx = fmt(overlap / 2);
      parts.push(`<circle cx="${cx}" cy="${fmt(MARGIN_TOP - 4)}" r="1.5" fill="none" stroke="#000000" stroke-width="0.3"/>`);
      parts.push(`<line x1="${fmt(overlap / 2 - 2.5)}" y1="${fmt(MARGIN_TOP - 4)}" x2="${fmt(overlap / 2 + 2.5)}" y2="${fmt(MARGIN_TOP - 4)}" stroke="#000000" stroke-width="0.3"/>`);
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(w)}mm" height="${fmt(h)}mm" viewBox="0 0 ${fmt(w)} ${fmt(h)}">${parts.join('')}</svg>`;
    tiles.push({ pageIndex: p, pageCount, originX, widthMm: w, heightMm: h, svg });
  }

  return { tiles, tiled: pageCount > 1, exceedsUsableHeight, circumferenceMm: C, ordinateRangeMm: range };
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
