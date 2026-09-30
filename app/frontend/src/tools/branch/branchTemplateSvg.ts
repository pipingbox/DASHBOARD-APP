/* ───────────────────────────────────────────────────────────────────────────
   Physical 1:1 branch CUT template generator (H-001 final delta, PO §1–§4;
   PB-BRANCH-PRINT-FORMATS-001: parametric ISO page format;
   PB-BRANCH-CUT-TILING-Y-001: X+Y tiling when the profile also exceeds the
   printable height).

   Page model (landscape, from the shared pdfPageFormat source of truth):
   - Every tile is a FULL page so the printer never rescales content.
   - Safe printable border 5 mm (A4 usable width 287 mm).
   - Internal content pad is 2 mm per side, so the 3" reference development
     (π × 88.9 = 279.288 mm → content 283.288 mm) fits ONE A4 page at 1:1.
   - If the development exceeds the usable width and/or the ordinate profile
     exceeds the vertical curve window it is TILED in X and Y with fixed
     additive overlap (15 mm), global page numbers and registration marks.
     The overlap is extra paper; it never alters the useful geometry.
     Row py covers the ordinate band [py·stepY, py·stepY + usableH] with
     stepY = usableH − overlap; adjacent rows share exactly `overlap` mm.
   - Title block lives at the TOP; the station rows and calibration band are
     anchored to the page BOTTOM, so larger sheets gain ordinate window and
     nothing beside the development widens the required width.

   Coordinates come exclusively from the canonical BranchIntersectionResult
   (same numbers as the marking table — table = development = print).
   Deterministic: no timestamps, no random ids. Station lines carry
   data-station attributes so tests can verify exact physical positions.
   ─────────────────────────────────────────────────────────────────────────── */

import type { BranchIntersectionResult } from './branchIntersectionGeometry';
import { getPdfPageFormat, pdfFormatUsableWidthMm } from './pdfPageFormat.ts';
import type { PdfPageFormatId } from './pdfPageFormat.ts';

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
  /** Physical page format (shared source of truth). Default A4 landscape. */
  format?: PdfPageFormatId;
  /** Explicit usable printable width override — mm. Default: format width − 2 × safe margin. */
  usableWidthMm?: number;
  /** Explicit usable printable height override — mm. Default: the page curve window (BASELINE − CURVE_TOP). */
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
  /** Ordinate (s = ord − yMin) at this tile's bottom curve-window edge (diagnostic, 0 for single-row). */
  originY?: number;
  /** Column/row of this tile in the X+Y grid (diagnostic). */
  pageCol?: number;
  pageRow?: number;
  widthMm: number;
  heightMm: number;
  svg: string;
}

export interface BranchTemplateResult {
  tiles: TemplateTile[];
  tiled: boolean;
  /** True when the ordinate range does not fit one page curve window (the profile is tiled in Y). */
  exceedsUsableHeight: boolean;
  /** Grid dimensions of the X+Y tiling. */
  pagesX: number;
  pagesY: number;
  circumferenceMm: number;
  ordinateRangeMm: number;
}

/* Page geometry (mm) — derived from the selected format. All layout rows
   below are anchored so that A4 reproduces the historical H-001 values
   exactly (byte-identical artifacts). */
const PAD_X = 2;      // internal content pad
const TITLE_ROWS = [9, 15, 21, 27, 32.5, 37.5];
const CURVE_TOP = 48;
const SEAM_TOP = 45;
const MARK_Y = 47.5;
/** Height of the bottom band (station rows + calibration) — mm. */
const BOTTOM_BAND = 60;
/** X position of the vertical-overlap registration marks — mm. */
const MARK_X_LEFT = 14;

/** Canonical template coordinates: (x, y) in mm for station i. Shared by SVG and tests. */
export function templatePoint(result: BranchIntersectionResult, index: number, ordinate: TemplateOrdinate): [number, number] {
  const st = result.stations[index];
  const y = ordinate === 'fromEnd' ? (st.markFromEnd ?? 0) : st.relativeOrdinate;
  return [st.arcPosition, y];
}

const fmt = (v: number) => Number(v.toFixed(3)).toString();

/** Estimated Courier text width in mm (0.6 em advance per glyph). */
const textW = (s: string, fs: number) => s.length * 0.6 * fs;

export function buildBranchTemplate(
  result: BranchIntersectionResult,
  options: BranchTemplateOptions,
): BranchTemplateResult {
  const page = getPdfPageFormat(options.format);
  const PAGE_W = page.widthMm;
  const PAGE_H = page.heightMm;
  const M = page.safeMarginMm;
  const usableW = options.usableWidthMm ?? pdfFormatUsableWidthMm(page);
  const overlap = options.overlapMm ?? 15;
  const { meta } = options;

  /* Bottom-anchored rows (A4: baseline 150, numbers 162, arc 167.5,
     theta 173, calibration 180 — identical to the H-001 artifact). */
  const BASELINE = PAGE_H - BOTTOM_BAND;
  const STATION_ROW_NUM = BASELINE + 12;
  const STATION_ROW_ARC = BASELINE + 17.5;
  const STATION_ROW_THETA = BASELINE + 23;
  const CALIB_Y = BASELINE + 30;
  const RIGHT_X = PAGE_W - 6.5;
  /** Vertical window available for the ordinate on one page. */
  const CURVE_WINDOW = BASELINE - CURVE_TOP;
  const clampLabelX = (x: number, w: number) => Math.min(Math.max(x, M + 1.5 + w / 2), RIGHT_X - w / 2);

  const C = result.developedCircumference;
  const N = result.resolved.divisions;
  const ys = result.stations.map((_, i) => templatePoint(result, i, options.ordinate)[1]);
  const yMin = Math.min(...ys);
  const range = Math.max(...ys) - yMin;

  /* Vertical tiling (PB-BRANCH-CUT-TILING-Y-001): s = ord − yMin is the
     physical ordinate on the template. Row py shows the band
     s ∈ [py·stepY, py·stepY + usableH]; adjacent rows share exactly
     `overlap` mm. Row 0 anchored at the bottom band keeps every
     single-page artifact byte-identical to the H-001 implementation. */
  const usableH = options.usableHeightMm ?? CURVE_WINDOW;
  const contentH = range + 2 * PAD_X;
  const stepY = usableH - overlap;
  const pagesY = contentH <= usableH ? 1 : Math.ceil((contentH - usableH) / stepY) + 1;
  const exceedsUsableHeight = pagesY > 1;

  const contentW = C + 2 * PAD_X;
  const step = usableW - overlap;
  const pagesX = contentW <= usableW ? 1 : Math.ceil((contentW - usableW) / step) + 1;
  const pageCount = pagesX * pagesY;

  // Station-label thinning (PO §3 legibility): the widest row is the arc
  // position; skip labels when they would collide, always keep first/last.
  const spacing = result.stationSpacing;
  const arcLabelW = textW(fmt(C), 2.6);
  const labelStep = Math.max(1, Math.ceil(arcLabelW / (0.95 * spacing)));

  const tiles: TemplateTile[] = [];
  let pageIdx = 0;
  for (let py = 0; py < pagesY; py++) {
   for (let p = 0; p < pagesX; p++) {
    const originC = p * step;                    // content coordinate at the page's left usable edge
    const originX = originC - PAD_X;             // development coordinate (diagnostic)
    const originY = py * stepY;                  // ordinate s at this tile's bottom window edge
    const isFirst = p === 0;
    const isLast = p === pagesX - 1;
    const isFirstY = py === 0;
    const isLastY = py === pagesY - 1;

    // Page mapping: content coordinate cc = arc + PAD_X → page x = M + (cc − originC).
    // Ordinate s = ord − yMin → page y = BASELINE − (s − originY).
    const X = (arc: number) => fmt(arc + PAD_X + M - originC);
    const Yraw = (ord: number) => BASELINE - ((ord - yMin) - originY);
    const Y = (ord: number) => fmt(Yraw(ord));

    const parts: string[] = [];
    parts.push(`<rect x="0" y="0" width="${PAGE_W}" height="${PAGE_H}" fill="#ffffff" stroke="none"/>`);

    /* ── Title block (above the development — PO §1) ── */
    parts.push(text(M + PAD_X, TITLE_ROWS[0], 3.6, meta.titleLabel, 'start', '#000000'));
    parts.push(text(M + PAD_X, TITLE_ROWS[1], 3.0, `${meta.headerLabel} × ${meta.branchLabel} @ ${fmt(meta.betaDeg)}°`, 'start', '#222222'));
    parts.push(text(M + PAD_X, TITLE_ROWS[2], 3.0, `π·OD = ${fmt(C)} mm · N = ${N} · Δθ = ${fmt(result.angularStepDeg)}° · Δs = ${fmt(result.stationSpacing)} mm`, 'start', '#222222'));
    parts.push(text(M + PAD_X, TITLE_ROWS[3], 3.4, meta.printAtActualSize, 'start', '#000000', true));
    parts.push(text(M + PAD_X, TITLE_ROWS[4], 2.7, meta.calibrationNote, 'start', '#222222'));
    parts.push(text(M + PAD_X, TITLE_ROWS[5], 2.7, meta.wrapNoteLabel, 'start', '#222222'));
    parts.push(text(RIGHT_X, TITLE_ROWS[0], 3.4, `${meta.pageLabel} ${pageIdx + 1}/${pageCount}`, 'end', '#000000'));
    if (!isLast || !isLastY) {
      parts.push(text(RIGHT_X, TITLE_ROWS[1], 2.7, `${meta.overlapLabel} ${fmt(overlap)} mm`, 'end', '#222222'));
    }

    /* ── Cut contour (same coordinates as the marking table) ──
       Single polyline when every segment fits the vertical curve window
       (byte-identical to the H-001 artifacts). When a tile shows only a
       vertical band of the profile, each segment is clipped to the window
       [CURVE_TOP, BASELINE] so the contour never leaks into the title
       block or the station/calibration bands (PB-BRANCH-CUT-TILING-Y-001).
       Clipped segments carry data-seg = canonical segment index so tests
       can reconstruct the contour. Geometry is clipped, never scaled. */
    const rawPts: [number, number][] = result.stations.map((_, i) => {
      const [ax, ord] = templatePoint(result, i, options.ordinate);
      return [Number(X(ax)), Yraw(ord)];
    });
    const clippedSegs: string[] = [];
    let allVisible = true;
    for (let i = 0; i < rawPts.length - 1; i++) {
      const [x0, y0] = rawPts[i];
      const [x1, y1] = rawPts[i + 1];
      let t0 = 0;
      let t1 = 1;
      if (y1 !== y0) {
        const tTop = (CURVE_TOP - y0) / (y1 - y0);
        const tBot = (BASELINE - y0) / (y1 - y0);
        t0 = Math.max(t0, Math.min(tTop, tBot));
        t1 = Math.min(t1, Math.max(tTop, tBot));
      } else if (y0 < CURVE_TOP || y0 > BASELINE) {
        t0 = 1; t1 = 0;
      }
      if (t0 >= t1) { allVisible = false; continue; }
      if (t0 !== 0 || t1 !== 1) allVisible = false;
      clippedSegs.push(`<line data-seg="${i}" x1="${fmt(x0 + (x1 - x0) * t0)}" y1="${fmt(y0 + (y1 - y0) * t0)}" x2="${fmt(x0 + (x1 - x0) * t1)}" y2="${fmt(y0 + (y1 - y0) * t1)}" stroke="#000000" stroke-width="0.6"/>`);
    }
    if (allVisible) {
      const pts = result.stations.map((_, i) => {
        const [ax, ord] = templatePoint(result, i, options.ordinate);
        return `${X(ax)},${Y(ord)}`;
      }).join(' ');
      parts.push(`<polyline points="${pts}" fill="none" stroke="#000000" stroke-width="0.6"/>`);
    } else {
      parts.push(clippedSegs.join(''));
    }

    /* ── Station generator lines + labels (below the development) ──
       Generator lines are clamped to the curve window: a station whose
       ordinate lives on another row still gets its X guide on this page
       (alignment across strips) without pretending to be geometry. */
    for (let i = 0; i < result.stations.length; i++) {
      const st = result.stations[i];
      const cc = st.arcPosition + PAD_X;
      if (cc < originC - 1e-9 || cc > originC + usableW + 1e-9) continue;
      const x = X(st.arcPosition);
      const ord = ys[i];
      const y1 = fmt(Math.min(Math.max(Yraw(ord), CURVE_TOP), BASELINE));
      const isClosure = i === result.stations.length - 1;
      parts.push(`<line data-station="${i}" x1="${x}" y1="${y1}" x2="${x}" y2="${fmt(STATION_ROW_NUM - 5)}" stroke="#888888" stroke-width="0.2" stroke-dasharray="2,1.5"/>`);
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

    /* ── Registration marks (tiled pages) at the overlap centres ──
       X marks at the left/right overlap strips; Y marks at the top/bottom
       overlap strips (vertical assembly between rows). */
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
    if (!isLastY) {
      const my = fmt(CURVE_TOP + overlap / 2);
      parts.push(`<circle cx="${MARK_X_LEFT}" cy="${my}" r="1.5" fill="none" stroke="#000000" stroke-width="0.3"/>`);
      parts.push(`<line x1="${MARK_X_LEFT - 2.5}" y1="${my}" x2="${MARK_X_LEFT + 2.5}" y2="${my}" stroke="#000000" stroke-width="0.3"/>`);
    }
    if (!isFirstY) {
      const my = fmt(BASELINE - overlap / 2);
      parts.push(`<circle cx="${MARK_X_LEFT}" cy="${my}" r="1.5" fill="none" stroke="#000000" stroke-width="0.3"/>`);
      parts.push(`<line x1="${MARK_X_LEFT - 2.5}" y1="${my}" x2="${MARK_X_LEFT + 2.5}" y2="${my}" stroke="#000000" stroke-width="0.3"/>`);
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}mm" height="${PAGE_H}mm" viewBox="0 0 ${PAGE_W} ${PAGE_H}">${parts.join('')}</svg>`;
    tiles.push({ pageIndex: pageIdx, pageCount, originX, originY, pageCol: p, pageRow: py, widthMm: PAGE_W, heightMm: PAGE_H, svg });
    pageIdx++;
   }
  }

  return { tiles, tiled: pageCount > 1, exceedsUsableHeight, pagesX, pagesY, circumferenceMm: C, ordinateRangeMm: range };
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
