/* ───────────────────────────────────────────────────────────────────────────
   Physical 1:1 branch CUT template generator (H-001 final delta, PO §1–§4).

   A4 landscape page model (297 × 210 mm):
   - Every tile is a FULL A4 page so the printer never rescales content.
   - Safe printable border assumed 5 mm → usable width 287 mm.
   - Internal content pad is 2 mm per side, so the 3" reference development
     (π × 88.9 = 279.288 mm → content 283.288 mm) fits ONE page at true 1:1.
   - If the development exceeds the usable width it is TILED with fixed
     additive overlap (15 mm), page numbers and registration marks. The
     overlap is extra paper; it never alters the useful geometry.
   - Title block, instructions and calibration live ABOVE/BELOW the
     development (PO §1) — nothing beside it widens the required width.

   Coordinates come exclusively from the canonical BranchIntersectionResult
   (same numbers as the marking table — table = development = print).
   Deterministic: no timestamps, no random ids. Station lines carry
   data-station attributes so tests can verify exact physical positions.
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
  /** Usable printable width inside the safe border — mm. Default 287 (A4 landscape, 5 mm printer margin). */
  usableWidthMm?: number;
  /** Usable printable height — mm. Default 200 (A4 landscape, 5 mm printer margin). */
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
  /** mm on the development at this tile's left usable edge (diagnostic). */
  originX: number;
  widthMm: number;
  heightMm: number;
  svg: string;
}

export interface BranchTemplateResult {
  tiles: TemplateTile[];
  tiled: boolean;
  /** True when the ordinate range does not fit the A4 curve window (V1 limitation, reported to UI). */
  exceedsUsableHeight: boolean;
  circumferenceMm: number;
  ordinateRangeMm: number;
}

/* A4 landscape page geometry (mm). */
export const PAGE_W = 297;
export const PAGE_H = 210;
const M = 5;          // safe printable border
const PAD_X = 2;      // internal content pad
const TITLE_ROWS = [9, 15, 21, 27, 32.5, 37.5];
const CURVE_TOP = 48;
const BASELINE = 150; // ordinate zero line on the page
const STATION_ROW_NUM = 162;
const STATION_ROW_ARC = 167.5;
const STATION_ROW_THETA = 173;
const CALIB_Y = 180;
const SEAM_TOP = 45;
const MARK_Y = 47.5;
/** Vertical window available for the ordinate on one A4 page. */
const CURVE_WINDOW = BASELINE - CURVE_TOP;

/** Canonical template coordinates: (x, y) in mm for station i. Shared by SVG and tests. */
export function templatePoint(result: BranchIntersectionResult, index: number, ordinate: TemplateOrdinate): [number, number] {
  const st = result.stations[index];
  const y = ordinate === 'fromEnd' ? (st.markFromEnd ?? 0) : st.relativeOrdinate;
  return [st.arcPosition, y];
}

const fmt = (v: number) => Number(v.toFixed(3)).toString();

/** Estimated Courier text width in mm (0.6 em advance per glyph). */
const textW = (s: string, fs: number) => s.length * 0.6 * fs;

const clampLabelX = (x: number, w: number) => Math.min(Math.max(x, 6.5 + w / 2), 290.5 - w / 2);

export function buildBranchTemplate(
  result: BranchIntersectionResult,
  options: BranchTemplateOptions,
): BranchTemplateResult {
  const usableW = options.usableWidthMm ?? 287;
  const overlap = options.overlapMm ?? 15;
  const { meta } = options;

  const C = result.developedCircumference;
  const N = result.resolved.divisions;
  const ys = result.stations.map((_, i) => templatePoint(result, i, options.ordinate)[1]);
  const yMin = Math.min(...ys);
  const range = Math.max(...ys) - yMin;
  const exceedsUsableHeight = range > CURVE_WINDOW + 1e-9;

  const contentW = C + 2 * PAD_X;
  const step = usableW - overlap;
  const pageCount = contentW <= usableW ? 1 : Math.ceil((contentW - usableW) / step) + 1;

  // Station-label thinning (PO §3 legibility): the widest row is the arc
  // position; skip labels when they would collide, always keep first/last.
  const spacing = result.stationSpacing;
  const arcLabelW = textW(fmt(C), 2.6);
  const labelStep = Math.max(1, Math.ceil(arcLabelW / (0.95 * spacing)));

  const tiles: TemplateTile[] = [];
  for (let p = 0; p < pageCount; p++) {
    const originC = p * step;                    // content coordinate at the page's left usable edge
    const originX = originC - PAD_X;             // development coordinate (diagnostic)
    const isFirst = p === 0;
    const isLast = p === pageCount - 1;

    // Page mapping: content coordinate cc = arc + PAD_X → page x = M + (cc − originC).
    const X = (arc: number) => fmt(arc + PAD_X + M - originC);
    const Y = (ord: number) => fmt(BASELINE - (ord - yMin));

    const parts: string[] = [];
    parts.push(`<rect x="0" y="0" width="${PAGE_W}" height="${PAGE_H}" fill="#ffffff" stroke="none"/>`);

    /* ── Title block (above the development — PO §1) ── */
    parts.push(text(M + PAD_X, TITLE_ROWS[0], 3.6, meta.titleLabel, 'start', '#000000'));
    parts.push(text(M + PAD_X, TITLE_ROWS[1], 3.0, `${meta.headerLabel} × ${meta.branchLabel} @ ${fmt(meta.betaDeg)}°`, 'start', '#222222'));
    parts.push(text(M + PAD_X, TITLE_ROWS[2], 3.0, `π·OD = ${fmt(C)} mm · N = ${N} · Δθ = ${fmt(result.angularStepDeg)}° · Δs = ${fmt(result.stationSpacing)} mm`, 'start', '#222222'));
    parts.push(text(M + PAD_X, TITLE_ROWS[3], 3.4, meta.printAtActualSize, 'start', '#000000', true));
    parts.push(text(M + PAD_X, TITLE_ROWS[4], 2.7, meta.calibrationNote, 'start', '#222222'));
    parts.push(text(M + PAD_X, TITLE_ROWS[5], 2.7, meta.wrapNoteLabel, 'start', '#222222'));
    parts.push(text(290.5, TITLE_ROWS[0], 3.4, `${meta.pageLabel} ${p + 1}/${pageCount}`, 'end', '#000000'));
    if (!isLast) {
      parts.push(text(290.5, TITLE_ROWS[1], 2.7, `${meta.overlapLabel} ${fmt(overlap)} mm`, 'end', '#222222'));
    }

    /* ── Cut contour (same coordinates as the marking table) ── */
    const pts = result.stations.map((_, i) => {
      const [ax, ord] = templatePoint(result, i, options.ordinate);
      return `${X(ax)},${Y(ord)}`;
    }).join(' ');
    parts.push(`<polyline points="${pts}" fill="none" stroke="#000000" stroke-width="0.6"/>`);

    /* ── Station generator lines + labels (below the development) ── */
    for (let i = 0; i < result.stations.length; i++) {
      const st = result.stations[i];
      const cc = st.arcPosition + PAD_X;
      if (cc < originC - 1e-9 || cc > originC + usableW + 1e-9) continue;
      const x = X(st.arcPosition);
      const ord = ys[i];
      const isClosure = i === result.stations.length - 1;
      parts.push(`<line data-station="${i}" x1="${x}" y1="${Y(ord)}" x2="${x}" y2="${fmt(STATION_ROW_NUM - 5)}" stroke="#888888" stroke-width="0.2" stroke-dasharray="2,1.5"/>`);
      // Number row: every station (incl. closure ≡1 — never a false N+1 division).
      const numTxt = isClosure ? '≡1' : String(i + 1);
      parts.push(text(clampLabelX(Number(x), textW(numTxt, 3.2)), STATION_ROW_NUM, 3.2, numTxt, 'middle', '#000000'));
      // Arc position + angle rows: thinned when they would collide; the
      // closure values already appear in the title data row (π·OD, Δθ).
      if (!isClosure && (i % labelStep === 0)) {
        const arcTxt = fmt(st.arcPosition);
        parts.push(text(clampLabelX(Number(x), textW(arcTxt, 2.6)), STATION_ROW_ARC, 2.6, arcTxt, 'middle', '#222222'));
        const thTxt = `${fmt(st.thetaDeg)}°`;
        parts.push(text(clampLabelX(Number(x), textW(thTxt, 2.6)), STATION_ROW_THETA, 2.6, thTxt, 'middle', '#444444'));
      }
    }

    /* ── Seam lines (0° and 360°) ── */
    if (isFirst) {
      parts.push(`<line x1="${X(0)}" y1="${SEAM_TOP}" x2="${X(0)}" y2="${fmt(STATION_ROW_NUM - 5)}" stroke="#000000" stroke-width="0.5" stroke-dasharray="5,2"/>`);
      parts.push(text(Number(X(0)) + 1.5, SEAM_TOP - 2, 3.0, `${meta.seamLabel} 0°`, 'start', '#000000'));
    }
    if (isLast) {
      parts.push(`<line x1="${X(C)}" y1="${SEAM_TOP}" x2="${X(C)}" y2="${fmt(STATION_ROW_NUM - 5)}" stroke="#000000" stroke-width="0.5" stroke-dasharray="5,2"/>`);
      parts.push(text(Number(X(C)) - 1.5, SEAM_TOP - 2, 3.0, `${meta.seamLabel} 360°`, 'end', '#000000'));
    }

    /* ── 100 mm calibration bar (every page, below the development) ── */
    const cbX = M + PAD_X;
    parts.push(`<line x1="${cbX}" y1="${CALIB_Y}" x2="${cbX + 100}" y2="${CALIB_Y}" stroke="#000000" stroke-width="0.5"/>`);
    parts.push(`<line x1="${cbX}" y1="${CALIB_Y - 2}" x2="${cbX}" y2="${CALIB_Y + 2}" stroke="#000000" stroke-width="0.5"/>`);
    parts.push(`<line x1="${cbX + 100}" y1="${CALIB_Y - 2}" x2="${cbX + 100}" y2="${CALIB_Y + 2}" stroke="#000000" stroke-width="0.5"/>`);
    parts.push(text(cbX + 50, CALIB_Y - 2.5, 3.0, '100 mm', 'middle', '#000000'));
    // Generated stamp beside the calibration bar (own row, no collisions).
    parts.push(text(cbX + 105, CALIB_Y + 1.2, 2.5, meta.generatedLabel, 'start', '#444444'));

    /* ── Registration marks (tiled pages) at the overlap centres ── */
    if (!isLast) {
      const cx = fmt(M + usableW - overlap / 2);
      parts.push(`<circle cx="${cx}" cy="${MARK_Y}" r="1.5" fill="none" stroke="#000000" stroke-width="0.3"/>`);
      parts.push(`<line x1="${fmt(M + usableW - overlap / 2 - 2.5)}" y1="${MARK_Y}" x2="${fmt(M + usableW - overlap / 2 + 2.5)}" y2="${MARK_Y}" stroke="#000000" stroke-width="0.3"/>`);
    }
    if (!isFirst) {
      const cx = fmt(M + overlap / 2);
      parts.push(`<circle cx="${cx}" cy="${MARK_Y}" r="1.5" fill="none" stroke="#000000" stroke-width="0.3"/>`);
      parts.push(`<line x1="${fmt(M + overlap / 2 - 2.5)}" y1="${MARK_Y}" x2="${fmt(M + overlap / 2 + 2.5)}" y2="${MARK_Y}" stroke="#000000" stroke-width="0.3"/>`);
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}mm" height="${PAGE_H}mm" viewBox="0 0 ${PAGE_W} ${PAGE_H}">${parts.join('')}</svg>`;
    tiles.push({ pageIndex: p, pageCount, originX, widthMm: PAGE_W, heightMm: PAGE_H, svg });
  }

  return { tiles, tiled: pageCount > 1, exceedsUsableHeight, circumferenceMm: C, ordinateRangeMm: range };
}

/** Text element helper (single source of typography for the artifact). */
function text(x: number, y: number, fs: number, content: string, anchor: 'start' | 'middle' | 'end', fill: string, bold = false): string {
  const anchorAttr = anchor !== 'start' ? ` text-anchor="${anchor}"` : '';
  const boldAttr = bold ? ' font-weight="bold"' : '';
  return `<text x="${fmt(x)}" y="${fmt(y)}" font-size="${fs}"${anchorAttr}${boldAttr} fill="${fill}" font-family="monospace">${escapeXml(content)}</text>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
