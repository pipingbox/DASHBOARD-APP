/* ───────────────────────────────────────────────────────────────────────────
   Physical 1:1 header PICAJE template generator (H-001 final delta, PO §5–§7;
   PB-BRANCH-PRINT-FORMATS-001: parametric ISO page format).

   A physical flat development of the LOCAL header surface around the
   opening, built exclusively from the canonical BranchIntersectionResult
   picaje stations — PICAJE TABLE = SCREEN DIAGRAM = 1:1 TEMPLATE.

     horizontal axis = X = developed circumferential distance on the header
                       (wrap direction; X = 0 is the reference generatrix)
     vertical axis   = Y = axial distance along the header
                       (Y = 0 is the branch-axis plane ring)

   The line represents the NOMINAL opening using the approved branch-ID
   reference (headerHoleReferenceRadius). No bevel, root-gap or cutting
   allowance logic in V1.

   Page model comes from the shared pdfPageFormat source of truth (landscape
   ISO A4–A0): full physical pages, 5 mm safe printable border, 2 mm internal
   pad, additive-overlap tiling in X (and Y for very tall openings), never
   scale-to-fit. Station numbers are P1..PN only — the 360° closure IS P1
   and is never presented as P(N+1).
   ─────────────────────────────────────────────────────────────────────────── */

import type { BranchIntersectionResult } from './branchIntersectionGeometry';
import type { TemplateTile } from './branchTemplateSvg';
import { getPdfPageFormat, pdfFormatUsableWidthMm } from './pdfPageFormat.ts';
import type { PdfPageFormatId } from './pdfPageFormat.ts';

export interface PicajeTemplateMeta {
  /** e.g. '6" Sch 40 (OD 168.3 mm)' */
  headerLabel: string;
  /** e.g. '3" (ID 77.92 mm)' — the approved hole reference */
  branchRefLabel: string;
  betaDeg: number;
  titleLabel: string;
  originLabel: string;
  xAxisLabel: string;
  yAxisLabel: string;
  openingNote: string;
  wrapNote: string;
  calibrationNote: string;
  printAtActualSize: string;
  pageLabel: string;
  overlapLabel: string;
  generatedLabel: string;
}

export interface PicajeTemplateOptions {
  /** Physical page format (shared source of truth). Default A4 landscape. */
  format?: PdfPageFormatId;
  /** Explicit usable printable width override — mm. Default: format width − 2 × safe margin. */
  usableWidthMm?: number;
  /** Explicit usable content height override — mm. Default: content window derived from the page. */
  usableHeightMm?: number;
  /** Fixed additive overlap between tiles — mm. Default 15. */
  overlapMm?: number;
  meta: PicajeTemplateMeta;
}

export interface PicajeTemplateResult {
  tiles: TemplateTile[];
  tiled: boolean;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  /** Total developed width of the opening zone — mm. */
  widthMm: number;
  /** Total axial height of the opening zone — mm. */
  heightMm: number;
}

const PAD = 2;          // internal content pad
const TITLE_ROWS = [9, 15, 21, 27, 32.5, 37.5, 42.5];
const CONTENT_TOP = 50; // content area starts below the title block
/** Bottom band reserved for calibration — mm (A4: calibration at 180). */
const BOTTOM_BAND = 30;
/** Space between the content bottom and the calibration zone — mm. */
const CONTENT_BOTTOM_MARGIN = 40;
const MARK_X_LEFT = 14;

const fmt = (v: number) => Number(v.toFixed(3));
const textW = (s: string, fs: number) => s.length * 0.6 * fs;

export function buildPicajeTemplate(
  result: BranchIntersectionResult,
  options: PicajeTemplateOptions,
): PicajeTemplateResult {
  const page = getPdfPageFormat(options.format);
  const PAGE_W = page.widthMm;
  const PAGE_H = page.heightMm;
  const M = page.safeMarginMm;
  const RIGHT_X = PAGE_W - 6.5;
  const CONTENT_BOTTOM = PAGE_H - CONTENT_BOTTOM_MARGIN; // A4: 170
  const CALIB_Y = PAGE_H - BOTTOM_BAND;                  // A4: 180
  const usableW = options.usableWidthMm ?? pdfFormatUsableWidthMm(page);
  const usableH = options.usableHeightMm ?? (CONTENT_BOTTOM - CONTENT_TOP); // A4: 120
  const overlap = options.overlapMm ?? 15;
  const { meta } = options;

  const st = result.stations;
  const N = result.resolved.divisions;
  const xs = st.map(s => s.picajeX);
  const ys = st.map(s => s.picajeY);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const Wp = xMax - xMin;
  const Hp = yMax - yMin;

  const contentW = Wp + 2 * PAD;
  const contentH = Hp + 2 * PAD;
  const stepX = usableW - overlap;
  const stepY = usableH - overlap;
  const pagesX = contentW <= usableW ? 1 : Math.ceil((contentW - usableW) / stepX) + 1;
  const pagesY = contentH <= usableH ? 1 : Math.ceil((contentH - usableH) / stepY) + 1;
  const pageCount = pagesX * pagesY;

  // Page mapping: data (X, Y) → page. Y grows UP on the page.
  const XP = (X: number, px: number) => M + (X - xMin + PAD - px * stepX);
  const YP = (Y: number, py: number) => CONTENT_TOP + (yMax - Y + PAD - py * stepY);

  // Station label offsets: radially outward from the contour centroid.
  const cx = (xMin + xMax) / 2;
  const cy = (yMin + yMax) / 2;
  const labelPos = (i: number): [number, number] => {
    const dx = st[i].picajeX - cx;
    const dy = st[i].picajeY - cy;
    const len = Math.hypot(dx, dy) || 1;
    return [st[i].picajeX + (dx / len) * 4.2, st[i].picajeY + (dy / len) * 4.2];
  };
  // Label thinning for dense divisions (keep P1 always).
  const labelStep = Math.max(1, Math.ceil(N / 24));

  const tiles: TemplateTile[] = [];
  let pageIdx = 0;
  for (let py = 0; py < pagesY; py++) {
    for (let px = 0; px < pagesX; px++) {
      const isFirstX = px === 0;
      const isLastX = px === pagesX - 1;
      const isFirstY = py === 0;
      const isLastY = py === pagesY - 1;

      const parts: string[] = [];
      parts.push(`<rect x="0" y="0" width="${PAGE_W}" height="${PAGE_H}" fill="#ffffff" stroke="none"/>`);

      /* ── Title block ── */
      parts.push(text(M + PAD, TITLE_ROWS[0], 3.6, meta.titleLabel, 'start', '#000000'));
      parts.push(text(M + PAD, TITLE_ROWS[1], 3.0, `${meta.headerLabel} · ${meta.branchRefLabel} · β = ${fmt(meta.betaDeg)}°`, 'start', '#222222'));
      parts.push(text(M + PAD, TITLE_ROWS[2], 3.0, `X: ${fmt(xMin)}..${fmt(xMax)} mm · Y: ${fmt(yMin)}..${fmt(yMax)} mm · W(X) = ${fmt(Wp)} mm · H(Y) = ${fmt(Hp)} mm`, 'start', '#222222'));
      parts.push(text(M + PAD, TITLE_ROWS[3], 3.4, meta.printAtActualSize, 'start', '#000000', true));
      parts.push(text(M + PAD, TITLE_ROWS[4], 2.7, meta.openingNote, 'start', '#222222'));
      parts.push(text(M + PAD, TITLE_ROWS[5], 2.7, meta.wrapNote, 'start', '#222222'));
      parts.push(text(M + PAD, TITLE_ROWS[6], 2.5, meta.generatedLabel, 'start', '#444444'));
      parts.push(text(RIGHT_X, TITLE_ROWS[0], 3.4, `${meta.pageLabel} ${pageIdx + 1}/${pageCount}`, 'end', '#000000'));
      if (!isLastX) {
        parts.push(text(RIGHT_X, TITLE_ROWS[1], 2.7, `${meta.overlapLabel} ${fmt(overlap)} mm`, 'end', '#222222'));
      }

      /* ── Centerlines: X = 0 (reference generatrix) and Y = 0 (axis plane) ── */
      const x0 = XP(0, px);
      const y0 = YP(0, py);
      if (x0 >= M - 1e-9 && x0 <= M + usableW + 1e-9) {
        parts.push(`<line x1="${fmt(x0)}" y1="${CONTENT_TOP - 2}" x2="${fmt(x0)}" y2="${fmt(CONTENT_BOTTOM + 2)}" stroke="#777777" stroke-width="0.3" stroke-dasharray="8,2,2,2"/>`);
        // Label at the BOTTOM end of the line (the top end hosts station labels).
        parts.push(text(x0 + 1.2, CONTENT_BOTTOM + 3.5, 2.4, 'X = 0', 'start', '#777777'));
      }
      if (y0 >= CONTENT_TOP - 1e-9 && y0 <= CONTENT_BOTTOM + 1e-9) {
        parts.push(`<line x1="${fmt(XP(xMin, px) - 2)}" y1="${fmt(y0)}" x2="${fmt(XP(xMax, px) + 2)}" y2="${fmt(y0)}" stroke="#777777" stroke-width="0.3" stroke-dasharray="8,2,2,2"/>`);
        // Label just below the line, at its right end (away from station P(N/2+1)).
        parts.push(text(XP(xMax, px) + 3, y0 + 4, 2.4, 'Y = 0', 'start', '#777777'));
      }

      /* ── Helper lines at X min/max and Y min/max ── */
      for (const [xv, lab, anchor] of [[xMin, `Xmin = ${fmt(xMin)}`, 'start'], [xMax, `Xmax = ${fmt(xMax)}`, 'end']] as [number, string, 'start' | 'end'][]) {
        const xl = XP(xv, px);
        if (xl >= M && xl <= M + usableW) {
          parts.push(`<line x1="${fmt(xl)}" y1="${fmt(YP(yMax, py))}" x2="${fmt(xl)}" y2="${fmt(YP(yMin, py))}" stroke="#bbbbbb" stroke-width="0.25" stroke-dasharray="3,2"/>`);
          parts.push(text(anchor === 'start' ? xl - 1 : xl + 1, CONTENT_BOTTOM + 6, 2.6, lab, anchor, '#444444'));
        }
      }
      for (const [yv, lab] of [[yMin, `Ymin = ${fmt(yMin)}`], [yMax, `Ymax = ${fmt(yMax)}`]] as [number, string][]) {
        const yl = YP(yv, py);
        if (yl >= CONTENT_TOP && yl <= CONTENT_BOTTOM) {
          parts.push(`<line x1="${fmt(XP(xMin, px))}" y1="${fmt(yl)}" x2="${fmt(XP(xMax, px))}" y2="${fmt(yl)}" stroke="#bbbbbb" stroke-width="0.25" stroke-dasharray="3,2"/>`);
          parts.push(text(XP(xMax, px) + 3, yl - 1, 2.6, lab, 'start', '#444444'));
        }
      }

      /* ── Opening contour (canonical stations; closure repeats station 0) ── */
      const pts = st.map(s => `${fmt(XP(s.picajeX, px))},${fmt(YP(s.picajeY, py))}`).join(' ');
      parts.push(`<polygon points="${pts}" fill="none" stroke="#000000" stroke-width="0.6"/>`);

      /* ── Origin (0,0) ── */
      if (x0 >= M && x0 <= M + usableW && y0 >= CONTENT_TOP && y0 <= CONTENT_BOTTOM) {
        parts.push(`<line x1="${fmt(x0 - 3)}" y1="${fmt(y0)}" x2="${fmt(x0 + 3)}" y2="${fmt(y0)}" stroke="#000000" stroke-width="0.4"/>`);
        parts.push(`<line x1="${fmt(x0)}" y1="${fmt(y0 - 3)}" x2="${fmt(x0)}" y2="${fmt(y0 + 3)}" stroke="#000000" stroke-width="0.4"/>`);
        parts.push(`<circle cx="${fmt(x0)}" cy="${fmt(y0)}" r="1" fill="#000000" stroke="none"/>`);
        parts.push(text(x0 + 2, y0 - 2, 2.8, meta.originLabel, 'start', '#000000'));
      }

      /* ── Stations P1..PN (closure IS P1 — no P(N+1) label) ── */
      for (let i = 0; i < N; i++) {
        const xpi = XP(st[i].picajeX, px);
        const ypi = YP(st[i].picajeY, py);
        if (xpi < M - 1 || xpi > M + usableW + 1 || ypi < CONTENT_TOP - 1 || ypi > CONTENT_BOTTOM + 1) continue;
        const isOne = i === 0;
        parts.push(`<circle cx="${fmt(xpi)}" cy="${fmt(ypi)}" r="${isOne ? 1.3 : 0.8}" fill="none" stroke="#000000" stroke-width="${isOne ? 0.5 : 0.3}"/>`);
        if (i % labelStep === 0) {
          const [lx, ly] = labelPos(i);
          // Clamp inside the printable page (radial offsets can overshoot
          // the left edge for the extreme stations).
          const lxp = Math.min(Math.max(XP(lx, px), M + 1.5), PAGE_W - M - 1.5);
          const lyp = Math.min(Math.max(YP(ly, py), CONTENT_TOP - 6), CONTENT_BOTTOM + 6);
          parts.push(text(lxp, lyp + 0.9, 2.6, `P${i + 1}`, 'middle', '#222222'));
        }
      }

      /* ── Direction arrows: X (wrap) and Y (axial) — bottom band, beside the
         calibration zone, away from the opening contour and station labels ── */
      {
        const axY = CALIB_Y + 6;
        parts.push(`<line x1="115" y1="${axY}" x2="139" y2="${axY}" stroke="#000000" stroke-width="0.4"/>`);
        parts.push(`<polygon points="139,${axY} 136.5,${axY - 1.1} 136.5,${axY + 1.1}" fill="#000000" stroke="none"/>`);
        parts.push(text(142, axY + 0.9, 2.6, `X — ${meta.xAxisLabel}`, 'start', '#000000'));
        parts.push(`<line x1="200" y1="${axY + 5}" x2="200" y2="${axY - 19}" stroke="#000000" stroke-width="0.4"/>`);
        parts.push(`<polygon points="200,${axY - 19} 198.9,${axY - 16.5} 201.1,${axY - 16.5}" fill="#000000" stroke="none"/>`);
        parts.push(text(198, axY - 17, 2.6, `Y — ${meta.yAxisLabel}`, 'end', '#000000'));
      }

      /* ── 100 mm calibration bar ── */
      const cbX = M + PAD;
      parts.push(`<line x1="${cbX}" y1="${CALIB_Y}" x2="${cbX + 100}" y2="${CALIB_Y}" stroke="#000000" stroke-width="0.5"/>`);
      parts.push(`<line x1="${cbX}" y1="${CALIB_Y - 2}" x2="${cbX}" y2="${CALIB_Y + 2}" stroke="#000000" stroke-width="0.5"/>`);
      parts.push(`<line x1="${cbX + 100}" y1="${CALIB_Y - 2}" x2="${cbX + 100}" y2="${CALIB_Y + 2}" stroke="#000000" stroke-width="0.5"/>`);
      parts.push(text(cbX + 50, CALIB_Y - 2.5, 3.0, '100 mm', 'middle', '#000000'));

      /* ── Registration marks (tiled pages) ── */
      if (!isLastX) {
        const mx = fmt(M + usableW - overlap / 2);
        parts.push(`<circle cx="${mx}" cy="${CONTENT_TOP + 4}" r="1.5" fill="none" stroke="#000000" stroke-width="0.3"/>`);
        parts.push(`<line x1="${fmt(M + usableW - overlap / 2 - 2.5)}" y1="${CONTENT_TOP + 4}" x2="${fmt(M + usableW - overlap / 2 + 2.5)}" y2="${CONTENT_TOP + 4}" stroke="#000000" stroke-width="0.3"/>`);
      }
      if (!isFirstX) {
        const mx = fmt(M + overlap / 2);
        parts.push(`<circle cx="${mx}" cy="${CONTENT_TOP + 4}" r="1.5" fill="none" stroke="#000000" stroke-width="0.3"/>`);
        parts.push(`<line x1="${fmt(M + overlap / 2 - 2.5)}" y1="${CONTENT_TOP + 4}" x2="${fmt(M + overlap / 2 + 2.5)}" y2="${CONTENT_TOP + 4}" stroke="#000000" stroke-width="0.3"/>`);
      }
      if (!isLastY) {
        const my = fmt(CONTENT_TOP + usableH - overlap / 2);
        parts.push(`<circle cx="${MARK_X_LEFT}" cy="${my}" r="1.5" fill="none" stroke="#000000" stroke-width="0.3"/>`);
        parts.push(`<line x1="${MARK_X_LEFT - 2.5}" y1="${my}" x2="${MARK_X_LEFT + 2.5}" y2="${my}" stroke="#000000" stroke-width="0.3"/>`);
      }
      if (!isFirstY) {
        const my = fmt(CONTENT_TOP + overlap / 2);
        parts.push(`<circle cx="${MARK_X_LEFT}" cy="${my}" r="1.5" fill="none" stroke="#000000" stroke-width="0.3"/>`);
        parts.push(`<line x1="${MARK_X_LEFT - 2.5}" y1="${my}" x2="${MARK_X_LEFT + 2.5}" y2="${my}" stroke="#000000" stroke-width="0.3"/>`);
      }

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}mm" height="${PAGE_H}mm" viewBox="0 0 ${PAGE_W} ${PAGE_H}">${parts.join('')}</svg>`;
      tiles.push({ pageIndex: pageIdx, pageCount, originX: px * stepX - PAD, widthMm: PAGE_W, heightMm: PAGE_H, svg });
      pageIdx++;
    }
  }

  return { tiles, tiled: pageCount > 1, xMin, xMax, yMin, yMax, widthMm: Wp, heightMm: Hp };
}

function text(x: number, y: number, fs: number, content: string, anchor: 'start' | 'middle' | 'end', fill: string, bold = false): string {
  const anchorAttr = anchor !== 'start' ? ` text-anchor="${anchor}"` : '';
  const boldAttr = bold ? ' font-weight="bold"' : '';
  return `<text x="${fmt(x)}" y="${fmt(y)}" font-size="${fs}"${anchorAttr}${boldAttr} fill="${fill}" font-family="monospace">${escapeXml(content)}</text>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
